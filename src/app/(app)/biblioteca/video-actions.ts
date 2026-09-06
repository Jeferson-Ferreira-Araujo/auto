"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgAction } from "@/lib/safe-action";
import { revalidateOrg } from "@/lib/cache";
import { VideoProcessingService } from "@/lib/video/service";
import { PRESET_NAMES } from "@/lib/video/presets";

const presetEnum = z.enum(PRESET_NAMES as [string, ...string[]]);

export const requestVideoEnhancement = orgAction(
  z.object({
    mediaAssetId: z.string().min(1),
    preset: presetEnum.optional(),
    auto: z.boolean().optional(),
    titleText: z.string().max(90).nullable().optional(),
    includeLogo: z.boolean().optional(),
    stripAudio: z.boolean().optional(),
  }),
  async (input, { org }) => {
    const job = await VideoProcessingService.requestEnhancement(org.id, input.mediaAssetId, {
      preset: input.preset as never,
      auto: input.auto,
      titleText: input.titleText ?? null,
      includeLogo: input.includeLogo,
      stripAudio: input.stripAudio,
    });
    revalidatePath("/biblioteca");
    return { jobId: job.id, status: job.status };
  },
);

export const mergeVideos = orgAction(
  z.object({
    name: z.string().trim().max(120).optional(),
    inputStorageKeys: z.array(z.string().min(1)).min(2).max(8),
  }),
  async (input, { org }) => {
    const res = await VideoProcessingService.requestMerge(org.id, {
      inputStorageKeys: input.inputStorageKeys,
      name: input.name ?? null,
      timezone: org.timezone,
    });
    revalidatePath("/biblioteca");
    revalidateOrg(org.id, "dashboard"); // asset placeholder novo entra na contagem
    return res;
  },
);

export const getVideoJob = orgAction(z.object({ jobId: z.string().min(1) }), async (input, { org }) => {
  const job = await VideoProcessingService.getJob(org.id, input.jobId);
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    preset: job.preset,
  };
});

export const setVideoVariant = orgAction(
  z.object({ mediaAssetId: z.string().min(1), variant: z.enum(["ORIGINAL", "ENHANCED"]) }),
  async (input, { org }) => {
    const res = await VideoProcessingService.setPublishVariant(org.id, input.mediaAssetId, input.variant);
    revalidatePath("/biblioteca");
    revalidatePath("/calendario");
    return res;
  },
);

export const revertVideoToOriginal = orgAction(
  z.object({ mediaAssetId: z.string().min(1) }),
  async (input, { org }) => {
    const res = await VideoProcessingService.revertToOriginal(org.id, input.mediaAssetId);
    revalidatePath("/biblioteca");
    return res;
  },
);
