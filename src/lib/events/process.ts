import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { HANDLERS } from "./handlers";
import type { DomainEventType } from "./types";

const log = childLogger({ mod: "events/process" });

/**
 * Consome a outbox `domain_events`. Chamado pelo cron `process-events`.
 * Eventos sem handler são marcados DONE (servem só de registro de atividade).
 */
export async function processDomainEvents(limit = 100): Promise<{ processed: number; done: number; failed: number }> {
  const pending = await prisma.domainEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let done = 0;
  let failed = 0;

  for (const event of pending) {
    await prisma.domainEvent.update({ where: { id: event.id }, data: { status: "PROCESSING" } });
    const handler = HANDLERS[event.type as DomainEventType];
    try {
      if (handler) await handler(event);
      await prisma.domainEvent.update({
        where: { id: event.id },
        data: { status: "DONE", processedAt: new Date(), error: null },
      });
      done++;
    } catch (err) {
      failed++;
      log.error({ err, eventId: event.id, type: event.type }, "falha ao processar evento");
      await prisma.domainEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts + 1 >= 3 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          error: err instanceof Error ? err.message.slice(0, 500) : String(err),
        },
      });
    }
  }

  return { processed: pending.length, done, failed };
}
