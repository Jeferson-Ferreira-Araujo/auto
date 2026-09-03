"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { conflict, notFound } from "@/lib/errors";
import { categorySchema, updateCategorySchema } from "@/lib/validation/schemas";
import { z } from "zod";

export const createCategory = orgAction(categorySchema, async (input, { org }) => {
  const exists = await prisma.mediaCategory.findUnique({
    where: { organizationId_name: { organizationId: org.id, name: input.name } },
  });
  if (exists) throw conflict("Já existe uma categoria com esse nome.");
  const category = await prisma.mediaCategory.create({
    data: { organizationId: org.id, name: input.name },
  });
  revalidatePath("/categorias");
  return category;
});

export const updateCategory = orgAction(updateCategorySchema, async (input, { org }) => {
  const category = await prisma.mediaCategory.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!category) throw notFound("Categoria não encontrada");
  const updated = await prisma.mediaCategory.update({
    where: { id: category.id },
    data: {
      name: input.name ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });
  revalidatePath("/categorias");
  return updated;
});

export const deleteCategory = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const category = await prisma.mediaCategory.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!category) throw notFound("Categoria não encontrada");
  await prisma.mediaCategory.delete({ where: { id: category.id } });
  revalidatePath("/categorias");
  return { id: category.id };
});
