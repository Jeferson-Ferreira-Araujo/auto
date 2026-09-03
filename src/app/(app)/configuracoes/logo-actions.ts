"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { validation } from "@/lib/errors";
import { buildKey, presignPut, deleteObject } from "@/lib/storage/r2";

export const getLogoUploadUrl = orgAction(
  z.object({ mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]) }),
  async (input, { org }) => {
    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const key = buildKey(org.id, "logo", ext);
    const url = await presignPut(key, input.mimeType, 600);
    return { url, key };
  },
);

export const setOrgLogo = orgAction(z.object({ key: z.string().min(1) }), async (input, { org }) => {
  if (!input.key.startsWith(`org/${org.id}/logo/`)) throw validation("Chave inválida.");
  const current = await prisma.organization.findUnique({ where: { id: org.id }, select: { logoStorageKey: true } });
  await prisma.organization.update({ where: { id: org.id }, data: { logoStorageKey: input.key } });
  if (current?.logoStorageKey && current.logoStorageKey !== input.key) await deleteObject(current.logoStorageKey);
  revalidatePath("/configuracoes");
  return { key: input.key };
});

export const removeOrgLogo = orgAction(z.object({}), async (_input, { org }) => {
  const current = await prisma.organization.findUnique({ where: { id: org.id }, select: { logoStorageKey: true } });
  await prisma.organization.update({ where: { id: org.id }, data: { logoStorageKey: null } });
  if (current?.logoStorageKey) await deleteObject(current.logoStorageKey);
  revalidatePath("/configuracoes");
  return { removed: true };
});
