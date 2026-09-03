import type { PostSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, validation } from "@/lib/errors";

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
