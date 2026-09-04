import type { PublishVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { AppError, notFound, validation } from "@/lib/errors";
import { deleteObject } from "@/lib/storage/r2";
import { autoPickPreset, type PresetName } from "./presets";
import { dispatchWorker } from "./dispatch";

const log = childLogger({ mod: "video/service" });

const STUCK_MS = 15 * 60 * 1000;

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

  async getJob(organizationId: string, jobId: string) {
    const job = await prisma.videoJob.findFirst({ where: { id: jobId, organizationId } });
    if (!job) throw notFound("Job não encontrado");
    return job;
  },

  async setPublishVariant(organizationId: string, mediaAssetId: string, variant: PublishVariant) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Vídeo não encontrado");
    if (variant === "ENHANCED" && !media.enhancedStorageKey) {
      throw new AppError("VALIDATION", "Ainda não há uma versão melhorada deste vídeo.");
    }
    await prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: { publishVariant: variant } });
    return { variant };
  },

  /** Descarta a versão melhorada e volta para o original. */
  async revertToOriginal(organizationId: string, mediaAssetId: string) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId } });
    if (!media) throw notFound("Vídeo não encontrado");
    await Promise.all(
      [media.enhancedStorageKey, media.enhancedThumbnailKey]
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
      },
    });
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
    const failed = await prisma.videoJob.updateMany({
      where: { status: { in: ["PENDING", "PROCESSING"] }, updatedAt: { lt: cutoff }, attempts: { gte: 3 } },
      data: { status: "FAILED", errorMessage: "Tempo esgotado no processamento." },
    });
    if (stuck.count > 0) await dispatchWorker();
    return { requeued: stuck.count, failed: failed.count };
  },
};
