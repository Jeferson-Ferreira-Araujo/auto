"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { notFound, validation, AppError } from "@/lib/errors";
import { buildKey, deleteObject, getObjectBytes, putObject } from "@/lib/storage/r2";
import { renderImageWatermark } from "@/lib/media/watermark-render";
import { VideoProcessingService } from "@/lib/video/service";

const POSITIONS = [
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "MIDDLE_LEFT",
  "CENTER",
  "MIDDLE_RIGHT",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
] as const;

export const setMediaWatermark = orgAction(
  z.object({
    mediaAssetId: z.string().min(1),
    enabled: z.boolean(),
    position: z.enum(POSITIONS).default("BOTTOM_RIGHT"),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"]).default("MEDIUM"),
    opacity: z.number().int().min(10).max(100).default(85),
  }),
  async (input, { org }) => {
    const media = await prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, organizationId: org.id },
    });
    if (!media) throw notFound("Mídia não encontrada");

    if (!input.enabled) {
      if (media.type === "VIDEO") {
        await VideoProcessingService.disableWatermark(org.id, media.id);
      } else {
        if (media.watermarkedStorageKey) await deleteObject(media.watermarkedStorageKey).catch(() => {});
        await prisma.mediaAsset.update({
          where: { id: media.id },
          data: { watermarkEnabled: false, watermarkedStorageKey: null },
        });
      }
      revalidatePath("/biblioteca");
      return { enabled: false };
    }

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    if (!organization.watermarkStorageKey) {
      throw new AppError("VALIDATION", "Envie a imagem da marca d'água em Configurações primeiro.");
    }

    // grava os parâmetros e invalida a versão anterior
    if (media.watermarkedStorageKey) await deleteObject(media.watermarkedStorageKey).catch(() => {});
    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: {
        watermarkEnabled: true,
        watermarkPosition: input.position,
        watermarkSize: input.size,
        watermarkOpacity: input.opacity,
        watermarkedStorageKey: null,
      },
    });

    if (media.type === "IMAGE") {
      if (media.processingStatus !== "READY") {
        throw validation("Aguarde a imagem terminar de processar.");
      }
      const [baseBuf, wmBuf] = await Promise.all([
        getObjectBytes(media.processedStorageKey ?? media.storageKey),
        getObjectBytes(organization.watermarkStorageKey),
      ]);
      const out = await renderImageWatermark(baseBuf, wmBuf, {
        position: input.position,
        size: input.size,
        opacityPct: input.opacity,
      });
      const key = buildKey(org.id, "watermarked", "jpg");
      await putObject(key, out, "image/jpeg");
      await prisma.mediaAsset.update({
        where: { id: media.id },
        data: { watermarkedStorageKey: key },
      });
      revalidatePath("/biblioteca");
      return { enabled: true, rendered: true };
    }

    // vídeo → worker
    if (media.processingStatus !== "READY") {
      throw validation("Aguarde o vídeo terminar de processar.");
    }
    const job = await VideoProcessingService.requestWatermark(org.id, media.id);
    revalidatePath("/biblioteca");
    return { enabled: true, jobId: job.jobId };
  },
);
