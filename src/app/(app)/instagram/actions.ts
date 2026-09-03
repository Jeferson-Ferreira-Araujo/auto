"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { validation } from "@/lib/errors";

export const disconnectInstagram = orgAction(z.object({}), async (_input, { org }) => {
  const account = await prisma.instagramAccount.findUnique({ where: { organizationId: org.id } });
  if (!account) return { disconnected: false };

  const activeAutomations = await prisma.automation.count({
    where: { instagramAccountId: account.id, isActive: true },
  });
  if (activeAutomations > 0) {
    throw validation("Pause as automações que usam esta conta antes de desconectar.");
  }

  await prisma.$transaction([
    prisma.scheduledPost.updateMany({
      where: { instagramAccountId: account.id, status: { in: ["SCHEDULED", "DRAFT"] } },
      data: { status: "CANCELLED", errorMessage: "Instagram desconectado." },
    }),
    prisma.instagramAccount.delete({ where: { id: account.id } }),
  ]);

  revalidatePath("/instagram");
  return { disconnected: true };
});
