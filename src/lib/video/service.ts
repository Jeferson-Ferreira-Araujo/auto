import type { PublishVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { AppError, notFound, validation } from "@/lib/errors";
import { deleteObject } from "@/lib/storage/r2";
import { autoPickPreset, type PresetName } from "./presets";
import { dispatchWorker } from "./dispatch";

const log = childLogger({ mod: "video/service" });

const STUCK_MS = 15 * 60 * 1000;
const MERGE_MIN = 2;
const MERGE_MAX = 8;

export const VideoProcessingService = {
  /** Cria um job de melhoria e acorda o worker. */
  async requestEnhancement(
    organizationId: string,
    mediaAssetId: string,
    opts: {
      preset?: PresetName;
      auto?: boolean;
      titleText?: string | null;
      includeLogo?: boolean;
      stripAudio?: boolean;
    },
  ) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Vídeo não encontrado");
    if (media.type !== "VIDEO") throw validation("Só é possível melhorar vídeos.");
    if (media.processingStatus !== "READY") throw validation("Este vídeo ainda não está pronto.");

    const preset: PresetName =
      opts.preset ??
      autoPickPreset({
        durationSec: media.duration ?? 0,
        width: media.width ?? 0,
        height: media.height ?? 0,
        hasAudio: true,
      });

    // Cancela jobs abertos anteriores desta mídia.
    await prisma.videoJob.updateMany({
      where: { mediaAssetId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", errorMessage: "Substituído por um novo pedido." },
    });

    const job = await prisma.videoJob.create({
      data: {
        organizationId,
        mediaAssetId,
        preset,
        autoMode: Boolean(opts.auto),
        titleText: opts.titleText?.trim() || null,
        includeLogo: Boolean(opts.includeLogo),
        stripAudio: Boolean(opts.stripAudio),
        status: "PENDING",
      },
    });

    const dispatched = await dispatchWorker();
    if (dispatched) {
      await prisma.videoJob.update({ where: { id: job.id }, data: { dispatchedAt: new Date() } });
    }
    log.info({ jobId: job.id, preset, dispatched }, "job de vídeo criado");
    return job;
  },

  /**
   * Cria um job de MERGE: junta vários vídeos (já enviados ao R2) num único Reel 9:16 sem áudio.
   * Cria um MediaAsset placeholder (PENDING) que o worker preenche ao concluir.
   */
  async requestMerge(
    organizationId: string,
    input: { inputStorageKeys: string[]; name?: string | null; timezone?: string },
  ) {
    const keys = input.inputStorageKeys;
    if (keys.length < MERGE_MIN || keys.length > MERGE_MAX) {
      throw validation(`Escolha de ${MERGE_MIN} a ${MERGE_MAX} vídeos para juntar.`);
    }
    const prefix = `org/${organizationId}/media/`;
    if (!keys.every((k) => k.startsWith(prefix))) {
      throw validation("Um dos arquivos enviados é inválido.");
    }
    if (new Set(keys).size !== keys.length) {
      throw validation("Há vídeos repetidos na lista.");
    }

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const count = await prisma.mediaAsset.count({ where: { organizationId } });
    if (count >= org.mediaLimit) {
      throw new AppError("RATE_LIMITED", `Limite de ${org.mediaLimit} mídias atingido para esta empresa.`);
    }

    const now = new Date();
    const stamp = new Intl.DateTimeFormat("pt-BR", {
      timeZone: input.timezone ?? org.timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);

    const asset = await prisma.mediaAsset.create({
      data: {
        organizationId,
        type: "VIDEO",
        name: input.name?.trim() || `Vídeo juntado — ${stamp}`,
        storageKey: "",
        mimeType: "video/mp4",
        fileSize: 0,
        processingStatus: "PENDING",
        processingNote: "Juntando vídeos…",
      },
    });

    const job = await prisma.videoJob.create({
      data: {
        organizationId,
        mediaAssetId: asset.id,
        kind: "MERGE",
        inputStorageKeys: keys,
        status: "PENDING",
      },
    });
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { activeVideoJobId: job.id } });

    const dispatched = await dispatchWorker();
    if (dispatched) {
      await prisma.videoJob.update({ where: { id: job.id }, data: { dispatchedAt: new Date() } });
    }
    log.info({ jobId: job.id, clips: keys.length, dispatched }, "job de merge criado");
    return { jobId: job.id, mediaAssetId: asset.id, status: job.status };
  },

  async getJob(organizationId: string, jobId: string) {
    const job = await prisma.videoJob.findFirst({ where: { id: jobId, organizationId } });
    if (!job) throw notFound("Job não encontrado");
    return job;
  },

  /**
   * (Re)cria um job WATERMARK para um vídeo: liga a marca e marca a versão atual como obsoleta.
   * A imagem da marca e os parâmetros (posição/tamanho/opacidade) vêm de `media_assets`/`organizations`.
   */
  async requestWatermark(organizationId: string, mediaAssetId: string) {
    const [media, org] = await Promise.all([
      prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } }),
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    ]);
    if (!media) throw notFound("Vídeo não encontrado");
    if (media.type !== "VIDEO") throw validation("Este fluxo é só para vídeos.");
    if (!org.watermarkStorageKey) {
      throw new AppError("VALIDATION", "Envie a imagem da marca d'água em Configurações primeiro.");
    }

    await prisma.videoJob.updateMany({
      where: { mediaAssetId, kind: "WATERMARK", status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", errorMessage: "Substituído por um novo pedido." },
    });
    if (media.watermarkedStorageKey) await deleteObject(media.watermarkedStorageKey).catch(() => {});
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { watermarkedStorageKey: null },
    });

    const job = await prisma.videoJob.create({
      data: { organizationId, mediaAssetId, kind: "WATERMARK", status: "PENDING" },
    });
    const dispatched = await dispatchWorker();
    if (dispatched) {
      await prisma.videoJob.update({ where: { id: job.id }, data: { dispatchedAt: new Date() } });
    }
    log.info({ jobId: job.id, mediaAssetId, dispatched }, "job de marca d'água criado");
    return { jobId: job.id, status: job.status };
  },

  /** Garante que existe um job WATERMARK pendente (usado pela publicação ao adiar). */
  async ensureWatermarkJob(mediaAssetId: string): Promise<"pending" | "failed"> {
    const open = await prisma.videoJob.findFirst({
      where: { mediaAssetId, kind: "WATERMARK", status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (open) return "pending";

    const lastFailed = await prisma.videoJob.findFirst({
      where: { mediaAssetId, kind: "WATERMARK", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    if (lastFailed && (lastFailed.attempts ?? 0) >= 3) return "failed";

    const media = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) return "failed";
    const job = await prisma.videoJob.create({
      data: {
        organizationId: media.organizationId,
        mediaAssetId,
        kind: "WATERMARK",
        status: "PENDING",
      },
    });
    const dispatched = await dispatchWorker();
    if (dispatched) {
      await prisma.videoJob.update({ where: { id: job.id }, data: { dispatchedAt: new Date() } });
    }
    return "pending";
  },

  /** Desliga a marca d'água de um vídeo e apaga a versão renderizada. */
  async disableWatermark(organizationId: string, mediaAssetId: string) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Mídia não encontrada");
    await prisma.videoJob.updateMany({
      where: { mediaAssetId, kind: "WATERMARK", status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", errorMessage: "Marca d'água desligada." },
    });
    if (media.watermarkedStorageKey) await deleteObject(media.watermarkedStorageKey).catch(() => {});
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { watermarkEnabled: false, watermarkedStorageKey: null },
    });
    return { disabled: true };
  },

  async setPublishVariant(organizationId: string, mediaAssetId: string, variant: PublishVariant) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Vídeo não encontrado");
    if (variant === "ENHANCED" && !media.enhancedStorageKey) {
      throw new AppError("VALIDATION", "Ainda não há uma versão melhorada deste vídeo.");
    }
    await prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: { publishVariant: variant } });
    // A marca foi renderizada sobre a fonte antiga → refaz sobre a nova.
    if (media.watermarkEnabled) {
      await this.requestWatermark(organizationId, mediaAssetId).catch(() => {});
    }
    return { variant };
  },

  /** Descarta a versão melhorada e volta para o original. */
  async revertToOriginal(organizationId: string, mediaAssetId: string) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Vídeo não encontrado");
    await Promise.all(
      [media.enhancedStorageKey, media.enhancedThumbnailKey, media.watermarkedStorageKey]
        .filter((k): k is string => Boolean(k))
        .map((k) => deleteObject(k)),
    );
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        publishVariant: "ORIGINAL",
        enhancedStorageKey: null,
        enhancedThumbnailKey: null,
        enhancedDurationSec: null,
        activeVideoJobId: null,
        watermarkedStorageKey: null,
      },
    });
    if (media.watermarkEnabled) {
      await this.requestWatermark(organizationId, mediaAssetId).catch(() => {});
    }
    return { reverted: true };
  },

  /** Recupera jobs presos (chamado pelo cron). */
  async retryStuck() {
    const cutoff = new Date(Date.now() - STUCK_MS);
    const stuck = await prisma.videoJob.updateMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        updatedAt: { lt: cutoff },
        attempts: { lt: 3 },
      },
      data: { status: "PENDING", progress: 0 },
    });
    const toFail = await prisma.videoJob.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] }, updatedAt: { lt: cutoff }, attempts: { gte: 3 } },
      select: { id: true, kind: true, mediaAssetId: true },
    });
    const failed = await prisma.videoJob.updateMany({
      where: { id: { in: toFail.map((j) => j.id) } },
      data: { status: "FAILED", errorMessage: "Tempo esgotado no processamento." },
    });
    // Merge: o asset placeholder não tem original — marca como falho para o usuário poder excluí-lo.
    const mergeAssetIds = toFail.filter((j) => j.kind === "MERGE").map((j) => j.mediaAssetId);
    if (mergeAssetIds.length > 0) {
      await prisma.mediaAsset.updateMany({
        where: { id: { in: mergeAssetIds } },
        data: {
          processingStatus: "FAILED",
          processingError: "Não foi possível juntar os vídeos. Tente novamente.",
          activeVideoJobId: null,
        },
      });
    }
    if (stuck.count > 0) await dispatchWorker();
    return { requeued: stuck.count, failed: failed.count };
  },
};
