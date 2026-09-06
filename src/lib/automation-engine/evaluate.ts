import type { Condition, RuleFacts } from "./types";

function compare(a: unknown, op: Condition["op"], b: number | string): boolean {
  if (op === "eq") return a === b;
  if (op === "ne") return a !== b;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  if (op === "lt") return na < nb;
  if (op === "lte") return na <= nb;
  if (op === "gt") return na > nb;
  if (op === "gte") return na >= nb;
  return false;
}

/** Todas as condições precisam bater (AND). Lista vazia = sempre verdadeiro. */
export function evaluateConditions(conditions: Condition[], facts: RuleFacts): boolean {
  return conditions.every((c) => compare(facts[c.field], c.op, c.value));
}

/** Valida grosseiramente o shape vindo do JSON da regra. */
export function parseConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Condition =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Condition).field === "string" &&
      ["eq", "ne", "lt", "lte", "gt", "gte"].includes((c as Condition).op),
  );
}
