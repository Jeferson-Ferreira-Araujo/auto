import { z } from "zod";
import { IMAGE, VIDEO } from "@/lib/media/constraints";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa").max(80),
  timezone: z.string().default("America/Sao_Paulo"),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(40),
});

export const updateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(40).optional(),
  isActive: z.boolean().optional(),
});

const ALL_UPLOAD_MIMES = [...IMAGE.acceptedUploadMimes, ...VIDEO.acceptedUploadMimes] as const;

export const presignSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(ALL_UPLOAD_MIMES as unknown as [string, ...string[]]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(VIDEO.maxBytes, "Arquivo acima do limite"),
});

export const confirmUploadSchema = z.object({
  storageKey: z.string().min(1),
  originalName: z.string().min(1).max(200),
  declaredMime: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const updateMediaSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  caption: z.string().max(2200).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  availableUntil: z.coerce.date().nullable().optional(),
});

export const daysOfWeek = z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia");

export const automationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  instagramAccountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  mediaType: z.enum(["IMAGE", "VIDEO", "ANY"]),
  selectionStrategy: z.enum(["SEQUENTIAL", "RANDOM", "LEAST_USED"]),
  daysOfWeek,
  publicationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
});

export const updateAutomationSchema = automationSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const manualScheduleSchema = z.object({
  instagramAccountId: z.string().min(1),
  mediaAssetId: z.string().min(1),
  caption: z.string().max(2200).nullable().optional(),
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() + 30_000, "Escolha um horário no futuro"),
});

export const updateScheduledPostSchema = z.object({
  id: z.string().min(1),
  caption: z.string().max(2200).nullable().optional(),
  mediaAssetId: z.string().min(1).optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const setAutoPublishSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]),
});
