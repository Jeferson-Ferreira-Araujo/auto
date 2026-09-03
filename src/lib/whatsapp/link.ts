import { randomInt } from "node:crypto";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const PENDING_TTL_MS = 15 * 60 * 1000;

/** Código de verificação de 6 dígitos. */
export function generateLinkCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Normaliza um telefone para E.164 ("+5511999998888").
 * Assume Brasil (+55) quando não há código de país.
 */
export function toE164(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // já tem código de país?
  if (digits.length >= 12 && digits.length <= 15) {
    // ok, assume que já veio com DDI
  } else if (digits.length === 10 || digits.length === 11) {
    // DDD + número (Brasil) sem DDI
    digits = `55${digits}`;
  } else if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return `+${digits}`;
}

/** Compara o texto recebido (só dígitos) com o código esperado. */
export function isLinkCodeMatch(messageText: string, expected: string | null): boolean {
  if (!expected) return false;
  const digits = messageText.replace(/\D/g, "");
  return digits.length >= 6 && digits.includes(expected);
}
