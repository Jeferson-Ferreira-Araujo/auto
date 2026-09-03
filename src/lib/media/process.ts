import sharp, { type Metadata } from "sharp";
import { MediaProcessingStatus, MediaType } from "@prisma/client";
import { IMAGE, VIDEO } from "./constraints";
import { probeVideo } from "./probe";

export type ProcessResult = {
  status: MediaProcessingStatus;
  error?: string;
  /** Mensagem informativa (não é erro) — ex.: "ajustamos a proporção". */
  note?: string;
  width?: number;
  height?: number;
  duration?: number;
  /** JPEG normalizado pronto para publicação (apenas imagens). */
  processed?: { buffer: Buffer; mime: "image/jpeg" };
  /** Miniatura JPEG. */
  thumbnail?: Buffer;
};

const MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/heic", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && /hei|mif1|heic|heix/.test(b.subarray(8, 12).toString("ascii")) },
  { mime: "video/mp4", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" },
  { mime: "video/quicktime", test: (b) => b.subarray(4, 12).toString("ascii").includes("qt") || b.subarray(4, 8).toString("ascii") === "moov" },
];

/** Detecta o tipo real pelos magic bytes — não confia na extensão nem no mime declarado. */
export function sniffMime(bytes: Buffer): string | null {
  for (const m of MAGIC) {
    try {
      if (m.test(bytes)) return m.mime;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function processImage(bytes: Buffer): Promise<ProcessResult> {
  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return { status: MediaProcessingStatus.FAILED, error: "Arquivo de imagem inválido ou corrompido." };
  }
  if (!meta.width || !meta.height) {
    return { status: MediaProcessingStatus.FAILED, error: "Não foi possível ler as dimensões da imagem." };
  }

  // Assa a rotação EXIF num buffer normalizado para os cálculos seguintes.
  const norm = await sharp(bytes).rotate().toBuffer();
  const nMeta = await sharp(norm).metadata();
  const w = nMeta.width ?? meta.width;
  const h = nMeta.height ?? meta.height;
  const aspect = w / h;

  // Decide o "canvas" alvo. O Instagram aceita de 4:5 (0.8) a 1.91:1.
  let canvasW: number;
  let canvasH: number;
  let mode: "keep" | "fit";

  if (aspect < IMAGE.minAspect) {
    // Muito vertical (ex.: 9:16, 3:4) → encaixa num 4:5 sem cortar nada.
    canvasW = 1080;
    canvasH = 1350;
    mode = "fit";
  } else if (aspect > IMAGE.maxAspect) {
    // Muito panorâmica → encaixa num 1.91:1.
    canvasW = 1080;
    canvasH = 566;
    mode = "fit";
  } else {
    // Dentro da faixa: mantém a proporção, garante largura entre 1080 e 1440.
    canvasW = Math.min(Math.max(Math.round(w), 1080), IMAGE.maxWidth);
    canvasH = Math.round(canvasW / aspect);
    mode = "keep";
  }

  let processedBuf: Buffer;
  if (mode === "keep") {
    processedBuf = await sharp(norm)
      .resize({ width: canvasW, height: canvasH, fit: "fill" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } else {
    // Fundo: a própria imagem ampliada e desfocada preenche as bordas (sem cortar o conteúdo).
    const bg = await sharp(norm)
      .resize(canvasW, canvasH, { fit: "cover" })
      .blur(40)
      .modulate({ brightness: 0.85 })
      .toBuffer();
    const fg = await sharp(norm).resize(canvasW, canvasH, { fit: "inside" }).toBuffer();
    processedBuf = await sharp(bg)
      .composite([{ input: fg, gravity: "center" }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  }

  const outMeta = await sharp(processedBuf).metadata();
  const thumbnail = await sharp(processedBuf)
    .resize({ width: 480, height: 480, fit: "cover" })
    .jpeg({ quality: 72 })
    .toBuffer();

  return {
    status: MediaProcessingStatus.READY,
    width: outMeta.width,
    height: outMeta.height,
    processed: { buffer: processedBuf, mime: "image/jpeg" },
    thumbnail,
    note:
      mode === "fit"
        ? "Ajustamos a imagem para o formato do Instagram (bordas preenchidas com um fundo desfocado)."
        : undefined,
  };
}

export async function processVideo(bytes: Buffer): Promise<ProcessResult> {
  let probe;
  try {
    probe = await probeVideo(bytes);
  } catch {
    return { status: MediaProcessingStatus.FAILED, error: "Não foi possível ler o vídeo. Envie um MP4 (H.264)." };
  }

  const problems: string[] = [];
  if (probe.durationSec < VIDEO.minDurationSec)
    problems.push(`duração de ${probe.durationSec.toFixed(0)}s (mínimo ${VIDEO.minDurationSec}s)`);
  if (probe.durationSec > VIDEO.maxDurationSec)
    problems.push(`duração acima de ${VIDEO.maxDurationSec / 60} minutos`);
  if (probe.videoCodec && !(VIDEO.acceptedCodecs as readonly string[]).includes(probe.videoCodec.toLowerCase()))
    problems.push(`codec de vídeo "${probe.videoCodec}" (use H.264)`);
  if (probe.width && probe.height) {
    const aspect = probe.width / probe.height;
    if (aspect < VIDEO.minAspect || aspect > VIDEO.maxAspect)
      problems.push(`proporção ${aspect.toFixed(2)}:1 fora do permitido`);
  }

  if (problems.length > 0) {
    return {
      status: MediaProcessingStatus.INCOMPATIBLE,
      error: `Vídeo incompatível com Reels: ${problems.join("; ")}. Converta para MP4 vertical (9:16, H.264) e reenvie.`,
      width: probe.width || undefined,
      height: probe.height || undefined,
      duration: probe.durationSec || undefined,
    };
  }

  return {
    status: MediaProcessingStatus.READY,
    width: probe.width,
    height: probe.height,
    duration: probe.durationSec,
  };
}

export async function processMedia(type: MediaType, bytes: Buffer): Promise<ProcessResult> {
  return type === MediaType.IMAGE ? processImage(bytes) : processVideo(bytes);
}
