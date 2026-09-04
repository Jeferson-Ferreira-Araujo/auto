"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { notFound, validation } from "@/lib/errors";
import { confirmUploadSchema, updateMediaSchema } from "@/lib/validation/schemas";
import { ingestUpload } from "@/lib/media/ingest";
import { deleteObject, getObjectBytes, buildKey, putObject } from "@/lib/storage/r2";
import { processMedia } from "@/lib/media/process";

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
    timezone: org.timezone,
  });
  revalidatePath("/biblioteca");
  return {
    id: asset.id,
    processingStatus: asset.processingStatus,
    processingError: asset.processingError,
    processingNote: asset.processingNote,
  };
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

/** Reprocessa uma mídia a partir do arquivo original (útil depois de melhorias no processamento). */
export const reprocessMedia = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!asset) throw notFound("Mídia não encontrada");

  const bytes = await getObjectBytes(asset.storageKey);
  const result = await processMedia(asset.type, bytes);

  let processedKey = asset.processedStorageKey;
  let thumbnailKey = asset.thumbnailKey;
  if (result.processed) {
    processedKey = buildKey(org.id, "processed", "jpg");
    await putObject(processedKey, result.processed.buffer, result.processed.mime);
  }
  if (result.thumbnail) {
    thumbnailKey = buildKey(org.id, "thumb", "jpg");
    await putObject(thumbnailKey, result.thumbnail, "image/jpeg");
  }

  const updated = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      processedStorageKey: processedKey,
      thumbnailKey,
      width: result.width ?? asset.width,
      height: result.height ?? asset.height,
      duration: result.duration ?? asset.duration,
      processingStatus: result.status,
      processingError: result.error ?? null,
      processingNote: result.note ?? null,
    },
  });
  revalidatePath("/biblioteca");
  return { id: updated.id, processingStatus: updated.processingStatus };
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
    [
      asset.storageKey,
      asset.processedStorageKey,
      asset.thumbnailKey,
      asset.enhancedStorageKey,
      asset.enhancedThumbnailKey,
      asset.watermarkedStorageKey,
    ]
      .filter((k): k is string => Boolean(k))
      .map((k) => deleteObject(k)),
  );
  revalidatePath("/biblioteca");
  return { id: asset.id };
});
