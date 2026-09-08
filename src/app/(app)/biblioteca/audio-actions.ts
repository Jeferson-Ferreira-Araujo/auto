"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { notFound, validation } from "@/lib/errors";
import { deleteObject } from "@/lib/storage/r2";
import { confirmAudioTrackSchema, setVideoMusicSchema } from "@/lib/validation/schemas";
import { VideoProcessingService } from "@/lib/video/service";
import { listAudioTracks } from "@/lib/audio/tracks";

export const getAudioTracks = orgAction(z.object({}), async (_input, { org }) => {
  return { tracks: await listAudioTracks(org.id) };
});

/** Faixa aplicada automaticamente a todo vídeo novo (null = desligado). */
export const setAutoMusic = orgAction(
  z.object({ trackId: z.string().min(1).nullable() }),
  async (input, { org }) => {
    if (input.trackId) {
      const ok = await prisma.audioTrack.findFirst({
        where: { id: input.trackId, active: true, OR: [{ organizationId: null }, { organizationId: org.id }] },
        select: { id: true },
      });
      if (!ok) throw validation("Faixa inválida.");
    }
    await prisma.organization.update({ where: { id: org.id }, data: { autoMusicTrackId: input.trackId } });
    revalidatePath("/configuracoes");
    return { trackId: input.trackId };
  },
);

export const confirmAudioTrack = orgAction(confirmAudioTrackSchema, async (input, { org, user }) => {
  if (!input.storageKey.startsWith(`org/${org.id}/audio/`)) {
    throw validation("Chave de upload inválida.");
  }
  const track = await prisma.audioTrack.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      name: input.name,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
    },
  });
  revalidatePath("/biblioteca");
  return { id: track.id, name: track.name };
});

export const deleteAudioTrack = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const track = await prisma.audioTrack.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!track) throw notFound("Faixa não encontrada (curadas não podem ser apagadas).");

  const inUse = await prisma.mediaAsset.count({ where: { musicTrackId: track.id } });
  if (inUse > 0) throw validation("Há vídeos usando esta faixa. Troque a trilha deles antes.");

  await prisma.audioTrack.delete({ where: { id: track.id } });
  await deleteObject(track.storageKey).catch(() => {});
  revalidatePath("/biblioteca");
  return { id: track.id };
});

export const setVideoMusic = orgAction(setVideoMusicSchema, async (input, { org }) => {
  const res =
    input.trackId === null
      ? await VideoProcessingService.disableMusic(org.id, input.mediaAssetId)
      : await VideoProcessingService.requestMusic(org.id, input.mediaAssetId, {
          trackId: input.trackId,
          mode: input.mode,
        });
  revalidatePath("/biblioteca");
  return res;
});
