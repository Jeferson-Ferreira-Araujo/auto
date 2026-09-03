import sharp, { type Metadata } from "sharp";
import { MediaProcessingStatus, MediaType } from "@prisma/client";
import { IMAGE, VIDEO } from "./constraints";
import { probeVideo } from "./probe";

export type ProcessResult = {
  status: MediaProcessingStatus;
  error?: string;
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
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    return { status: MediaProcessingStatus.FAILED, error: "Não foi possível ler as dimensões da imagem." };
  }

  // Normaliza: corrige rotação EXIF, limita largura, exporta JPEG de qualidade alta.
  const pipeline = sharp(bytes).rotate();
  const resized = width > IMAGE.maxWidth ? pipeline.resize({ width: IMAGE.maxWidth }) : pipeline;
  const jpeg = await resized.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });

  const outW = jpeg.info.width;
  const outH = jpeg.info.height;
  const aspect = outW / outH;

  const thumbnail = await sharp(bytes)
    .rotate()
    .resize({ width: 480, height: 480, fit: "cover" })
    .jpeg({ quality: 72 })
    .toBuffer();

  if (aspect < IMAGE.minAspect || aspect > IMAGE.maxAspect) {
    return {
      status: MediaProcessingStatus.INCOMPATIBLE,
      error: `Proporção ${aspect.toFixed(2)}:1 fora do permitido pelo Instagram (entre 4:5 e 1.91:1). Recorte a imagem antes de publicar.`,
      width: outW,
      height: outH,
      thumbnail,
    };
  }
  if (outW < IMAGE.minWidth) {
    return {
      status: MediaProcessingStatus.INCOMPATIBLE,
      error: `Imagem muito pequena (${outW}px). O Instagram exige pelo menos ${IMAGE.minWidth}px de largura.`,
      width: outW,
      height: outH,
      thumbnail,
    };
  }

  return {
    status: MediaProcessingStatus.READY,
    width: outW,
    height: outH,
    processed: { buffer: jpeg.data, mime: "image/jpeg" },
    thumbnail,
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
