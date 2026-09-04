"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminAction } from "@/lib/auth/admin";
import { notFound, validation } from "@/lib/errors";

export const setOrgBlocked = adminAction(
  z.object({ orgId: z.string().min(1), blocked: z.boolean() }),
  async (input) => {
    const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
    if (!org) throw notFound("Empresa não encontrada");
    await prisma.organization.update({
      where: { id: input.orgId },
      data: { blockedAt: input.blocked ? new Date() : null },
    });
    revalidatePath("/dashboard");
    return { blocked: input.blocked };
  },
);

export const setOrgLimits = adminAction(
  z.object({
    orgId: z.string().min(1),
    mediaLimit: z.number().int().min(1).max(100_000),
    uploadLimitMb: z.number().int().min(10).max(4096),
    storageLimitMb: z.number().int().min(64).max(1_048_576),
  }),
  async (input) => {
    const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
    if (!org) throw notFound("Empresa não encontrada");
    await prisma.organization.update({
      where: { id: input.orgId },
      data: {
        mediaLimit: input.mediaLimit,
        uploadLimitMb: input.uploadLimitMb,
        storageLimitMb: input.storageLimitMb,
      },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  },
);

export const setUserBlocked = adminAction(
  z.object({ userId: z.string().min(1), blocked: z.boolean() }),
  async (input, admin) => {
    if (input.userId === admin.id) throw validation("Você não pode bloquear a si mesmo.");
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw notFound("Usuário não encontrado");
    if (user.isSuperAdmin && input.blocked) {
      throw validation("Remova a permissão de administrador antes de bloquear.");
    }
    await prisma.user.update({
      where: { id: input.userId },
      data: { blockedAt: input.blocked ? new Date() : null },
    });
    revalidatePath("/dashboard");
    return { blocked: input.blocked };
  },
);

export const setUserSuperAdmin = adminAction(
  z.object({ userId: z.string().min(1), value: z.boolean() }),
  async (input, admin) => {
    if (input.userId === admin.id) throw validation("Você não pode alterar a sua própria permissão.");
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw notFound("Usuário não encontrado");

    if (!input.value) {
      const others = await prisma.user.count({
        where: { isSuperAdmin: true, id: { not: input.userId } },
      });
      if (others === 0) throw validation("Precisa existir pelo menos um administrador do sistema.");
    }
    await prisma.user.update({ where: { id: input.userId }, data: { isSuperAdmin: input.value } });
    revalidatePath("/dashboard");
    return { value: input.value };
  },
);
