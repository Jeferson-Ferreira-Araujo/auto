"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { mediaUrl } from "@/lib/display";
import { PRESETS, PRESET_NAMES, type PresetName } from "@/lib/video/presets";
import type { MediaItem } from "./LibraryClient";
import {
  getVideoJob,
  requestVideoEnhancement,
  revertVideoToOriginal,
  setVideoVariant,
} from "./video-actions";

type JobState = { id: string; status: string; progress: number; errorMessage: string | null } | null;

export function VideoEnhancer({
  item,
  orgHasLogo,
  onChanged,
}: {
  item: MediaItem;
  orgHasLogo: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [preset, setPreset] = useState<PresetName | null>(null);
  const [auto, setAuto] = useState(false);
  const [title, setTitle] = useState("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [stripAudio, setStripAudio] = useState(false);
  const [job, setJob] = useState<JobState>(null);
  const [variant, setVariant] = useState<"ORIGINAL" | "ENHANCED">(item.publishVariant);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll enquanto o job estiver ativo.
  useEffect(() => {
    if (!job || (job.status !== "PENDING" && job.status !== "PROCESSING")) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const res = await getVideoJob({ jobId: job.id });
      if (!res.ok) return;
      setJob(res.data);
      if (res.data.status === "COMPLETED") {
        toast.push("Vídeo melhorado pronto!", "success");
        onChanged();
      } else if (res.data.status === "FAILED") {
        toast.push(res.data.errorMessage ?? "Não foi possível melhorar o vídeo.", "error");
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, onChanged, toast]);

  function enhance() {
    start(async () => {
      const res = await requestVideoEnhancement({
        mediaAssetId: item.id,
        preset: auto ? undefined : (preset ?? undefined),
        auto,
        titleText: title.trim() || null,
        includeLogo: includeLogo && orgHasLogo,
        stripAudio,
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      setJob({ id: res.data.jobId, status: res.data.status, progress: 0, errorMessage: null });
    });
  }

  function chooseVariant(next: "ORIGINAL" | "ENHANCED") {
    const prev = variant;
    setVariant(next);
    start(async () => {
      const res = await setVideoVariant({ mediaAssetId: item.id, variant: next });
      if (!res.ok) {
        setVariant(prev);
        return toast.push(res.error.message, "error");
      }
      toast.push(next === "ENHANCED" ? "Vai publicar a versão melhorada." : "Vai publicar o original.", "success");
      onChanged();
    });
  }

  function revert() {
    if (!confirm("Descartar a versão melhorada e voltar ao original?")) return;
    start(async () => {
      const res = await revertVideoToOriginal({ mediaAssetId: item.id });
      if (!res.ok) return toast.push(res.error.message, "error");
      setJob(null);
      toast.push("Voltou para o vídeo original.", "success");
      onChanged();
    });
  }

  const active = job?.status === "PENDING" || job?.status === "PROCESSING";

  return (
    <div className="mt-4 rounded-[var(--radius)] border bg-[var(--color-surface)] p-3">
      <div className="mb-2 text-sm font-medium">Melhorar para Reels</div>

      {/* já existe versão melhorada */}
      {item.hasEnhanced && !active && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <figure>
              <figcaption className="mb-1 text-xs text-[var(--color-muted)]">Original</figcaption>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={mediaUrl(item.id, "original")} controls className="w-full rounded border" />
            </figure>
            <figure>
              <figcaption className="mb-1 text-xs text-[var(--color-muted)]">Melhorada</figcaption>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={mediaUrl(item.id, "enhanced")} controls className="w-full rounded border" />
            </figure>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">Publicar:</span>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={variant === "ORIGINAL"}
                onChange={() => chooseVariant("ORIGINAL")}
                disabled={pending}
              />
              Original
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={variant === "ENHANCED"}
                onChange={() => chooseVariant("ENHANCED")}
                disabled={pending}
              />
              Melhorada
            </label>
            <button onClick={revert} className="ml-auto text-xs text-[var(--color-danger)] underline" disabled={pending}>
              Voltar ao original
            </button>
          </div>
        </div>
      )}

      {/* processando */}
      {active && (
        <div className="py-2">
          <div className="mb-1 text-sm text-[var(--color-muted)]">
            {job?.status === "PENDING" ? "Na fila…" : `Processando ${job?.progress ?? 0}%`}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${job?.status === "PENDING" ? 5 : job?.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Pode fechar esta janela — o processamento continua e a versão aparece aqui quando ficar pronta.
          </p>
        </div>
      )}

      {/* escolher preset / iniciar */}
      {!active && (
        <div className="space-y-3">
          <Button
            variant={auto ? "primary" : "secondary"}
            size="sm"
            onClick={() => {
              setAuto(true);
              setPreset(null);
            }}
            className="w-full"
          >
            ✨ Melhorar automaticamente
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_NAMES.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPreset(p);
                  setAuto(false);
                }}
                className={`rounded-[var(--radius)] border p-2 text-left text-xs ${
                  !auto && preset === p ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{PRESETS[p].label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      PRESETS[p].intensity === "leve"
                        ? "bg-green-100 text-green-700"
                        : PRESETS[p].intensity === "forte"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {PRESETS[p].intensity}
                  </span>
                </div>
                <div className="text-[var(--color-muted)]">{PRESETS[p].description}</div>
              </button>
            ))}
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título opcional sobre o vídeo"
            maxLength={90}
            className="h-9"
          />
          {orgHasLogo && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />
              Incluir logo da empresa
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={stripAudio}
              onChange={(e) => setStripAudio(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Publicar sem áudio (Reel mudo)
              <span className="block text-xs text-[var(--color-muted)]">
                Use quando o som gravado está ruim. A API não permite adicionar música do Instagram
                depois — o Reel fica sem som.
              </span>
            </span>
          </label>
          <Button onClick={enhance} disabled={pending || (!auto && !preset)} className="w-full">
            {item.hasEnhanced ? "Refazer" : "Melhorar vídeo"}
          </Button>
        </div>
      )}
    </div>
  );
}
