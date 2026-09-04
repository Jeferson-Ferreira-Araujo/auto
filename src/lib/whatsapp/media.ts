import type { MediaAsset } from "@prisma/client";
import { ingestFromBuffer } from "@/lib/media/ingest";
import { IMAGE, VIDEO } from "@/lib/media/constraints";
import { childLogger } from "@/lib/logger";
import { WhatsAppService } from "./service";

const log = childLogger({ mod: "whatsapp/media" });

export class WhatsAppMediaError extends Error {}

/**
 * Media handler do WhatsApp: baixa da API oficial da Meta → valida tipo/tamanho →
 * armazena no R2 e cria o MediaAsset da organização (via `ingestFromBuffer`, que já
 * normaliza imagem / roda ffprobe no vídeo).
 */
export async function receiveWhatsAppMedia(input: {
  organizationId: string;
  timezone: string;
  mediaId: string;
  mimeHint: string;
  kind: "image" | "video";
}): Promise<MediaAsset> {
  const meta = await WhatsAppService.getMediaMeta(input.mediaId);
  const mime = meta.mime || input.mimeHint;

  const accepted =
    input.kind === "image"
      ? (IMAGE.acceptedUploadMimes as readonly string[])
      : (VIDEO.acceptedUploadMimes as readonly string[]);
  if (!accepted.includes(mime)) {
    throw new WhatsAppMediaError(
      input.kind === "image"
        ? "Formato de imagem não suportado. Envie JPEG ou PNG."
        : "Formato de vídeo não suportado. Envie um MP4 (H.264).",
    );
  }

  const maxBytes = input.kind === "image" ? IMAGE.maxBytes : VIDEO.maxBytes;
  if (meta.size && meta.size > maxBytes) {
    throw new WhatsAppMediaError(
      `Arquivo muito grande (${(meta.size / 1024 / 1024).toFixed(1)} MB). Limite: ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    );
  }

  const bytes = await WhatsAppService.downloadMedia(meta.url);
  const asset = await ingestFromBuffer({
    organizationId: input.organizationId,
    bytes,
    mimeType: mime,
    originalName: `whatsapp-${new Date().toISOString().slice(0, 16)}`,
    timezone: input.timezone,
  });
  log.info({ assetId: asset.id, kind: input.kind, status: asset.processingStatus }, "mídia do WhatsApp ingerida");
  return asset;
}
