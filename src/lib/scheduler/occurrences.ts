import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Automation } from "@prisma/client";

export type Occurrence = {
  /** Chave única da ocorrência: "YYYY-MM-DDTHH:mm" (data local no fuso da automação). */
  key: string;
  /** Instante absoluto (UTC) em que deve publicar. */
  scheduledAt: Date;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Retorna { date: "YYYY-MM-DD", weekday: 0..6 } de um instante, num fuso. */
function localParts(instant: Date, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/**
 * Gera as próximas ocorrências de uma automação dentro do horizonte (em dias),
 * a partir de agora. Determinístico: a mesma automação sempre produz as mesmas chaves.
 */
export function generateOccurrences(
  automation: Pick<Automation, "daysOfWeek" | "publicationTime" | "timezone">,
  horizonDays = 7,
  now = new Date(),
): Occurrence[] {
  const [hh, mm] = automation.publicationTime.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return [];
  const tz = automation.timezone || "America/Sao_Paulo";
  const days = new Set(automation.daysOfWeek);
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const out: Occurrence[] = [];

  for (let i = 0; i <= horizonDays; i++) {
    const { date, weekday } = localParts(addDays(now, i), tz);
    if (!days.has(weekday)) continue;

    const key = `${date}T${timeStr}`;
    const scheduledAt = fromZonedTime(`${date}T${timeStr}:00`, tz);
    if (scheduledAt.getTime() <= now.getTime()) continue;

    out.push({ key, scheduledAt });
  }

  return out;
}
