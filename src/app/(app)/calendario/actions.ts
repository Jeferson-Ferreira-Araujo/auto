"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { notFound, validation, conflict } from "@/lib/errors";
import { manualScheduleSchema, updateScheduledPostSchema } from "@/lib/validation/schemas";

const EDITABLE = ["DRAFT", "SCHEDULED", "FAILED"] as const;

export const createManualPost = orgAction(manualScheduleSchema, async (input, { org }) => {
  const [account, media] = await Promise.all([
    prisma.instagramAccount.findFirst({ where: { id: input.instagramAccountId, organizationId: org.id } }),
    prisma.mediaAsset.findFirst({ where: { id: input.mediaAssetId, organizationId: org.id } }),
  ]);
  if (!account) throw validation("Conta do Instagram inválida.");
  if (account.status !== "CONNECTED") throw validation("A conta do Instagram precisa estar conectada.");
  if (!media) throw validation("Mídia inválida.");
  if (media.processingStatus !== "READY") throw validation("Esta mídia não está pronta para publicação.");

  const post = await prisma.scheduledPost.create({
    data: {
      organizationId: org.id,
      instagramAccountId: account.id,
      mediaAssetId: media.id,
      source: "MANUAL",
      caption: input.caption ?? media.caption ?? null,
      scheduledAt: input.scheduledAt,
      status: "SCHEDULED",
    },
  });
  revalidatePath("/calendario");
  return { id: post.id };
});

export const updateScheduledPost = orgAction(updateScheduledPostSchema, async (input, { org }) => {
  const post = await prisma.scheduledPost.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!post) throw notFound("Publicação não encontrada");
  if (!(EDITABLE as readonly string[]).includes(post.status)) {
    throw conflict("Esta publicação não pode mais ser editada.");
  }

  if (input.mediaAssetId) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: input.mediaAssetId, organizationId: org.id } });
    if (!media || media.processingStatus !== "READY") throw validation("Mídia inválida ou não pronta.");
  }
  if (input.scheduledAt && input.scheduledAt.getTime() < Date.now() + 30_000) {
    throw validation("Escolha um horário no futuro.");
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      caption: input.caption === undefined ? undefined : input.caption,
      mediaAssetId: input.mediaAssetId ?? undefined,
      scheduledAt: input.scheduledAt ?? undefined,
      // reeditou uma que falhou: volta para a fila
      status: post.status === "FAILED" ? "SCHEDULED" : undefined,
      retryCount: post.status === "FAILED" ? 0 : undefined,
      nextAttemptAt: null,
      errorMessage: post.status === "FAILED" ? null : undefined,
    },
  });
  revalidatePath("/calendario");
  return { id: post.id };
});

export const cancelScheduledPost = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const post = await prisma.scheduledPost.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!post) throw notFound("Publicação não encontrada");
  if (post.status === "PUBLISHED" || post.status === "PROCESSING") {
    throw conflict("Não é possível cancelar uma publicação que já está sendo publicada ou foi publicada.");
  }
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "CANCELLED", errorMessage: "Cancelada pelo usuário." },
  });
  revalidatePath("/calendario");
  return { id: post.id };
});
