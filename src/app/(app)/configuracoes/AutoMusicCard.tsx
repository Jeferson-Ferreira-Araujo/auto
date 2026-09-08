"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  confirmAudioTrack,
  deleteAudioTrack,
  getAudioTracks,
  setAutoMusic,
} from "../biblioteca/audio-actions";

type Track = { id: string; name: string; curated: boolean };

export function AutoMusicCard({ currentTrackId }: { currentTrackId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    getAudioTracks({}).then((r) => r.ok && setTracks(r.data.tracks));
  }

  useEffect(() => {
    reload();
  }, []);

  function pick(trackId: string | null) {
    start(async () => {
      const res = await setAutoMusic({ trackId });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(trackId ? "Trilha sugerida definida" : "Sem trilha sugerida", "success");
      router.refresh();
    });
  }

  async function onFile(file: File) {
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Faixa";
    setUploading(true);
    try {
      const presignRes = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "audio",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      if (!presignRes.ok) throw new Error("Falha ao preparar o envio (formato ou tamanho).");
      const { uploadUrl, storageKey } = (await presignRes.json()) as {
        uploadUrl: string;
        storageKey: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Falha ao enviar o arquivo.");
      const res = await confirmAudioTrack({ storageKey, name, mimeType: file.type });
      if (!res.ok) throw new Error(res.error.message);
      toast.push("Faixa adicionada", "success");
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Erro no envio", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteAudioTrack({ id });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Faixa removida", "success");
      if (currentTrackId === id) router.refresh();
      reload();
    });
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">Trilhas sonoras</h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Faixas disponíveis para adicionar de fundo aos vídeos. A escolha da música (e se mantém o áudio
          original do vídeo) é feita na hora de agendar cada publicação. A faixa marcada aqui vem
          pré-selecionada nesse momento.
        </p>

        {tracks === null ? (
          <p className="text-xs text-[var(--color-muted)]">Carregando…</p>
        ) : (
          <>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              Trilha sugerida ao agendar
            </label>
            <select
              value={currentTrackId ?? ""}
              disabled={pending}
              onChange={(e) => pick(e.target.value || null)}
              className="w-full max-w-sm rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 text-sm"
            >
              <option value="">Nenhuma — começa sem trilha</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.curated ? " (curada)" : ""}
                </option>
              ))}
            </select>

            <ul className="mt-4 divide-y rounded-[var(--radius)] border">
              {tracks.length === 0 && (
                <li className="p-3 text-xs text-[var(--color-muted)]">Nenhuma faixa enviada ainda.</li>
              )}
              {tracks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    {t.name}
                    {t.curated && (
                      <span className="ml-2 text-xs text-[var(--color-muted)]">curada</span>
                    )}
                  </span>
                  {!t.curated && (
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      disabled={pending}
                      className="text-xs text-[var(--color-danger)] hover:underline"
                    >
                      remover
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-3">
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/ogg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Enviando…" : "Enviar faixa (MP3, até 12 MB)"}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
