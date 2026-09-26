import type { PostStatus } from "@prisma/client";

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  PROCESSING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

export const POST_STATUS_TONE: Record<
  PostStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "primary"
> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  PROCESSING: "warning",
  PUBLISHED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function mediaUrl(
  id: string,
  variant: "thumb" | "preview" | "original" | "enhanced" | "enhanced-thumb" | "watermarked" = "thumb",
): string {
  return `/api/media?id=${encodeURIComponent(id)}&variant=${variant}`;
}

export function audioTrackUrl(id: string): string {
  return `/api/media?audioTrack=${encodeURIComponent(id)}`;
}

export function formatDateTime(d: Date | string, timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export function daysUntil(d: Date | string): number {
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export function formatTime(d: Date | string, timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(d),
  );
}

/** "há 2h", "há 40min", "agora mesmo" — para mostrar quando algo foi atualizado pela última vez. */
export function formatRelative(d: Date | string): string {
  const diffMin = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `há ${diffH}h`;
}

/** "em ~40min", "em ~2h", "a qualquer momento" — para uma previsão de próxima sincronização. */
export function formatEta(d: Date): string {
  const diffMin = Math.round((d.getTime() - Date.now()) / 60_000);
  if (diffMin <= 1) return "a qualquer momento";
  if (diffMin < 60) return `em ~${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `em ~${diffH}h`;
}
