/**
 * Requisitos de mídia da API oficial de publicação do Instagram.
 * Referências:
 *  - https://developers.facebook.com/docs/instagram-platform/content-publishing/
 *  - Guias 2026 sobre Reels API
 * Ajuste aqui se a Meta atualizar os limites.
 */

export const IMAGE = {
  /** A Meta só aceita JPEG para publicação. Convertendo tudo para JPEG. */
  publishMime: "image/jpeg",
  acceptedUploadMimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  minWidth: 320,
  maxWidth: 1440,
  /** aspect ratio (w/h) permitido no feed: 4:5 (0.8) até 1.91:1 */
  minAspect: 0.8,
  maxAspect: 1.91,
  maxBytes: 8 * 1024 * 1024,
} as const;

export const VIDEO = {
  acceptedUploadMimes: ["video/mp4", "video/quicktime"],
  publishMimes: ["video/mp4", "video/quicktime"],
  acceptedCodecs: ["h264", "hevc"],
  minDurationSec: 3,
  maxDurationSec: 15 * 60,
  /** Reels: 0.01:1 a 10:1; recomendado 9:16 (~0.5625). */
  minAspect: 0.01,
  maxAspect: 10,
  /**
   * A Meta aceita Reels de até ~1 GB, mas no MVP baixamos o arquivo para rodar o ffprobe
   * na função serverless (memória limitada no free tier). Limitamos a 100 MB para caber
   * com folga. Vídeos maiores: comprima antes de enviar.
   */
  maxBytes: 100 * 1024 * 1024,
} as const;

export function imageAspectHint(): string {
  return "Use imagens entre 4:5 (retrato) e 1.91:1 (paisagem). Quadrado (1:1) também funciona.";
}

export function reelAspectHint(): string {
  return "Para Reels, use vídeo vertical 9:16, MP4 (H.264), entre 3 segundos e 15 minutos.";
}
