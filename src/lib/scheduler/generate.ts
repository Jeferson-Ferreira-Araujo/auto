import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { generateOccurrences } from "./occurrences";
import { eligibleMedia, pickByStrategy } from "./selection";

const log = childLogger({ mod: "scheduler/generate" });
const HORIZON_DAYS = 7;

export type GenerateSummary = {
  automationsProcessed: number;
  postsCreated: number;
  skippedNoMedia: number;
};

/**
 * Materializa ScheduledPosts das automações ativas para os próximos 7 dias.
 * Idempotente: a constraint UNIQUE(automationId, occurrenceKey) impede duplicados.
 */
export async function runGenerate(now = new Date(), organizationId?: string): Promise<GenerateSummary> {
  const automations = await prisma.automation.findMany({
    where: {
      isActive: true,
      instagramAccount: { status: "CONNECTED" },
      organization: { blockedAt: null },
      ...(organizationId ? { organizationId } : {}),
    },
  });

  const summary: GenerateSummary = { automationsProcessed: 0, postsCreated: 0, skippedNoMedia: 0 };

  for (const automation of automations) {
    summary.automationsProcessed++;
    const occurrences = generateOccurrences(automation, HORIZON_DAYS, now);
    if (occurrences.length === 0) continue;

    const existing = await prisma.scheduledPost.findMany({
      where: { automationId: automation.id, occurrenceKey: { in: occurrences.map((o) => o.key) } },
      select: { occurrenceKey: true },
    });
    const existingKeys = new Set(existing.map((e) => e.occurrenceKey));
    const missing = occurrences.filter((o) => !existingKeys.has(o.key));
    if (missing.length === 0) continue;

    // Base para rotação sequencial: quantos posts essa automação já gerou.
    const priorCount = await prisma.scheduledPost.count({ where: { automationId: automation.id } });

    for (let i = 0; i < missing.length; i++) {
      const occ = missing[i];
      const media = await eligibleMedia({
        organizationId: automation.organizationId,
        categoryId: automation.categoryId,
        mediaType: automation.mediaType,
        onDate: occ.scheduledAt,
      });
      const chosen = pickByStrategy(media, automation.selectionStrategy, priorCount + i);

      if (!chosen) {
        // Sem mídia elegível: não cria nada. Como a occurrenceKey continua livre,
        // a próxima execução do gerador tentará de novo quando houver mídia.
        summary.skippedNoMedia++;
        continue;
      }

      try {
        await prisma.scheduledPost.create({
          data: {
            organizationId: automation.organizationId,
            instagramAccountId: automation.instagramAccountId,
            mediaAssetId: chosen.id,
            automationId: automation.id,
            occurrenceKey: occ.key,
            source: "AUTOMATION",
            caption: chosen.caption ?? null,
            scheduledAt: occ.scheduledAt,
            status: "SCHEDULED",
          },
        });
        summary.postsCreated++;
      } catch (err) {
        // Corrida com outro worker: a UNIQUE constraint disparou. Ignora.
        if ((err as { code?: string }).code === "P2002") continue;
        log.error({ err, automationId: automation.id, key: occ.key }, "falha ao criar ScheduledPost");
      }
    }
  }

  log.info(summary, "geração concluída");
  return summary;
}
