"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { orgAction } from "@/lib/safe-action";
import { revalidateOrg } from "@/lib/cache";
import { validation } from "@/lib/errors";
import { InstagramService } from "@/lib/instagram/service";
import { IG_STATE_COOKIE } from "./constants";

/** Inicia o OAuth do Instagram: grava o state num cookie e redireciona para a Meta. */
export async function startInstagramConnect() {
  await requireOrgContext();
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(IG_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(InstagramService.getAuthUrl(state));
}

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

  revalidatePath("/configuracoes");
  revalidateOrg(org.id, "dashboard", "insights");
  return { disconnected: true };
});
