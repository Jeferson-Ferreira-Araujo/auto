import { MediaType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { deleteObject, getObjectBytes, buildKey, putObject } from "@/lib/storage/r2";
import { IMAGE, VIDEO } from "./constraints";
import { processImage, processVideo, sniffMime } from "./process";

const log = childLogger({ mod: "media/ingest" });

export type IngestInput = {
  organizationId: string;
  storageKey: string;
  originalName: string;
  declaredMime: string;
  fileSize: number;
};

/**
 * Confirma um upload: baixa o objeto do R2, valida pelo conteúdo real (magic bytes),
 * processa (JPEG normalizado + thumbnail para imagem; ffprobe para vídeo) e cria o MediaAsset.
 * O nome original é guardado apenas como rótulo editável — nunca como identificador.
 */
export async function ingestUpload(input: IngestInput) {
  const bytes = await getObjectBytes(input.storageKey);

  const realMime = sniffMime(bytes);
  if (!realMime) {
    await deleteObject(input.storageKey);
    throw new Error("Não foi possível identificar o tipo do arquivo. Envie uma imagem JPEG/PNG/WEBP ou um vídeo MP4.");
  }

  const isImage = (IMAGE.acceptedUploadMimes as readonly string[]).includes(realMime);
  const isVideo = (VIDEO.acceptedUploadMimes as readonly string[]).includes(realMime);
  if (!isImage && !isVideo) {
    await deleteObject(input.storageKey);
    throw new Error(`Tipo de arquivo não suportado (${realMime}).`);
  }

  const type = isImage ? MediaType.IMAGE : MediaType.VIDEO;
  const maxBytes = isImage ? IMAGE.maxBytes : VIDEO.maxBytes;
  if (bytes.length > maxBytes) {
    await deleteObject(input.storageKey);
    throw new Error(`Arquivo muito grande (${(bytes.length / 1024 / 1024).toFixed(1)} MB).`);
  }

  const baseName = input.originalName.replace(/\.[^.]+$/, "").slice(0, 120) || "Sem nome";

  let processedKey: string | null = null;
  let thumbnailKey: string | null = null;

  const result = isImage ? await processImage(bytes) : await processVideo(bytes);

  if (result.processed) {
    processedKey = buildKey(input.organizationId, "processed", "jpg");
    await putObject(processedKey, result.processed.buffer, result.processed.mime);
  }
  if (result.thumbnail) {
    thumbnailKey = buildKey(input.organizationId, "thumb", "jpg");
    await putObject(thumbnailKey, result.thumbnail, "image/jpeg");
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      organizationId: input.organizationId,
      type,
      name: baseName,
      storageKey: input.storageKey,
      processedStorageKey: processedKey,
      thumbnailKey,
      mimeType: realMime,
      fileSize: bytes.length,
      width: result.width ?? null,
      height: result.height ?? null,
      duration: result.duration ?? null,
      processingStatus: result.status,
      processingError: result.error ?? null,
    },
  });

  log.info({ assetId: asset.id, status: result.status }, "mídia ingerida");
  return asset;
}
