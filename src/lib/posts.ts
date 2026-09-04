import type { PostSource, PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, notFound, validation } from "@/lib/errors";

/** Status em que uma publicação ainda pode ser editada/remarcada/cancelada. */
export const EDITABLE_POST_STATUSES = ["DRAFT", "SCHEDULED", "FAILED"] as const;

export type CreateScheduledPostInput = {
  instagramAccountId?: string;
  mediaAssetId: string;
  caption?: string | null;
  scheduledAt: Date;
  source: PostSource;
  automationId?: string | null;
};

/**
 * Lógica pura de criação de um agendamento, escopada por organização.
 * Usada pela Server Action do calendário e pelo comando de WhatsApp.
 * Valida: conta do Instagram conectada + mídia pronta + horário no futuro.
 */
export async function createScheduledPost(organizationId: string, input: CreateScheduledPostInput) {
  const account = input.instagramAccountId
    ? await prisma.instagramAccount.findFirst({
        where: { id: input.instagramAccountId, organizationId },
      })
    : await prisma.instagramAccount.findFirst({ where: { organizationId } });

  if (!account) throw validation("Nenhuma conta do Instagram conectada nesta empresa.");
  if (account.status !== "CONNECTED") {
    throw validation("A conta do Instagram precisa estar conectada. Reconecte em Instagram.");
  }

  const media = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaAssetId, organizationId },
  });
  if (!media) throw validation("Mídia não encontrada.");
  if (media.processingStatus !== "READY") {
    throw validation("Esta mídia ainda não está pronta para publicação.");
  }

  if (input.scheduledAt.getTime() < Date.now() + 30_000) {
    throw new AppError("VALIDATION", "Escolha um horário no futuro.");
  }

  return prisma.scheduledPost.create({
    data: {
      organizationId,
      instagramAccountId: account.id,
      mediaAssetId: media.id,
      automationId: input.automationId ?? null,
      source: input.source,
      caption: input.caption ?? media.caption ?? null,
      scheduledAt: input.scheduledAt,
      status: "SCHEDULED",
    },
  });
}

/** Remarca uma publicação editável para um novo horário (futuro). Escopado por organização. */
export async function rescheduleScheduledPost(organizationId: string, postId: string, newWhen: Date) {
  const post = await prisma.scheduledPost.findFirst({ where: { id: postId, organizationId } });
  if (!post) throw notFound("Publicação não encontrada");
  if (!(EDITABLE_POST_STATUSES as readonly string[]).includes(post.status)) {
    throw conflict("Esta publicação não pode mais ser editada.");
  }
  if (newWhen.getTime() < Date.now() + 30_000) {
    throw new AppError("VALIDATION", "Escolha um horário no futuro.");
  }
  return prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      scheduledAt: newWhen,
      status: post.status === "FAILED" ? "SCHEDULED" : undefined,
      retryCount: post.status === "FAILED" ? 0 : undefined,
      nextAttemptAt: null,
      errorMessage: post.status === "FAILED" ? null : undefined,
    },
  });
}

/** Cancela uma publicação por id. Escopado por organização. */
export async function cancelScheduledPostById(organizationId: string, postId: string, reason = "Cancelada pelo usuário.") {
  const post = await prisma.scheduledPost.findFirst({ where: { id: postId, organizationId } });
  if (!post) throw notFound("Publicação não encontrada");
  if (post.status === "PUBLISHED" || post.status === "PROCESSING") {
    throw conflict("Não é possível cancelar uma publicação que já está sendo publicada ou foi publicada.");
  }
  return prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "CANCELLED", errorMessage: reason },
  });
}

/** Publicações editáveis num intervalo, opcionalmente filtradas por horário "HH:mm" no fuso da org. */
export async function findEditablePostsInRange(
  organizationId: string,
  from: Date,
  to: Date,
  opts?: { hhmm?: string; timeZone?: string },
) {
  const posts = await prisma.scheduledPost.findMany({
    where: {
      organizationId,
      scheduledAt: { gte: from, lt: to },
      status: { in: [...EDITABLE_POST_STATUSES] as PostStatus[] },
    },
    include: { mediaAsset: { select: { name: true, type: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  if (opts?.hhmm && opts.timeZone) {
    const tz = opts.timeZone;
    return posts.filter(
      (p) =>
        new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(
          p.scheduledAt,
        ) === opts.hhmm,
    );
  }
  return posts;
}
