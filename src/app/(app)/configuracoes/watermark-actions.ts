"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { validation } from "@/lib/errors";
import { buildKey, presignPut, deleteObject } from "@/lib/storage/r2";

export const getWatermarkUploadUrl = orgAction(
  z.object({ mimeType: z.enum(["image/png", "image/webp"]) }),
  async (input, { org }) => {
    const ext = input.mimeType === "image/png" ? "png" : "webp";
    const key = buildKey(org.id, "watermark", ext);
    const url = await presignPut(key, input.mimeType, 600);
    return { url, key };
  },
);

/** Invalida as versões com marca já geradas: serão reconstruídas sob demanda. */
async function invalidateWatermarked(organizationId: string) {
  const stale = await prisma.mediaAsset.findMany({
    where: { organizationId, watermarkedStorageKey: { not: null } },
    select: { watermarkedStorageKey: true },
  });
  await prisma.mediaAsset.updateMany({
    where: { organizationId, watermarkedStorageKey: { not: null } },
    data: { watermarkedStorageKey: null },
  });
  await Promise.all(
    stale
      .map((s) => s.watermarkedStorageKey)
      .filter((k): k is string => Boolean(k))
      .map((k) => deleteObject(k).catch(() => {})),
  );
}

export const setOrgWatermark = orgAction(z.object({ key: z.string().min(1) }), async (input, { org }) => {
  if (!input.key.startsWith(`org/${org.id}/watermark/`)) throw validation("Chave inválida.");
  const current = await prisma.organization.findUnique({
    where: { id: org.id },
    select: { watermarkStorageKey: true },
  });
  await prisma.organization.update({ where: { id: org.id }, data: { watermarkStorageKey: input.key } });
  if (current?.watermarkStorageKey && current.watermarkStorageKey !== input.key) {
    await deleteObject(current.watermarkStorageKey).catch(() => {});
  }
  await invalidateWatermarked(org.id);
  revalidatePath("/configuracoes");
  revalidatePath("/biblioteca");
  return { key: input.key };
});

export const removeOrgWatermark = orgAction(z.object({}), async (_input, { org }) => {
  const current = await prisma.organization.findUnique({
    where: { id: org.id },
    select: { watermarkStorageKey: true },
  });
  await prisma.organization.update({ where: { id: org.id }, data: { watermarkStorageKey: null } });
  if (current?.watermarkStorageKey) await deleteObject(current.watermarkStorageKey).catch(() => {});
  // sem imagem de marca não dá para renderizar: desliga a marca de todas as mídias
  await prisma.mediaAsset.updateMany({
    where: { organizationId: org.id, watermarkEnabled: true },
    data: { watermarkEnabled: false },
  });
  await invalidateWatermarked(org.id);
  revalidatePath("/configuracoes");
  revalidatePath("/biblioteca");
  return { removed: true };
});
