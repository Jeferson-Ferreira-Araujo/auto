import sharp from "sharp";
import { resolveImageLayout, type WatermarkPosition, type WatermarkSize } from "./watermark";

/**
 * Compõe a marca d'água sobre uma imagem já normalizada (JPEG de publicação) e
 * devolve um novo JPEG. Só a app usa isto (o worker faz vídeo via ffmpeg).
 */
export async function renderImageWatermark(
  baseJpeg: Buffer,
  watermark: Buffer,
  opts: { position: WatermarkPosition; size: WatermarkSize; opacityPct: number },
): Promise<Buffer> {
  const base = sharp(baseJpeg);
  const meta = await base.metadata();
  const mediaW = meta.width ?? 1080;
  const mediaH = meta.height ?? 1350;

  const wmMeta = await sharp(watermark).metadata();
  const layout = resolveImageLayout({
    mediaW,
    mediaH,
    wmNaturalW: wmMeta.width ?? 300,
    wmNaturalH: wmMeta.height ?? 300,
    position: opts.position,
    size: opts.size,
  });

  const alpha = Math.max(10, Math.min(100, opts.opacityPct)) / 100;
  let wm = await sharp(watermark)
    .resize(layout.width, layout.height, { fit: "inside" })
    .ensureAlpha()
    .toBuffer();
  if (alpha < 1) {
    // multiplica o canal alfa da marca pela opacidade (dest-in mantém o dest onde o src tem alfa)
    wm = await sharp(wm)
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(alpha * 255)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .toBuffer();
  }

  return sharp(baseJpeg)
    .composite([{ input: wm, left: layout.left, top: layout.top }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
