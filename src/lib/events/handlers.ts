import { childLogger } from "@/lib/logger";
import { runRulesForEvent } from "@/lib/automation-engine/run";
import type { DomainEventType } from "./types";

const log = childLogger({ mod: "events/handlers" });

type HandlerEvent = { id: string; organizationId: string; type: string; payload: unknown };

/**
 * Registro de handlers por tipo de evento. `PRODUCT_EXPIRING`/`PRODUCT_EXPIRED`
 * disparam o motor de regras (que hoje só loga). `POST_*` não têm handler —
 * ficam na tabela apenas como fonte da "Atividade da AUTORA" na Home.
 */
export const HANDLERS: Partial<Record<DomainEventType, (e: HandlerEvent) => Promise<void>>> = {
  PRODUCT_EXPIRING: async (e) => {
    await runRulesForEvent(e);
  },
  PRODUCT_EXPIRED: async (e) => {
    await runRulesForEvent(e);
  },
  AUTOMATION_FAILED: async (e) => {
    log.warn({ payload: e.payload, organizationId: e.organizationId }, "regra de automação falhou");
  },
};
