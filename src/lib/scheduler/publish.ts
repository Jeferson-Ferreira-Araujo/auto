import { Prisma, type ScheduledPost } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { presignGet, getObjectBytes, putObject, buildKey } from "@/lib/storage/r2";
import { publishKeys } from "@/lib/media/variant";
import { renderImageWatermark } from "@/lib/media/watermark-render";
import { InstagramService } from "@/lib/instagram/service";
import { getValidAccessToken, markAccountExpired } from "@/lib/instagram/account";
import { InstagramApiError, isAuthError } from "@/lib/instagram/errors";
import { VideoProcessingService } from "@/lib/video/service";

const log = childLogger({ mod: "scheduler/publish" });

const CLAIM_BATCH = 5;
const STATUS_POLLS_PER_RUN = 3;
const STATUS_POLL_DELAY_MS = 4000;
const BACKOFF_BASE_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PublishSummary = {
  claimed: number;
  published: number;
  deferred: number;
  failed: number;
  cancelledWhilePaused: number;
};

/** Ponto de entrada do cron de publicação. */
export async function runPublish(now = new Date()): Promise<PublishSummary> {
  const summary: PublishSummary = { claimed: 0, published: 0, deferred: 0, failed: 0, cancelledWhilePaused: 0 };

  // 1. Cancela posts de automação muito atrasados enquanto a org está pausada.
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cancelled = await prisma.scheduledPost.updateMany({
    where: {
      status: "SCHEDULED",
      source: "AUTOMATION",
      scheduledAt: { lt: staleCutoff },
      organization: { autoPublishStatus: "PAUSED" },
    },
    data: { status: "CANCELLED", errorMessage: "Cancelado: publicação automática estava pausada." },
  });
  summary.cancelledWhilePaused = cancelled.count;

  // 2. Reivindica posts vencidos de forma atômica (um worker por linha).
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "scheduled_posts" SET "status" = 'PROCESSING', "lockedAt" = now(), "updatedAt" = now()
    WHERE "id" IN (
      SELECT sp."id" FROM "scheduled_posts" sp
      JOIN "organizations" o ON o."id" = sp."organizationId"
      WHERE sp."status" = 'SCHEDULED'
        AND sp."scheduledAt" <= now()
        AND (sp."nextAttemptAt" IS NULL OR sp."nextAttemptAt" <= now())
        AND o."blockedAt" IS NULL
        AND (o."autoPublishStatus" = 'ACTIVE' OR sp."source" = 'MANUAL')
      ORDER BY sp."scheduledAt" ASC
      LIMIT ${CLAIM_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id";
  `);
  summary.claimed = claimed.length;

  for (const { id } of claimed) {
    try {
      const outcome = await publishOne(id);
      summary[outcome]++;
    } catch (err) {
      log.error({ err, scheduledPostId: id }, "erro inesperado ao publicar");
      summary.failed++;
    }
  }

  if (summary.claimed || summary.cancelledWhilePaused) log.info(summary, "publish concluído");
  return summary;
}

type OneOutcome = "published" | "deferred" | "failed";

async function publishOne(id: string): Promise<OneOutcome> {
  const post = await prisma.scheduledPost.findUnique({
    where: { id },
    include: {
      mediaAsset: true,
      instagramAccount: true,
      organization: { select: { watermarkStorageKey: true } },
    },
  });
  if (!post) return "failed";

  // Idempotência: nunca republica.
  if (post.status === "PUBLISHED" || post.instagramMediaId) {
    await prisma.scheduledPost.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: post.publishedAt ?? new Date() },
    });
    return "published";
  }

  const l = childLogger({ scheduledPostId: id, attempt: post.retryCount + 1 });

  if (post.instagramAccount.status !== "CONNECTED") {
    return finalizeFailure(post, "Instagram desconectado. Reconecte a conta.", l, false);
  }

  // Marca d'água: precisa estar pronta ANTES de publicar.
  if (post.mediaAsset.watermarkEnabled && !post.mediaAsset.watermarkedStorageKey) {
    const wmOutcome = await ensureWatermarked(post, l);
    if (wmOutcome) return wmOutcome;
  }

  try {
    const token = await getValidAccessToken(post.instagramAccount);
    const igUserId = post.instagramAccount.igUserId;
    const { mediaKey } = publishKeys(post.mediaAsset);
    const mediaUrl = await presignGet(mediaKey, 7200);
    const caption = post.caption ?? post.mediaAsset.caption ?? undefined;

    // 1. Container (reutiliza se já existir).
    let containerId = post.instagramContainerId;
    if (!containerId) {
      containerId =
        post.mediaAsset.type === "IMAGE"
          ? await InstagramService.createImageContainer({ accessToken: token, igUserId, imageUrl: mediaUrl, caption })
          : await InstagramService.createReelContainer({ accessToken: token, igUserId, videoUrl: mediaUrl, caption });
      await prisma.scheduledPost.update({ where: { id }, data: { instagramContainerId: containerId } });
      await logAttempt(post, "CONTAINER", "SUCCESS", `container ${containerId}`);
    }

    // 2. Aguarda o processamento (algumas tentativas curtas por execução).
    let ready = false;
    for (let i = 0; i < STATUS_POLLS_PER_RUN; i++) {
      const { status, detail } = await InstagramService.getContainerStatus(token, containerId);
      if (status === "FINISHED") {
        ready = true;
        break;
      }
      if (status === "ERROR" || status === "EXPIRED") {
        await logAttempt(post, "STATUS", "ERROR", `status ${status}: ${detail ?? ""}`);
        return finalizeFailure(post, `A Meta rejeitou a mídia (${status}). ${detail ?? ""}`.trim(), l, true);
      }
      if (i < STATUS_POLLS_PER_RUN - 1) await sleep(STATUS_POLL_DELAY_MS);
    }

    if (!ready) {
      // Ainda processando: volta para SCHEDULED sem gastar retry; continua no próximo tick.
      await prisma.scheduledPost.update({
        where: { id },
        data: { status: "SCHEDULED", lockedAt: null, nextAttemptAt: new Date(Date.now() + 60_000) },
      });
      await logAttempt(post, "STATUS", "SUCCESS", "container ainda em processamento; reagendado");
      l.info("container em processamento, adiado");
      return "deferred";
    }

    // 3. Publica.
    const mediaId = await InstagramService.publishContainer(token, igUserId, containerId);

    await prisma.$transaction([
      prisma.scheduledPost.update({
        where: { id },
        data: { status: "PUBLISHED", instagramMediaId: mediaId, publishedAt: new Date(), errorMessage: null, lockedAt: null },
      }),
      prisma.mediaAsset.update({
        where: { id: post.mediaAssetId },
        data: { usageCount: { increment: 1 }, lastPublishedAt: new Date() },
      }),
    ]);
    await logAttempt(post, "PUBLISH", "SUCCESS", `mediaId ${mediaId}`);
    l.info({ mediaId }, "publicado com sucesso");
    return "published";
  } catch (err) {
    const meta = err instanceof InstagramApiError ? { metaCode: err.metaCode, fbtraceId: err.fbtraceId } : {};
    await logAttempt(post, "PUBLISH", "ERROR", err instanceof Error ? err.message : String(err), meta);

    if (isAuthError(err)) {
      await markAccountExpired(post.instagramAccountId);
      return finalizeFailure(post, "O acesso ao Instagram expirou. Reconecte a conta.", l, false);
    }
    const retryable = !(err instanceof InstagramApiError) || err.retryable;
    return finalizeFailure(post, err instanceof Error ? err.message : "Erro ao publicar", l, retryable);
  }
}

type PostWithRefs = ScheduledPost & {
  mediaAsset: import("@prisma/client").MediaAsset;
  organization: { watermarkStorageKey: string | null };
};

/**
 * Garante que a versão com marca d'água existe antes de publicar.
 * Retorna um outcome quando o post foi adiado/falhou; null quando já pode seguir.
 */
async function ensureWatermarked(
  post: PostWithRefs,
  l: ReturnType<typeof childLogger>,
): Promise<OneOutcome | null> {
  const wmKey = post.organization.watermarkStorageKey;
  if (!wmKey) return null; // sem imagem de marca: publica normal

  if (post.mediaAsset.type === "IMAGE") {
    try {
      const [baseBuf, wmBuf] = await Promise.all([
        getObjectBytes(post.mediaAsset.processedStorageKey ?? post.mediaAsset.storageKey),
        getObjectBytes(wmKey),
      ]);
      const out = await renderImageWatermark(baseBuf, wmBuf, {
        position: post.mediaAsset.watermarkPosition,
        size: post.mediaAsset.watermarkSize,
        opacityPct: post.mediaAsset.watermarkOpacity,
      });
      const key = buildKey(post.organizationId, "watermarked", "jpg");
      await putObject(key, out, "image/jpeg");
      await prisma.mediaAsset.update({
        where: { id: post.mediaAssetId },
        data: { watermarkedStorageKey: key },
      });
      post.mediaAsset.watermarkedStorageKey = key; // para o publishKeys() a seguir
      return null;
    } catch (err) {
      l.error({ err }, "falha ao renderizar marca d'água da imagem");
      return finalizeFailure(post, "Não foi possível aplicar a marca d'água. Confira a imagem em Configurações.", l, false);
    }
  }

  // Vídeo: depende do worker do GitHub Actions.
  const state = await VideoProcessingService.ensureWatermarkJob(post.mediaAssetId);
  if (state === "failed") {
    return finalizeFailure(post, "Não foi possível aplicar a marca d'água ao vídeo. Confira a imagem em Configurações.", l, false);
  }
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "SCHEDULED", lockedAt: null, nextAttemptAt: new Date(Date.now() + 90_000) },
  });
  await logAttempt(post, "CONTAINER", "SUCCESS", "aguardando a versão com marca d'água");
  l.info("marca d'água ainda processando; adiado");
  return "deferred";
}

/** Aplica retry/backoff ou marca FAILED em definitivo. */
async function finalizeFailure(
  post: ScheduledPost,
  message: string,
  l: ReturnType<typeof childLogger>,
  retryable: boolean,
): Promise<OneOutcome> {
  const nextRetry = post.retryCount + 1;
  const canRetry = retryable && nextRetry <= post.maxRetries;

  if (canRetry) {
    const delay = BACKOFF_BASE_MS * 2 ** post.retryCount;
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: "SCHEDULED",
        retryCount: nextRetry,
        nextAttemptAt: new Date(Date.now() + delay),
        errorMessage: message,
        lockedAt: null,
      },
    });
    l.warn({ nextRetry, delayMs: delay }, "falha; reagendado para retry");
    return "deferred";
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "FAILED", retryCount: nextRetry, errorMessage: message, lockedAt: null },
  });
  l.error({ message }, "falha definitiva");
  return "failed";
}

async function logAttempt(
  post: ScheduledPost,
  phase: "CONTAINER" | "STATUS" | "PUBLISH",
  outcome: "SUCCESS" | "ERROR",
  message: string,
  metaResponse?: unknown,
): Promise<void> {
  await prisma.publicationLog.create({
    data: {
      organizationId: post.organizationId,
      scheduledPostId: post.id,
      attempt: post.retryCount + 1,
      phase,
      outcome,
      message: message.slice(0, 1000),
      metaResponse: (metaResponse ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
