import type { MediaAsset } from "@prisma/client";

/**
 * Resolve QUAIS arquivos do R2 usar para uma mídia na publicação, respeitando:
 *  1. a marca d'água (se ligada e já renderizada) — tem prioridade;
 *  2. a escolha entre versão original e versão melhorada (Reels).
 *
 * Default = ORIGINAL sem marca → nada muda em relação ao comportamento anterior.
 */
export function publishKeys(
  media: Pick<
    MediaAsset,
    | "type"
    | "publishVariant"
    | "enhancedStorageKey"
    | "enhancedThumbnailKey"
    | "processedStorageKey"
    | "storageKey"
    | "thumbnailKey"
    | "watermarkEnabled"
    | "watermarkedStorageKey"
  >,
): { mediaKey: string; thumbKey: string | null } {
  const useEnhanced =
    media.type === "VIDEO" && media.publishVariant === "ENHANCED" && !!media.enhancedStorageKey;

  const thumbKey = useEnhanced
    ? media.enhancedThumbnailKey ?? media.thumbnailKey ?? null
    : media.thumbnailKey ?? media.processedStorageKey ?? null;

  // A versão com marca já foi construída sobre a fonte correta (original ou melhorada).
  if (media.watermarkEnabled && media.watermarkedStorageKey) {
    return { mediaKey: media.watermarkedStorageKey, thumbKey };
  }

  if (useEnhanced) {
    return { mediaKey: media.enhancedStorageKey!, thumbKey };
  }
  return {
    mediaKey: media.processedStorageKey ?? media.storageKey,
    thumbKey,
  };
}
