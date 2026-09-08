import { prisma } from "@/lib/db";

export type TrackView = {
  id: string;
  name: string;
  durationSec: number | null;
  curated: boolean;
};

/** Faixas disponíveis para a org: as curadas (compartilhadas) + as próprias. */
export async function listAudioTracks(organizationId: string): Promise<TrackView[]> {
  const rows = await prisma.audioTrack.findMany({
    where: { active: true, OR: [{ organizationId: null }, { organizationId }] },
    orderBy: [{ organizationId: "asc" }, { name: "asc" }],
    select: { id: true, name: true, durationSec: true, organizationId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    durationSec: r.durationSec,
    curated: r.organizationId === null,
  }));
}

/** Uma faixa que a org pode usar (curada ou dela). */
export function findUsableTrack(organizationId: string, trackId: string) {
  return prisma.audioTrack.findFirst({
    where: { id: trackId, active: true, OR: [{ organizationId: null }, { organizationId }] },
  });
}
