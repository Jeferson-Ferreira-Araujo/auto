import { fromZonedTime } from "date-fns-tz";

/** Remove acentos e baixa caixa. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

function partsInTz(instant: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: wk[get("weekday")] ?? 0,
    hour: Number(get("hour")),
  };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Extrai "HH:mm" do texto, ou null. Aceita "18h", "18:00", "18h30", "às 9", "meio-dia". */
function extractTime(t: string): string | null {
  if (/\bmeio[\s-]?dia\b/.test(t)) return "12:00";
  if (/\bmeia[\s-]?noite\b/.test(t)) return "00:00";

  // hora colada a ":" ou "h": 18h, 18:00, 18h30, 18 h
  let m = t.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  // "às 9" / "as 20" (sem "h"), mas não se for parte de uma data "dd/mm"
  m = t.match(/\b[àa]s\s+(\d{1,2})\b(?!\s*[/:])/);
  if (m) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }
  return null;
}

/** Extrai a data-alvo (Y-M-D no fuso) do texto, ou null. */
function extractDate(t: string, tz: string, now: Date): string | null {
  const p = partsInTz(now, tz);

  if (/\bdepois de amanha\b/.test(t)) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 2));
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (/\bamanha\b/.test(t)) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (/\bhoje\b/.test(t)) return ymd(p.year, p.month, p.day);

  // dd/mm ou dd/mm/aaaa
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const dd = Number(slash[1]);
    const mm = Number(slash[2]);
    let yy = slash[3] ? Number(slash[3]) : p.year;
    if (yy < 100) yy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) return ymd(yy, mm, dd);
  }

  // "dia 25"
  const diaN = t.match(/\bdia\s+(\d{1,2})\b/);
  if (diaN) {
    const dd = Number(diaN[1]);
    if (dd >= 1 && dd <= 31) {
      let mm = p.month;
      let yy = p.year;
      if (dd < p.day) {
        mm += 1;
        if (mm > 12) {
          mm = 1;
          yy += 1;
        }
      }
      return ymd(yy, mm, dd);
    }
  }

  // dia da semana
  for (const [name, target] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      let delta = (target - p.weekday + 7) % 7;
      if (delta === 0) delta = 7; // "sexta" quando hoje é sexta = próxima sexta
      const d = new Date(Date.UTC(p.year, p.month - 1, p.day + delta));
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  return null;
}

/**
 * Interpreta uma data/hora em português a partir de texto livre.
 * Retorna um Date (instante UTC) apenas quando consegue resolver **data E hora**.
 * Caso contrário retorna null (o comando fica "ambíguo" e pedimos confirmação).
 */
export function parsePtBrDateTime(text: string, timezone: string, now = new Date()): Date | null {
  const t = norm(text);
  const date = extractDate(t, timezone, now);
  const time = extractTime(t);
  if (!date || !time) return null;
  const instant = fromZonedTime(`${date}T${time}:00`, timezone);
  if (Number.isNaN(instant.getTime())) return null;
  return instant;
}

/** Formata um instante para exibição amigável em pt-BR ("amanhã às 18:00"). */
export function describeWhen(instant: Date, timezone: string, now = new Date()): string {
  const a = partsInTz(now, timezone);
  const b = partsInTz(instant, timezone);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    instant,
  );
  const diffDays =
    Math.round(Date.UTC(b.year, b.month - 1, b.day) / 86400000) -
    Math.round(Date.UTC(a.year, a.month - 1, a.day) / 86400000);
  if (diffDays === 0) return `hoje às ${time}`;
  if (diffDays === 1) return `amanhã às ${time}`;
  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
  }).format(instant);
  return `${dateStr} às ${time}`;
}
