import { MediaType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { deleteObject, getObjectBytes, buildKey, putObject, extFromMime } from "@/lib/storage/r2";
import { IMAGE, VIDEO } from "./constraints";
import { processImage, processVideo, sniffMime } from "./process";
import { friendlyMediaName } from "./naming";

const log = childLogger({ mod: "media/ingest" });

export type IngestInput = {
  organizationId: string;
  storageKey: string;
  originalName: string;
  declaredMime: string;
  fileSize: number;
  timezone?: string;
};

/**
 * Núcleo do ingest: recebe os bytes já baixados, valida pelo conteúdo real (magic bytes),
 * processa (JPEG normalizado + thumbnail para imagem; ffprobe para vídeo) e cria o MediaAsset.
 * `storageKey` deve ser a chave onde o ORIGINAL está no R2.
 */
async function ingestCore(params: {
  organizationId: string;
  storageKey: string;
  bytes: Buffer;
  originalName: string;
  timezone?: string;
  onInvalid?: () => Promise<void>;
}) {
  const { organizationId, storageKey, bytes, originalName, timezone } = params;
  const fail = async (msg: string) => {
    await params.onInvalid?.();
    throw new Error(msg);
  };

  const realMime = sniffMime(bytes);
  if (!realMime) {
    return fail("Não foi possível identificar o tipo do arquivo. Envie uma imagem (JPEG/PNG/WEBP) ou um vídeo MP4.");
  }

  const isImage = (IMAGE.acceptedUploadMimes as readonly string[]).includes(realMime);
  const isVideo = (VIDEO.acceptedUploadMimes as readonly string[]).includes(realMime);
  if (!isImage && !isVideo) return fail(`Tipo de arquivo não suportado (${realMime}).`);

  const type = isImage ? MediaType.IMAGE : MediaType.VIDEO;
  const maxBytes = isImage ? IMAGE.maxBytes : VIDEO.maxBytes;
  if (bytes.length > maxBytes) {
    return fail(`Arquivo muito grande (${(bytes.length / 1024 / 1024).toFixed(1)} MB).`);
  }

  const displayName = friendlyMediaName(originalName, type, new Date(), timezone);
  const result = isImage ? await processImage(bytes) : await processVideo(bytes);

  let processedKey: string | null = null;
  let thumbnailKey: string | null = null;
  if (result.processed) {
    processedKey = buildKey(organizationId, "processed", "jpg");
    await putObject(processedKey, result.processed.buffer, result.processed.mime);
  }
  if (result.thumbnail) {
    thumbnailKey = buildKey(organizationId, "thumb", "jpg");
    await putObject(thumbnailKey, result.thumbnail, "image/jpeg");
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      organizationId,
      type,
      name: displayName,
      storageKey,
      processedStorageKey: processedKey,
      thumbnailKey,
      mimeType: realMime,
      fileSize: bytes.length,
      width: result.width ?? null,
      height: result.height ?? null,
      duration: result.duration ?? null,
      processingStatus: result.status,
      processingError: result.error ?? null,
      processingNote: result.note ?? null,
    },
  });

  log.info({ assetId: asset.id, status: result.status }, "mídia ingerida");
  return asset;
}

/**
 * Confirma um upload feito direto do browser para o R2 (fluxo web).
 * O arquivo já está em `input.storageKey`.
 */
export async function ingestUpload(input: IngestInput) {
  const bytes = await getObjectBytes(input.storageKey);
  return ingestCore({
    organizationId: input.organizationId,
    storageKey: input.storageKey,
    bytes,
    originalName: input.originalName,
    timezone: input.timezone,
    onInvalid: () => deleteObject(input.storageKey),
  });
}

/**
 * Ingest a partir de bytes já em memória (fluxo WhatsApp: baixamos a mídia da Meta
 * e precisamos guardar no R2 nós mesmos).
 */
export async function ingestFromBuffer(params: {
  organizationId: string;
  bytes: Buffer;
  mimeType: string;
  originalName: string;
  timezone?: string;
}) {
  const ext = extFromMime(params.mimeType);
  const storageKey = buildKey(params.organizationId, "media", ext);
  await putObject(storageKey, params.bytes, params.mimeType);
  return ingestCore({
    organizationId: params.organizationId,
    storageKey,
    bytes: params.bytes,
    originalName: params.originalName,
    timezone: params.timezone,
    onInvalid: () => deleteObject(storageKey),
  });
}
