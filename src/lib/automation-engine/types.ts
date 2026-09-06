/**
 * Motor de automação: TRIGGER → CONDITIONS → ACTIONS.
 * Esqueleto — sem editor visual. Regras vivem em `automation_rules` (conditions/actions em JSON).
 * As regras NÃO são acopladas a componentes React.
 */
export type ConditionOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

export type Condition = {
  field: string; // ex.: "daysLeft", "quantity"
  op: ConditionOp;
  value: number | string;
};

export type ActionType =
  | "SEND_WHATSAPP_ALERT"
  | "SUGGEST_PROMOTION"
  | "GENERATE_MARKETING_CONTENT"
  | "REQUEST_APPROVAL"
  | "SCHEDULE_INSTAGRAM_POST";

export type Action = {
  type: ActionType;
  params?: Record<string, unknown>;
};

export type RuleFacts = Record<string, unknown>;
