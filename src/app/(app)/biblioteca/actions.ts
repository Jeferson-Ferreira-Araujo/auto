"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { notFound, validation } from "@/lib/errors";
import { confirmUploadSchema, updateMediaSchema } from "@/lib/validation/schemas";
import { ingestUpload } from "@/lib/media/ingest";
import { deleteObject } from "@/lib/storage/r2";

export const confirmUpload = orgAction(confirmUploadSchema, async (input, { org }) => {
  // A chave precisa pertencer à pasta da organização.
  if (!input.storageKey.startsWith(`org/${org.id}/media/`)) {
    throw validation("Chave de upload inválida.");
  }
  const asset = await ingestUpload({
    organizationId: org.id,
    storageKey: input.storageKey,
    originalName: input.originalName,
    declaredMime: input.declaredMime,
    fileSize: input.fileSize,
  });
  revalidatePath("/biblioteca");
  return { id: asset.id, processingStatus: asset.processingStatus, processingError: asset.processingError };
});

export const updateMedia = orgAction(updateMediaSchema, async (input, { org }) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!asset) throw notFound("Mídia não encontrada");

  if (input.categoryId) {
    const cat = await prisma.mediaCategory.findFirst({ where: { id: input.categoryId, organizationId: org.id } });
    if (!cat) throw validation("Categoria inválida.");
  }
  if (input.availableFrom && input.availableUntil && input.availableFrom > input.availableUntil) {
    throw validation("A data inicial deve ser anterior à data final.");
  }

  const updated = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      name: input.name ?? undefined,
      caption: input.caption === undefined ? undefined : input.caption,
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      isActive: input.isActive ?? undefined,
      availableFrom: input.availableFrom === undefined ? undefined : input.availableFrom,
      availableUntil: input.availableUntil === undefined ? undefined : input.availableUntil,
    },
  });
  revalidatePath("/biblioteca");
  return updated;
});

export const deleteMedia = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!asset) throw notFound("Mídia não encontrada");

  const pending = await prisma.scheduledPost.count({
    where: { mediaAssetId: asset.id, status: { in: ["SCHEDULED", "PROCESSING", "DRAFT"] } },
  });
  if (pending > 0) {
    throw validation("Há publicações agendadas usando esta mídia. Cancele-as antes de excluir.");
  }

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  await Promise.all(
    [asset.storageKey, asset.processedStorageKey, asset.thumbnailKey]
      .filter((k): k is string => Boolean(k))
      .map((k) => deleteObject(k)),
  );
  revalidatePath("/biblioteca");
  return { id: asset.id };
});
