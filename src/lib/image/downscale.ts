/** Redução de imagem no navegador — mantém a foto do produto leve (~<150 KB). */

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap;

function sourceSize(src: Source): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

/**
 * Desenha a fonte num canvas com o maior lado <= `maxSize` e devolve um data URL.
 * Tenta WebP (menor); cai para JPEG onde WebP não é suportado.
 */
export function downscaleToDataUrl(src: Source, maxSize = 900, quality = 0.72): string {
  const { w, h } = sourceSize(src);
  if (!w || !h) throw new Error("Imagem sem dimensões");
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}

/** Lê um File de imagem e devolve o data URL já reduzido. */
export function fileToDownscaledDataUrl(file: File, maxSize = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        resolve(downscaleToDataUrl(img, maxSize, quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a imagem"));
    };
    img.src = url;
  });
}
