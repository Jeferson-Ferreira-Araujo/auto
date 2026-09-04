import { MediaType, type MediaAsset, type SelectionStrategy } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AutomationMediaType } from "@prisma/client";
import { categoryAndDescendantIds } from "@/lib/categories";

function typeFilter(mediaType: AutomationMediaType): MediaType[] {
  if (mediaType === "IMAGE") return [MediaType.IMAGE];
  if (mediaType === "VIDEO") return [MediaType.VIDEO];
  return [MediaType.IMAGE, MediaType.VIDEO];
}

/**
 * Retorna as mídias elegíveis para uma automação numa data específica:
 * ativas, prontas, do tipo pedido, da categoria (se houver) e dentro da janela
 * de disponibilidade naquela data.
 */
export async function eligibleMedia(params: {
  organizationId: string;
  categoryId: string | null;
  mediaType: AutomationMediaType;
  onDate: Date;
}): Promise<MediaAsset[]> {
  // Categoria = ela mesma + todas as subcategorias.
  const categoryIds = params.categoryId
    ? await categoryAndDescendantIds(params.organizationId, params.categoryId)
    : null;

  return prisma.mediaAsset.findMany({
    where: {
      organizationId: params.organizationId,
      isActive: true,
      processingStatus: "READY",
      type: { in: typeFilter(params.mediaType) },
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      AND: [
        { OR: [{ availableFrom: null }, { availableFrom: { lte: params.onDate } }] },
        { OR: [{ availableUntil: null }, { availableUntil: { gte: params.onDate } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Escolhe UMA mídia de uma lista já filtrada, conforme a estratégia.
 * `occurrenceIndex` roda a seleção sequencial entre ocorrências.
 */
export function pickByStrategy(
  media: MediaAsset[],
  strategy: SelectionStrategy,
  occurrenceIndex: number,
): MediaAsset | null {
  if (media.length === 0) return null;

  switch (strategy) {
    case "SEQUENTIAL":
      return media[occurrenceIndex % media.length];
    case "RANDOM":
      return media[Math.floor(Math.random() * media.length)];
    case "LEAST_USED": {
      const sorted = [...media].sort((a, b) => {
        if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
        const aT = a.lastPublishedAt?.getTime() ?? 0;
        const bT = b.lastPublishedAt?.getTime() ?? 0;
        return aT - bT;
      });
      return sorted[0];
    }
    default:
      return media[0];
  }
}
