/** Tipos e formatação (pt-BR) do relatório de Desempenho. */

export type ReportStatus = "not_connected" | "no_data" | "ok";

export type BestMedia = {
  instagramMediaId: string;
  mediaProductType: string;
  mediaType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string; // ISO
  views: number;
  reach: number;
  likes: number;
  comments: number;
  categoryName: string | null;
};

export type MetricDelta = {
  key: string;
  label: string;
  value: number;
  /** variação percentual vs. período anterior; null = sem base para comparar */
  deltaPct: number | null;
};

export type Report = {
  status: ReportStatus;
  label: string;
  posts: number;
  metrics: MetricDelta[];
  followers: number | null;
  followersComparable: boolean;
  best: BestMedia | null;
  bestReel: BestMedia | null;
  bestImage: BestMedia | null;
  bestCategory: { name: string; avgViews: number; posts: number } | null;
  reelsVsImages: { reelsAvgReach: number; imagesAvgReach: number } | null;
  reachSeries: { date: string; reach: number }[];
  /** frases prontas exibidas só quando há base suficiente */
  sentences: string[];
};

/** 12400 -> "12.400" */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

/** 0.18 -> "+18%" ; -0.05 -> "-5%" ; null -> "—" */
export function formatDelta(pct: number | null): string {
  if (pct == null) return "—";
  const r = Math.round(pct * 100);
  return `${r > 0 ? "↑" : r < 0 ? "↓" : ""} ${Math.abs(r)}%`.trim();
}

export function deltaTone(pct: number | null): "up" | "down" | "flat" {
  if (pct == null) return "flat";
  if (pct > 0.005) return "up";
  if (pct < -0.005) return "down";
  return "flat";
}

export function mediaKindLabel(m: { mediaProductType: string; mediaType: string }): string {
  if (m.mediaProductType === "REELS") return "Reel";
  if (m.mediaType === "VIDEO") return "Vídeo";
  if (m.mediaType === "CAROUSEL_ALBUM") return "Carrossel";
  return "Imagem";
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}
