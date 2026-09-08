"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { getAudioTracks, setAutoMusic } from "../biblioteca/audio-actions";

type Track = { id: string; name: string; curated: boolean };

export function AutoMusicCard({ currentTrackId }: { currentTrackId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    getAudioTracks({}).then((r) => r.ok && setTracks(r.data.tracks));
  }, []);

  function pick(trackId: string | null) {
    start(async () => {
      const res = await setAutoMusic({ trackId });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(trackId ? "Trilha automática ativada" : "Trilha automática desativada", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">Trilha automática nos vídeos</h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Todo vídeo novo enviado à biblioteca já sai com esta música embutida — sem você fazer nada. Dá pra trocar
          ou tirar a trilha de cada vídeo depois, na Biblioteca.
        </p>
        {tracks === null ? (
          <p className="text-xs text-[var(--color-muted)]">Carregando…</p>
        ) : (
          <select
            value={currentTrackId ?? ""}
            disabled={pending}
            onChange={(e) => pick(e.target.value || null)}
            className="w-full max-w-sm rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 text-sm"
          >
            <option value="">Desligado — vídeos vão sem música</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.curated ? " (curada)" : ""}
              </option>
            ))}
          </select>
        )}
        {tracks?.length === 0 && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Nenhuma faixa ainda. Envie uma na Biblioteca (abra um vídeo → Trilha sonora → Enviar faixa).
          </p>
        )}
      </CardBody>
    </Card>
  );
}
