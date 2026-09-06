import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import type { DomainEventPayloadMap, DomainEventType } from "./types";

const log = childLogger({ mod: "events/emit" });

/**
 * Registra um evento de domínio na outbox. Idempotente por `dedupeKey`
 * (uma segunda emissão com a mesma chave é ignorada silenciosamente).
 * Best-effort: nunca lança — falhar em emitir não pode quebrar a operação de origem.
 */
export async function emitEvent<T extends DomainEventType>(
  organizationId: string,
  type: T,
  payload: DomainEventPayloadMap[T],
  dedupeKey?: string,
): Promise<void> {
  try {
    await prisma.domainEvent.create({
      data: { organizationId, type, payload: payload as Prisma.InputJsonValue, dedupeKey: dedupeKey ?? null },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // dedupe
    log.warn({ err, type, organizationId }, "falha ao emitir evento (ignorado)");
  }
}
