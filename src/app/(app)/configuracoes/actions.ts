"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { setAutoPublishSchema } from "@/lib/validation/schemas";

export const setAutoPublish = orgAction(setAutoPublishSchema, async (input, { org }) => {
  await prisma.organization.update({
    where: { id: org.id },
    data: { autoPublishStatus: input.status },
  });
  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
  revalidatePath("/", "layout");
  return { status: input.status };
});

export const updateOrganization = orgAction(
  z.object({
    name: z.string().trim().min(2).max(80).optional(),
    uploadLimitMb: z.number().int().min(10).max(1024).optional(),
  }),
  async (input, { org }) => {
    await prisma.organization.update({
      where: { id: org.id },
      data: { name: input.name ?? undefined, uploadLimitMb: input.uploadLimitMb ?? undefined },
    });
    revalidatePath("/configuracoes");
    revalidatePath("/", "layout");
    return { ok: true };
  },
);
