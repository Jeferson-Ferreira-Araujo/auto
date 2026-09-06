import { childLogger } from "@/lib/logger";
import type { Action, RuleFacts } from "./types";

const log = childLogger({ mod: "automation-engine/actions" });

export type ActionContext = {
  organizationId: string;
  ruleId: string;
  ruleName: string;
  facts: RuleFacts;
};

/**
 * Executa uma ação de regra. **Esqueleto**: nesta fase as ações só registram
 * intenção (log) — nenhuma faz efeito real (sem envio de WhatsApp, sem gerar
 * conteúdo, sem publicar). A implementação real de cada uma vem em fases futuras.
 */
export async function runAction(action: Action, ctx: ActionContext): Promise<void> {
  switch (action.type) {
    case "SEND_WHATSAPP_ALERT":
    case "SUGGEST_PROMOTION":
    case "GENERATE_MARKETING_CONTENT":
    case "REQUEST_APPROVAL":
    case "SCHEDULE_INSTAGRAM_POST":
      log.info(
        { action: action.type, organizationId: ctx.organizationId, ruleId: ctx.ruleId, params: action.params },
        "ação de automação (esqueleto — sem efeito real ainda)",
      );
      return;
    default:
      log.warn({ action }, "tipo de ação desconhecido");
  }
}

export function parseActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const known = [
    "SEND_WHATSAPP_ALERT",
    "SUGGEST_PROMOTION",
    "GENERATE_MARKETING_CONTENT",
    "REQUEST_APPROVAL",
    "SCHEDULE_INSTAGRAM_POST",
  ];
  return raw.filter(
    (a): a is Action => !!a && typeof a === "object" && known.includes((a as Action).type),
  );
}
