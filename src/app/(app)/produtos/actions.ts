"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { revalidateOrg } from "@/lib/cache";
import { notFound, validation } from "@/lib/errors";
import {
  registerExpirationSchema,
  resolveExpirationSchema,
  lookupProductSchema,
  productSchema,
  setProductImageSchema,
} from "@/lib/validation/schemas";
import * as products from "@/lib/products/service";
import { buildKey, deleteObject, putObject } from "@/lib/storage/r2";

function bump(orgId: string) {
  revalidatePath("/produtos");
  revalidatePath("/dashboard");
  revalidateOrg(orgId, "products", "dashboard");
}

export const registerExpiration = orgAction(registerExpirationSchema, async (input, { org, user }) => {
  const exp = await products.registerExpiration(org.id, user.id, {
    productId: input.productId,
    barcode: input.barcode ?? null,
    productName: input.productName ?? null,
    quantity: input.quantity,
    expirationDate: input.expirationDate,
    lot: input.lot ?? null,
    location: input.location ?? null,
  });
  bump(org.id);
  return { id: exp.id, productId: exp.productId, productName: exp.product.name };
});

const IMAGE_MIME: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Salva/atualiza a foto do produto (data URL já reduzida no navegador) no R2. */
export const setProductImage = orgAction(setProductImageSchema, async (input, { org }) => {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: org.id },
    select: { id: true, imageKey: true },
  });
  if (!product) throw notFound("Produto não encontrado.");

  const match = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
  if (!match) throw validation("Formato de imagem inválido.");
  const [, subtype, b64] = match;
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length > 900_000) throw validation("Imagem muito grande. Tente novamente.");

  const key = buildKey(org.id, "product", subtype === "jpeg" ? "jpg" : subtype);
  await putObject(key, buffer, IMAGE_MIME[subtype]);

  const previous = product.imageKey;
  await prisma.product.update({ where: { id: product.id }, data: { imageKey: key } });
  if (previous && previous !== key) await deleteObject(previous);

  bump(org.id);
  return { productId: product.id };
});

export const resolveExpiration = orgAction(resolveExpirationSchema, async (input, { org }) => {
  await products.resolveExpiration(org.id, input.id, input.outcome);
  bump(org.id);
  return { id: input.id };
});

export const lookupProduct = orgAction(lookupProductSchema, async (input, { org }) => {
  const product = await prisma.product.findFirst({
    where: { organizationId: org.id, barcode: input.barcode },
    select: { id: true, name: true, barcode: true },
  });
  return { product };
});

export const upsertProduct = orgAction(productSchema, async (input, { org, user }) => {
  if (input.id) {
    const existing = await prisma.product.findFirst({ where: { id: input.id, organizationId: org.id } });
    if (!existing) throw notFound("Produto não encontrado.");
    await prisma.product.update({
      where: { id: input.id },
      data: { name: input.name, barcode: input.barcode ?? null, active: input.active ?? existing.active },
    });
    bump(org.id);
    return { id: input.id };
  }
  const created = await prisma.product.create({
    data: { organizationId: org.id, createdById: user.id, name: input.name, barcode: input.barcode ?? null },
  });
  bump(org.id);
  return { id: created.id };
});

export const reactivateProduct = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const p = await prisma.product.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!p) throw notFound("Produto não encontrado.");
  await prisma.product.update({ where: { id: input.id }, data: { active: true } });
  bump(org.id);
  return { id: input.id };
});
