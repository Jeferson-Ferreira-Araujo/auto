"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { validation } from "@/lib/errors";
import { InstagramInsightsService, insightsNeedsReconnect } from "@/lib/instagram/insights";

/** Roda a sincronização de Insights da empresa na hora (usado pelo botão "Sincronizar agora"). */
export const syncInsightsNow = orgAction(z.object({}), async (_input, { org }) => {
  const account = await prisma.instagramAccount.findUnique({ where: { organizationId: org.id } });
  if (!account) throw validation("Conecte o Instagram primeiro.");
  if (account.status !== "CONNECTED") throw validation("Reconecte o Instagram (o acesso expirou).");

  await InstagramInsightsService.syncAccount(account);

  const fresh = await prisma.instagramAccount.findUnique({
    where: { organizationId: org.id },
    select: { insightsSyncedAt: true, insightsError: true },
  });
  revalidatePath("/dashboard");
  return {
    synced: Boolean(fresh?.insightsSyncedAt),
    needsReconnect: insightsNeedsReconnect(fresh?.insightsError ?? null),
    error: fresh?.insightsError ?? null,
  };
});
