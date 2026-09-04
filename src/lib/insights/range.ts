/** Resolve o período do relatório de Desempenho a partir da query string. */

export type ResolvedRange = {
  view: "7d" | "30d" | "custom";
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
  label: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function parseISO(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveRange(sp: {
  range?: string;
  from?: string;
  to?: string;
}): ResolvedRange {
  const now = new Date();
  let view: ResolvedRange["view"] = "7d";
  let to = endOfDay(now);
  let from = startOfDay(new Date(now.getTime() - 6 * 86400_000));

  if (sp.range === "30d") {
    view = "30d";
    from = startOfDay(new Date(now.getTime() - 29 * 86400_000));
  } else if (sp.range === "custom") {
    const cf = parseISO(sp.from);
    const ct = parseISO(sp.to);
    if (cf && ct && cf <= ct) {
      view = "custom";
      from = startOfDay(cf);
      to = endOfDay(ct);
    }
  }

  const days = Math.max(1, Math.round((endOfDay(to).getTime() - from.getTime()) / 86400_000));
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = startOfDay(new Date(from.getTime() - days * 86400_000));

  const label =
    view === "7d" ? "últimos 7 dias" : view === "30d" ? "últimos 30 dias" : "período selecionado";

  return { view, from, to, prevFrom, prevTo, days, label };
}
