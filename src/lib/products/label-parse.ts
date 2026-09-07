/**
 * Heurísticas para extrair **data de validade** e **nome do produto** de um texto
 * de OCR bruto da embalagem. Puro (sem DOM, sem Prisma) — testável e reutilizável.
 *
 * A leitura de OCR de embalagem é ruidosa: nunca assumimos acerto, sempre
 * devolvemos uma lista de candidatos para o usuário confirmar.
 */

const VAL_KEYWORDS = /\b(val|valid|válid|venc|vcto|consumir\s+ant|best\s+before|exp)/i;
const FAB_KEYWORDS = /\b(fab|fabr|mfg|manuf|produ[çc])/i;
const LOT_KEYWORDS = /\b(lote|lot|l\.)\b/i;

const MONTHS_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

type DateHit = { iso: string; score: number; from: number };

function normalizeYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Último dia do mês (para validades escritas só como mm/aaaa). */
function endOfMonthISO(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function validISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Candidatos a data de validade em ISO (`aaaa-mm-dd`), ordenados por relevância:
 * proximidade de palavra "validade", data no futuro, e data mais próxima primeiro.
 */
export function parseExpirationDates(raw: string, now: Date = new Date()): string[] {
  const text = raw.replace(/ /g, " ");
  const hits: DateHit[] = [];
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const push = (iso: string | null, index: number) => {
    if (!iso) return;
    const ctx = text.slice(Math.max(0, index - 24), index).toLowerCase();
    let score = 0;
    if (VAL_KEYWORDS.test(ctx)) score += 10;
    if (FAB_KEYWORDS.test(ctx)) score -= 8;
    if (LOT_KEYWORDS.test(ctx)) score -= 4;
    const ms = Date.parse(`${iso}T00:00:00Z`);
    if (Number.isFinite(ms)) {
      if (ms >= todayMs) score += 4;
      const days = (ms - todayMs) / 86_400_000;
      if (days >= 0 && days <= 400) score += 3;
      if (days < -365) score -= 6;
    }
    hits.push({ iso, score, from: index });
  };

  // dd/mm/aaaa · dd-mm-aa · dd.mm.aaaa
  for (const m of text.matchAll(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g)) {
    push(validISO(normalizeYear(+m[3]), +m[2], +m[1]), m.index ?? 0);
  }
  // aaaa/mm/dd (ISO-ish)
  for (const m of text.matchAll(/\b(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/g)) {
    push(validISO(+m[1], +m[2], +m[3]), m.index ?? 0);
  }
  // dd MMM aaaa  (12 SET 2026 / 12 set 26)
  for (const m of text.matchAll(/\b(\d{1,2})\s*([A-Za-zçÇ]{3,})\.?\s*(\d{2,4})\b/g)) {
    const mon = MONTHS_PT[m[2].slice(0, 3).toLowerCase()];
    if (mon) push(validISO(normalizeYear(+m[3]), mon, +m[1]), m.index ?? 0);
  }
  // mm/aaaa  ->  último dia do mês (não dentro de dd/mm/aaaa)
  for (const m of text.matchAll(/(?<![\d/.\-])(\d{1,2})[\/.\-](\d{4})\b/g)) {
    const mon = +m[1];
    if (mon >= 1 && mon <= 12) push(endOfMonthISO(+m[2], mon), m.index ?? 0);
  }
  // MMM/aaaa  (SET/2026)
  for (const m of text.matchAll(/\b([A-Za-zçÇ]{3,})\.?[\/.\-\s](\d{4})\b/g)) {
    const mon = MONTHS_PT[m[1].slice(0, 3).toLowerCase()];
    if (mon) push(endOfMonthISO(+m[2], mon), m.index ?? 0);
  }

  const seen = new Set<string>();
  return hits
    .sort((a, b) => b.score - a.score || Date.parse(a.iso) - Date.parse(b.iso))
    .filter((h) => (seen.has(h.iso) ? false : seen.add(h.iso)))
    .slice(0, 5)
    .map((h) => h.iso);
}

const NAME_STOPWORDS =
  /(validade|vencimento|venc\b|consumir|antes de|fabrica|fabr\b|lote\b|ind[uú]stria|ind\b|cnpj|conserv|ingredient|www\.|\.com|cont[eé]m|gluten|s\.?a\.?\b|ltda|reg\.|sac\b|tabela nutri|\d{2}[\/.\-]\d{2})/i;

/**
 * Candidatos a nome do produto: linhas com muitas letras, poucas cifras/símbolos,
 * priorizando as do topo do rótulo e as em CAIXA ALTA (marca costuma ser assim).
 */
export function parseProductNameCandidates(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const scored = lines
    .map((line, i) => {
      const letters = (line.match(/\p{L}/gu) ?? []).length;
      const digits = (line.match(/\d/g) ?? []).length;
      const words = line.split(" ").filter((w) => w.length > 1).length;
      let score = 0;
      if (letters >= 4) score += letters;
      if (words >= 2) score += 6;
      if (digits > letters) score -= 20;
      if (line.length > 45) score -= 10;
      if (NAME_STOPWORDS.test(line)) score -= 40;
      if (line === line.toUpperCase() && letters >= 4) score += 8;
      score -= i * 1.5; // topo do rótulo pesa mais
      return { line, score };
    })
    .filter((s) => s.score > 4)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  return scored
    .filter((s) => (seen.has(s.line.toLowerCase()) ? false : seen.add(s.line.toLowerCase())))
    .slice(0, 4)
    .map((s) => (s.line.length > 60 ? s.line.slice(0, 60) : s.line));
}
