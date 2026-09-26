"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { revalidateOrg } from "@/lib/cache";
import { AppError, validation } from "@/lib/errors";
import { requireFeatureEnabled } from "@/lib/features";
import { getObjectBytes } from "@/lib/storage/r2";
import { publishKeys } from "@/lib/media/variant";
import { ingestFromBuffer } from "@/lib/media/ingest";
import { findCollageLayout } from "@/lib/collage/layouts";
import { VideoProcessingService } from "@/lib/video/service";

/** Lado do canvas quadrado final (grade só de fotos), em px. Dentro do limite da Meta (1440). */
const CANVAS_SIZE = 1440;
/** Espaço branco entre as fotos, estilo grade do Instagram. */
const GAP = 10;

/**
 * Monta a grade. Se todos os espaços forem foto, compõe na hora (síncrono, `sharp`) e já volta
 * pronta. Se algum espaço for vídeo, precisa do worker de vídeo (ffmpeg no GitHub Actions) — volta
 * `pending: true` com o `jobId` pra acompanhar (ver `getVideoJob` em `biblioteca/video-actions.ts`).
 */
export const createCollage = orgAction(
  z.object({
    layoutKey: z.string().min(1),
    /** Ids das mídias, na ORDEM dos slots do layout escolhido. */
    mediaAssetIds: z.array(z.string().min(1)).min(2).max(4),
  }),
  async (input, { org }) => {
    await requireFeatureEnabled("marketing_collage");

    const layout = findCollageLayout(input.layoutKey);
    if (!layout) throw validation("Layout de montagem inválido.");
    if (input.mediaAssetIds.length !== layout.count) {
      throw validation(`Este layout precisa de ${layout.count} espaços.`);
    }
    if (new Set(input.mediaAssetIds).size !== input.mediaAssetIds.length) {
      throw validation("Escolha mídias diferentes para cada espaço.");
    }

    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: input.mediaAssetIds }, organizationId: org.id, processingStatus: "READY" },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    if (byId.size !== input.mediaAssetIds.length) {
      throw validation("Alguma mídia não foi encontrada ou ainda não está pronta.");
    }
    const ordered = input.mediaAssetIds.map((id) => byId.get(id)!);
    const hasVideo = ordered.some((a) => a.type === "VIDEO");

    if (hasVideo) {
      const res = await VideoProcessingService.requestCollage(org.id, {
        layoutKey: input.layoutKey,
        slots: ordered.map((a) => ({ storageKey: publishKeys(a).mediaKey, kind: a.type })),
        name: `Montagem — ${layout.label}`,
        timezone: org.timezone,
      });
      revalidatePath("/biblioteca");
      revalidateOrg(org.id, "dashboard");
      return { id: res.mediaAssetId, name: `Montagem — ${layout.label}`, pending: true as const, jobId: res.jobId };
    }

    const count = await prisma.mediaAsset.count({ where: { organizationId: org.id } });
    if (count >= org.mediaLimit) {
      throw new AppError("RATE_LIMITED", `Limite de ${org.mediaLimit} mídias atingido para esta empresa.`);
    }

    const composites: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < layout.slots.length; i++) {
      const slot = layout.slots[i];
      const { mediaKey } = publishKeys(ordered[i]);
      const bytes = await getObjectBytes(mediaKey);

      const left = Math.round(slot.x * CANVAS_SIZE);
      const top = Math.round(slot.y * CANVAS_SIZE);
      const w = Math.max(1, Math.round(slot.w * CANVAS_SIZE) - GAP);
      const h = Math.max(1, Math.round(slot.h * CANVAS_SIZE) - GAP);

      const tile = await sharp(bytes)
        .rotate() // aplica a orientação EXIF antes de cortar
        .resize(w, h, { fit: "cover", position: "attention" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 92 })
        .toBuffer();

      composites.push({ input: tile, left: left + Math.round(GAP / 2), top: top + Math.round(GAP / 2) });
    }

    const finalBuffer = await sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: "#ffffff" },
    })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();

    const asset = await ingestFromBuffer({
      organizationId: org.id,
      bytes: finalBuffer,
      mimeType: "image/jpeg",
      originalName: `Montagem — ${layout.label}`,
      timezone: org.timezone,
      isCollage: true,
    });
    if (asset.processingStatus !== "READY") {
      throw validation(asset.processingError ?? "Não foi possível preparar a montagem.");
    }

    revalidatePath("/biblioteca");
    revalidatePath("/calendario");
    return { id: asset.id, name: asset.name, pending: false as const, jobId: null };
  },
);
