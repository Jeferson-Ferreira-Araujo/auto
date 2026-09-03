import type { MediaAsset } from "@prisma/client";

/**
 * Resolve QUAIS arquivos do R2 usar para uma mídia, respeitando a escolha do usuário
 * entre a versão original e a versão melhorada (Reels).
 *
 * Default = ORIGINAL → nada muda em relação ao comportamento anterior.
 */
export function publishKeys(media: Pick<
  MediaAsset,
  "type" | "publishVariant" | "enhancedStorageKey" | "enhancedThumbnailKey" | "processedStorageKey" | "storageKey" | "thumbnailKey"
>): { mediaKey: string; thumbKey: string | null } {
  const useEnhanced =
    media.type === "VIDEO" && media.publishVariant === "ENHANCED" && !!media.enhancedStorageKey;

  if (useEnhanced) {
    return {
      mediaKey: media.enhancedStorageKey!,
      thumbKey: media.enhancedThumbnailKey ?? media.thumbnailKey ?? null,
    };
  }
  return {
    mediaKey: media.processedStorageKey ?? media.storageKey,
    thumbKey: media.thumbnailKey ?? media.processedStorageKey ?? null,
  };
}
