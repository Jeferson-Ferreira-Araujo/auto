"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { conflict, notFound, validation } from "@/lib/errors";
import { categorySchema, updateCategorySchema, deleteCategorySchema } from "@/lib/validation/schemas";
import { loadCategoryTree, siblingNameTaken, descendantIds } from "@/lib/categories";
import { revalidateOrg } from "@/lib/cache";

function bump(orgId: string) {
  revalidatePath("/categorias");
  revalidatePath("/biblioteca");
  revalidatePath("/automacoes");
  // a árvore muda e a contagem de categorias no dashboard muda
  revalidateOrg(orgId, "categories", "dashboard");
}

export const createCategory = orgAction(categorySchema, async (input, { org }) => {
  const parentId = input.parentId ?? null;
  const all = await loadCategoryTree(org.id);

  if (parentId && !all.some((c) => c.id === parentId)) {
    throw validation("Categoria-pai inválida.");
  }
  if (siblingNameTaken(all, parentId, input.name)) {
    throw conflict("Já existe uma categoria com esse nome nesse nível.");
  }

  const category = await prisma.mediaCategory.create({
    data: { organizationId: org.id, parentId, name: input.name },
  });
  bump(org.id);
  return { id: category.id };
});

export const updateCategory = orgAction(updateCategorySchema, async (input, { org }) => {
  const category = await prisma.mediaCategory.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!category) throw notFound("Categoria não encontrada");

  if (input.name && input.name !== category.name) {
    const all = await loadCategoryTree(org.id);
    if (siblingNameTaken(all, category.parentId, input.name, category.id)) {
      throw conflict("Já existe uma categoria com esse nome nesse nível.");
    }
  }

  const updated = await prisma.mediaCategory.update({
    where: { id: category.id },
    data: { name: input.name ?? undefined, isActive: input.isActive ?? undefined },
  });
  bump(org.id);
  return { id: updated.id };
});

export const deleteCategory = orgAction(deleteCategorySchema, async (input, { org }) => {
  const category = await prisma.mediaCategory.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!category) throw notFound("Categoria não encontrada");

  const all = await loadCategoryTree(org.id);
  const subtree = descendantIds(all, category.id);
  const childCount = subtree.length - 1;
  if (childCount > 0 && !input.withChildren) {
    throw conflict(`Esta categoria tem ${childCount} subcategoria(s). Confirme a exclusão em cascata.`);
  }

  // ON DELETE CASCADE remove a subárvore; mídias ficam com categoryId = null.
  await prisma.mediaCategory.delete({ where: { id: category.id } });
  bump(org.id);
  return { id: category.id, removed: subtree.length };
});
