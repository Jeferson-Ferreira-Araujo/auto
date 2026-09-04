/**
 * Geometria da marca d'água — PURO (sem sharp, sem ffmpeg, sem Prisma).
 * Compartilhado entre a app (imagens) e o worker do GitHub Actions (vídeos).
 *
 * Respeita as margens seguras do Instagram: a marca fica dentro de um retângulo
 * afastado das bordas onde a Meta desenha a UI (botões dos Reels, legenda, etc.).
 */

export type WatermarkSize = "SMALL" | "MEDIUM" | "LARGE";
export type WatermarkPosition =
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "MIDDLE_LEFT"
  | "CENTER"
  | "MIDDLE_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_CENTER"
  | "BOTTOM_RIGHT";

/** largura da marca ÷ largura da mídia */
export const WM_SIZE_FRAC: Record<WatermarkSize, number> = {
  SMALL: 0.14,
  MEDIUM: 0.22,
  LARGE: 0.32,
};

/** Margens seguras (fração da dimensão) onde a marca NÃO pode entrar. */
export function safeInsets(kind: "IMAGE" | "VIDEO"): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  // Vídeo = Reels: trilha de botões à direita, legenda/CTA embaixo, rótulo em cima.
  if (kind === "VIDEO") return { top: 0.1, right: 0.16, bottom: 0.24, left: 0.05 };
  // Imagem = feed: quase sem sobreposição.
  return { top: 0.04, right: 0.04, bottom: 0.06, left: 0.04 };
}

type Row = "TOP" | "MIDDLE" | "BOTTOM";
type Col = "LEFT" | "CENTER" | "RIGHT";

export function splitPosition(p: WatermarkPosition): { row: Row; col: Col } {
  const map: Record<WatermarkPosition, { row: Row; col: Col }> = {
    TOP_LEFT: { row: "TOP", col: "LEFT" },
    TOP_CENTER: { row: "TOP", col: "CENTER" },
    TOP_RIGHT: { row: "TOP", col: "RIGHT" },
    MIDDLE_LEFT: { row: "MIDDLE", col: "LEFT" },
    CENTER: { row: "MIDDLE", col: "CENTER" },
    MIDDLE_RIGHT: { row: "MIDDLE", col: "RIGHT" },
    BOTTOM_LEFT: { row: "BOTTOM", col: "LEFT" },
    BOTTOM_CENTER: { row: "BOTTOM", col: "CENTER" },
    BOTTOM_RIGHT: { row: "BOTTOM", col: "RIGHT" },
  };
  return map[p];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Posição/tamanho da marca em pixels sobre uma imagem (para sharp.composite). */
export function resolveImageLayout(input: {
  mediaW: number;
  mediaH: number;
  wmNaturalW: number;
  wmNaturalH: number;
  position: WatermarkPosition;
  size: WatermarkSize;
}): { left: number; top: number; width: number; height: number } {
  const { mediaW, mediaH, wmNaturalW, wmNaturalH, position, size } = input;
  const ins = safeInsets("IMAGE");
  const L = Math.round(mediaW * ins.left);
  const R = Math.round(mediaW * ins.right);
  const T = Math.round(mediaH * ins.top);
  const B = Math.round(mediaH * ins.bottom);

  const maxW = Math.max(1, mediaW - L - R);
  let width = Math.min(Math.round(mediaW * WM_SIZE_FRAC[size]), maxW);
  let height = Math.round((wmNaturalH / wmNaturalW) * width);
  const maxH = Math.max(1, mediaH - T - B);
  if (height > maxH) {
    height = maxH;
    width = Math.round((wmNaturalW / wmNaturalH) * height);
  }

  const { row, col } = splitPosition(position);
  const xRight = Math.max(L, mediaW - R - width);
  const yBottom = Math.max(T, mediaH - B - height);
  let left = col === "LEFT" ? L : col === "CENTER" ? Math.round((mediaW - width) / 2) : xRight;
  let top = row === "TOP" ? T : row === "MIDDLE" ? Math.round((mediaH - height) / 2) : yBottom;
  left = clamp(left, L, xRight);
  top = clamp(top, T, yBottom);
  return { left, top, width, height };
}

/**
 * `-filter_complex` do ffmpeg para sobrepor a marca (input 1) sobre o vídeo (input 0).
 * `videoW/videoH` vêm do ffprobe feito no worker. Saída rotulada `[outv]`.
 */
export function buildWatermarkFilter(input: {
  videoW: number;
  videoH: number;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacityPct: number;
}): string {
  const { videoW, videoH, position, size } = input;
  const op = clamp(input.opacityPct, 10, 100) / 100;
  const ins = safeInsets("VIDEO");
  const L = Math.round(videoW * ins.left);
  const R = Math.round(videoW * ins.right);
  const T = Math.round(videoH * ins.top);
  const B = Math.round(videoH * ins.bottom);
  const wmW = Math.max(1, Math.round(videoW * WM_SIZE_FRAC[size]));

  const { row, col } = splitPosition(position);
  const x = col === "LEFT" ? `${L}` : col === "CENTER" ? `(W-w)/2` : `W-${R}-w`;
  const y = row === "TOP" ? `${T}` : row === "MIDDLE" ? `(H-h)/2` : `H-${B}-h`;

  return (
    `[1:v]scale=${wmW}:-1,format=rgba,colorchannelmixer=aa=${op.toFixed(3)}[wm];` +
    `[0:v][wm]overlay=${x}:${y}:format=auto[outv]`
  );
}
