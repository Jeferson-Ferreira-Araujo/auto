import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { evaluateConditions, parseConditions } from "./evaluate";
import { parseActions, runAction } from "./actions";
import type { RuleFacts } from "./types";

const log = childLogger({ mod: "automation-engine/run" });

/**
 * Roda as regras ativas cujo trigger casa com o evento. Para cada regra que
 * passar nas condições, executa as ações. Sem efeito colateral real ainda
 * (ações são esqueleto — ver actions.ts).
 */
export async function runRulesForEvent(event: {
  organizationId: string;
  type: string;
  payload: unknown;
}): Promise<{ matched: number }> {
  const rules = await prisma.automationRule.findMany({
    where: { organizationId: event.organizationId, trigger: event.type, active: true },
  });
  if (rules.length === 0) return { matched: 0 };

  const facts: RuleFacts =
    event.payload && typeof event.payload === "object" ? (event.payload as RuleFacts) : {};

  let matched = 0;
  for (const rule of rules) {
    const conditions = parseConditions(rule.conditions);
    if (!evaluateConditions(conditions, facts)) continue;
    matched++;
    const actions = parseActions(rule.actions);
    for (const action of actions) {
      try {
        await runAction(action, {
          organizationId: event.organizationId,
          ruleId: rule.id,
          ruleName: rule.name,
          facts,
        });
      } catch (err) {
        log.error({ err, ruleId: rule.id, action }, "falha ao executar ação de regra");
      }
    }
  }

  return { matched };
}
