import { formatNumber, formatShortDate } from "@/lib/insights/report";

/** Gráfico de barras simples (SVG inline, sem biblioteca): alcance por dia. */
export function MiniBars({ data }: { data: { date: string; reach: number }[] }) {
  if (data.length === 0) return null;

  // no máximo ~14 barras — agrupa se o período for maior
  let series = data;
  if (data.length > 14) {
    const bucket = Math.ceil(data.length / 14);
    series = [];
    for (let i = 0; i < data.length; i += bucket) {
      const slice = data.slice(i, i + bucket);
      series.push({
        date: slice[0].date,
        reach: Math.round(slice.reduce((a, d) => a + d.reach, 0) / slice.length),
      });
    }
  }

  const max = Math.max(1, ...series.map((d) => d.reach));
  const W = 640;
  const H = 160;
  const gap = 6;
  const bw = (W - gap * (series.length - 1)) / series.length;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Alcance por dia">
        {series.map((d, i) => {
          const h = (d.reach / max) * H;
          const x = i * (bw + gap);
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={Math.max(h, 2)}
                rx={3}
                fill="var(--color-primary)"
                opacity={0.85}
              />
              {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
                  {formatShortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        Pico de alcance: {formatNumber(max)} em um dia
      </div>
    </div>
  );
}
