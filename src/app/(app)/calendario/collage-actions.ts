"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { AppError, validation } from "@/lib/errors";
import { requireFeatureEnabled } from "@/lib/features";
import { getObjectBytes } from "@/lib/storage/r2";
import { publishKeys } from "@/lib/media/variant";
import { ingestFromBuffer } from "@/lib/media/ingest";
import { findCollageLayout } from "@/lib/collage/layouts";

/** Lado do canvas quadrado final, em px. Dentro do limite de largura aceito pela Meta (1440). */
const CANVAS_SIZE = 1440;
/** Espaço branco entre as fotos, estilo grade do Instagram. */
const GAP = 10;

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
      throw validation(`Este layout precisa de ${layout.count} fotos.`);
    }
    if (new Set(input.mediaAssetIds).size !== input.mediaAssetIds.length) {
      throw validation("Escolha fotos diferentes para cada espaço.");
    }

    const count = await prisma.mediaAsset.count({ where: { organizationId: org.id } });
    if (count >= org.mediaLimit) {
      throw new AppError("RATE_LIMITED", `Limite de ${org.mediaLimit} mídias atingido para esta empresa.`);
    }

    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: input.mediaAssetIds }, organizationId: org.id, type: "IMAGE", processingStatus: "READY" },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    if (byId.size !== input.mediaAssetIds.length) {
      throw validation("Alguma foto não foi encontrada ou ainda não está pronta.");
    }
    const ordered = input.mediaAssetIds.map((id) => byId.get(id)!);

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
    });
    if (asset.processingStatus !== "READY") {
      throw validation(asset.processingError ?? "Não foi possível preparar a montagem.");
    }

    revalidatePath("/biblioteca");
    revalidatePath("/calendario");
    return { id: asset.id, name: asset.name };
  },
);
