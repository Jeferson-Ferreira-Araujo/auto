import type { ExpirationOutcome, Product } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound, validation } from "@/lib/errors-core";

/** Acha o produto por código de barras (escopo da org) ou cria um novo. */
export async function findOrCreateProduct(
  organizationId: string,
  createdById: string,
  input: { productId?: string; barcode?: string | null; name?: string | null },
): Promise<Product> {
  if (input.productId) {
    const p = await prisma.product.findFirst({ where: { id: input.productId, organizationId } });
    if (!p) throw notFound("Produto não encontrado.");
    return p;
  }

  const barcode = input.barcode?.trim() || null;
  if (barcode) {
    const existing = await prisma.product.findFirst({ where: { organizationId, barcode } });
    if (existing) return existing;
  }

  const name = input.name?.trim();
  if (!name) throw validation("Informe o nome do produto ou escaneie um código já cadastrado.");

  return prisma.product.create({
    data: { organizationId, createdById, name, barcode },
  });
}

export async function registerExpiration(
  organizationId: string,
  createdById: string,
  input: {
    productId?: string;
    barcode?: string | null;
    productName?: string | null;
    quantity: number;
    expirationDate: Date;
    lot?: string | null;
    location?: string | null;
  },
) {
  const product = await findOrCreateProduct(organizationId, createdById, {
    productId: input.productId,
    barcode: input.barcode,
    name: input.productName,
  });
  if (!product.active) {
    await prisma.product.update({ where: { id: product.id }, data: { active: true } });
  }

  return prisma.productExpiration.create({
    data: {
      organizationId,
      productId: product.id,
      createdById,
      quantity: input.quantity,
      expirationDate: input.expirationDate,
      lot: input.lot?.trim() || null,
      location: input.location?.trim() || null,
    },
    include: { product: { select: { name: true, barcode: true } } },
  });
}

export async function resolveExpiration(
  organizationId: string,
  id: string,
  outcome: Exclude<ExpirationOutcome, "PENDING">,
) {
  const exp = await prisma.productExpiration.findFirst({ where: { id, organizationId } });
  if (!exp) throw notFound("Registro de validade não encontrado.");
  if (exp.outcome !== "PENDING") throw conflict("Este registro já foi resolvido.");

  return prisma.productExpiration.update({
    where: { id },
    data: { outcome, resolvedAt: new Date() },
  });
}
