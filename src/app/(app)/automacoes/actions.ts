"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { revalidateOrg } from "@/lib/cache";
import { notFound, validation } from "@/lib/errors";
import { automationSchema, updateAutomationSchema } from "@/lib/validation/schemas";
import { runGenerate } from "@/lib/scheduler/generate";

async function assertRefs(orgId: string, instagramAccountId: string, categoryId?: string | null) {
  const acc = await prisma.instagramAccount.findFirst({ where: { id: instagramAccountId, organizationId: orgId } });
  if (!acc) throw validation("Conta do Instagram inválida.");
  if (categoryId) {
    const cat = await prisma.mediaCategory.findFirst({ where: { id: categoryId, organizationId: orgId } });
    if (!cat) throw validation("Categoria inválida.");
  }
}

export const createAutomation = orgAction(automationSchema, async (input, { org }) => {
  await assertRefs(org.id, input.instagramAccountId, input.categoryId);
  const automation = await prisma.automation.create({
    data: {
      organizationId: org.id,
      instagramAccountId: input.instagramAccountId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      mediaType: input.mediaType,
      selectionStrategy: input.selectionStrategy,
      daysOfWeek: input.daysOfWeek,
      publicationTime: input.publicationTime,
      timezone: org.timezone,
    },
  });
  await runGenerate(new Date(), org.id).catch(() => {});
  revalidatePath("/automacoes");
  revalidatePath("/calendario");
  revalidateOrg(org.id, "dashboard");
  return automation;
});

export const updateAutomation = orgAction(updateAutomationSchema, async (input, { org }) => {
  const automation = await prisma.automation.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!automation) throw notFound("Automação não encontrada");
  if (input.instagramAccountId || input.categoryId !== undefined) {
    await assertRefs(org.id, input.instagramAccountId ?? automation.instagramAccountId, input.categoryId);
  }

  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      name: input.name ?? undefined,
      instagramAccountId: input.instagramAccountId ?? undefined,
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      mediaType: input.mediaType ?? undefined,
      selectionStrategy: input.selectionStrategy ?? undefined,
      daysOfWeek: input.daysOfWeek ?? undefined,
      publicationTime: input.publicationTime ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });

  // Se mudou regra de recorrência/pausou: limpa ocorrências futuras ainda não publicadas
  // que vieram desta automação, para regenerar de forma coerente.
  if (input.daysOfWeek || input.publicationTime || input.isActive === false) {
    await prisma.scheduledPost.deleteMany({
      where: { automationId: automation.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    });
  }
  if (input.isActive !== false) await runGenerate(new Date(), org.id).catch(() => {});

  revalidatePath("/automacoes");
  revalidatePath("/calendario");
  revalidateOrg(org.id, "dashboard");
  return { id: automation.id };
});

export const deleteAutomation = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const automation = await prisma.automation.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!automation) throw notFound("Automação não encontrada");
  await prisma.scheduledPost.deleteMany({
    where: { automationId: automation.id, status: { in: ["SCHEDULED", "DRAFT"] } },
  });
  await prisma.automation.delete({ where: { id: automation.id } });
  revalidatePath("/automacoes");
  revalidatePath("/calendario");
  revalidateOrg(org.id, "dashboard");
  return { id: automation.id };
});

export const generateNow = orgAction(z.object({}), async (_input, { org }) => {
  const summary = await runGenerate(new Date(), org.id);
  revalidatePath("/calendario");
  revalidateOrg(org.id, "dashboard");
  return summary;
});
