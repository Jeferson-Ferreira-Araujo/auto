"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmAudioTrack, deleteAudioTrack, getAudioTracks, setVideoMusic } from "./audio-actions";

type Track = { id: string; name: string; durationSec: number | null; curated: boolean };
type Mode = "MIX" | "MUSIC_ONLY";

const ACCEPT = "audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/ogg";
const MIME_OK = new Set(ACCEPT.split(","));

export function MusicPicker({
  mediaAssetId,
  currentTrackId,
  currentMode,
  hasMusiced,
  onChanged,
}: {
  mediaAssetId: string;
  currentTrackId: string | null;
  currentMode: Mode;
  hasMusiced: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [trackId, setTrackId] = useState<string | null>(currentTrackId);
  const [mode, setMode] = useState<Mode>(currentMode);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTracks = () => getAudioTracks({}).then((r) => r.ok && setTracks(r.data.tracks));
  useEffect(() => {
    loadTracks();
  }, []);

  function apply(nextTrackId: string | null, nextMode: Mode) {
    setTrackId(nextTrackId);
    setMode(nextMode);
    start(async () => {
      const res = await setVideoMusic({ mediaAssetId, trackId: nextTrackId, mode: nextMode });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(nextTrackId ? "Aplicando trilha… (leva alguns instantes)" : "Trilha removida", "success");
      onChanged();
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!MIME_OK.has(file.type)) return toast.push("Formato de áudio não suportado (use MP3, M4A, WAV…).", "error");
    if (file.size > 12 * 1024 * 1024) return toast.push("Áudio acima de 12 MB.", "error");

    setUploading(true);
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "audio", fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });
      if (!res.ok) throw new Error("presign falhou");
      const { uploadUrl, storageKey } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("upload falhou");
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Faixa";
      const conf = await confirmAudioTrack({ storageKey, name, mimeType: file.type });
      if (!conf.ok) throw new Error(conf.error.message);
      toast.push(`Faixa "${conf.data.name}" adicionada`, "success");
      await loadTracks();
      apply(conf.data.id, mode);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Falha ao enviar o áudio", "error");
    } finally {
      setUploading(false);
    }
  }

  function removeTrack(id: string) {
    if (!confirm("Excluir esta faixa da biblioteca?")) return;
    start(async () => {
      const res = await deleteAudioTrack({ id });
      if (!res.ok) return toast.push(res.error.message, "error");
      await loadTracks();
    });
  }

  return (
    <div className="rounded-[var(--radius)] border p-3">
      <p className="mb-2 text-sm font-medium">🎵 Trilha sonora</p>

      {tracks === null ? (
        <p className="text-xs text-[var(--color-muted)]">Carregando faixas…</p>
      ) : (
        <>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`music-${mediaAssetId}`}
                checked={trackId === null}
                onChange={() => apply(null, mode)}
                disabled={pending}
              />
              Sem trilha
            </label>
            {tracks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`music-${mediaAssetId}`}
                  checked={trackId === t.id}
                  onChange={() => apply(t.id, mode)}
                  disabled={pending}
                />
                <span className="flex-1">
                  {t.name}
                  {t.curated && <span className="ml-1 text-xs text-[var(--color-muted)]">(curada)</span>}
                </span>
                {!t.curated && (
                  <button
                    type="button"
                    onClick={() => removeTrack(t.id)}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                  >
                    excluir
                  </button>
                )}
              </label>
            ))}
          </div>

          {trackId && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={mode === "MIX"} onChange={() => apply(trackId, "MIX")} disabled={pending} />
                Música + som original baixinho
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={mode === "MUSIC_ONLY"}
                  onChange={() => apply(trackId, "MUSIC_ONLY")}
                  disabled={pending}
                />
                Só a música
              </label>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading || pending}>
              {uploading ? "Enviando…" : "Enviar faixa (MP3/M4A)"}
            </Button>
            {trackId && !hasMusiced && (
              <span className="text-xs text-[var(--color-muted)]">renderizando o vídeo com a música…</span>
            )}
            {trackId && hasMusiced && <span className="text-xs text-[var(--color-success)]">✓ vídeo com trilha pronto</span>}
          </div>

          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            Use só músicas que você tem direito de usar (royalty-free ou licenciadas). Áudio de terceiros pode ser
            mutado ou derrubado pelo Instagram.
          </p>
        </>
      )}
    </div>
  );
}
