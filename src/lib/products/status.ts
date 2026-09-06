/** Status de validade — calculado, nunca armazenado. */
export type ExpirationStatus = "OK" | "ATENCAO" | "URGENTE" | "VENCIDO";

export type ExpiryThresholds = { warningDays: number; urgentDays: number };

export const DEFAULT_THRESHOLDS: ExpiryThresholds = { warningDays: 30, urgentDays: 7 };

const DAY = 86_400_000;

/**
 * Nº do dia-calendário (UTC) — `expirationDate` é `@db.Date`, chega como meia-noite
 * UTC, então comparamos calendário-com-calendário para não pegar off-by-one de fuso.
 */
function calendarDay(d: Date): number {
  const x = new Date(d);
  return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / DAY);
}

/** Dias inteiros de hoje até a data de validade. Negativo = já venceu. */
export function daysUntilExpiration(expirationDate: Date | string, now: Date = new Date()): number {
  return calendarDay(new Date(expirationDate)) - calendarDay(now);
}

export function expirationStatus(
  expirationDate: Date | string,
  cfg: ExpiryThresholds = DEFAULT_THRESHOLDS,
  now: Date = new Date(),
): ExpirationStatus {
  const days = daysUntilExpiration(expirationDate, now);
  if (days < 0) return "VENCIDO";
  if (days <= cfg.urgentDays) return "URGENTE";
  if (days <= cfg.warningDays) return "ATENCAO";
  return "OK";
}

/** Formata uma data de validade (`@db.Date`, meia-noite UTC) como dd/mm sem shift de fuso. */
export function formatExpirationDate(iso: Date | string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export const EXPIRATION_STATUS_LABEL: Record<ExpirationStatus, string> = {
  OK: "OK",
  ATENCAO: "Atenção",
  URGENTE: "Urgente",
  VENCIDO: "Vencido",
};

export const EXPIRATION_STATUS_TONE: Record<ExpirationStatus, "success" | "warning" | "urgent" | "danger"> = {
  OK: "success",
  ATENCAO: "warning",
  URGENTE: "urgent",
  VENCIDO: "danger",
};
