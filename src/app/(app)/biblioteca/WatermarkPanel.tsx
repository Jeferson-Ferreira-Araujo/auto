"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { mediaUrl } from "@/lib/display";
import type { WatermarkPosition } from "@/lib/media/watermark";
import type { MediaItem } from "./LibraryClient";
import { getVideoJob } from "./video-actions";
import { setMediaWatermark } from "./watermark-media-actions";

const GRID: WatermarkPosition[] = [
  "TOP_LEFT", "TOP_CENTER", "TOP_RIGHT",
  "MIDDLE_LEFT", "CENTER", "MIDDLE_RIGHT",
  "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT",
];
const SIZES: { key: "SMALL" | "MEDIUM" | "LARGE"; label: string }[] = [
  { key: "SMALL", label: "Pequeno" },
  { key: "MEDIUM", label: "Médio" },
  { key: "LARGE", label: "Grande" },
];

export function WatermarkPanel({
  item,
  orgHasWatermark,
  onChanged,
}: {
  item: MediaItem;
  orgHasWatermark: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(item.watermarkEnabled);
  const [position, setPosition] = useState<WatermarkPosition>(item.watermarkPosition);
  const [size, setSize] = useState(item.watermarkSize);
  const [opacity, setOpacity] = useState(item.watermarkOpacity);
  const [status, setStatus] = useState<"idle" | "saving" | "rendering">("idle");
  const [hasWatermarked, setHasWatermarked] = useState(item.hasWatermarked);
  const [rev, setRev] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  function pollJob(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await getVideoJob({ jobId });
      if (!res.ok) return;
      if (res.data.status === "COMPLETED") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("idle");
        setHasWatermarked(true);
        setRev((r) => r + 1);
        toast.push("Versão com marca d'água pronta.", "success");
        onChanged();
      } else if (res.data.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("idle");
        toast.push(res.data.errorMessage ?? "Não foi possível aplicar a marca d'água.", "error");
      }
    }, 3000);
  }

  function save(next: {
    enabled: boolean;
    position: WatermarkPosition;
    size: "SMALL" | "MEDIUM" | "LARGE";
    opacity: number;
  }) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setStatus("saving");
      const res = await setMediaWatermark({ mediaAssetId: item.id, ...next });
      if (!res.ok) {
        setStatus("idle");
        return toast.push(res.error.message, "error");
      }
      if (!next.enabled) {
        setStatus("idle");
        setHasWatermarked(false);
        onChanged();
        return;
      }
      if ("rendered" in res.data && res.data.rendered) {
        setStatus("idle");
        setHasWatermarked(true);
        setRev((r) => r + 1);
        onChanged();
      } else if ("jobId" in res.data && res.data.jobId) {
        setStatus("rendering");
        setHasWatermarked(false);
        pollJob(res.data.jobId);
      }
    }, 450);
  }

  function update(patch: Partial<{ enabled: boolean; position: WatermarkPosition; size: "SMALL" | "MEDIUM" | "LARGE"; opacity: number }>) {
    const next = {
      enabled: patch.enabled ?? enabled,
      position: patch.position ?? position,
      size: patch.size ?? size,
      opacity: patch.opacity ?? opacity,
    };
    setEnabled(next.enabled);
    setPosition(next.position);
    setSize(next.size);
    setOpacity(next.opacity);
    save(next);
  }

  return (
    <div className="mt-4 rounded-[var(--radius)] border bg-[var(--color-surface)] p-3">
      <div className="mb-2 text-sm font-medium">Marca d&apos;água da empresa</div>

      {!orgHasWatermark ? (
        <p className="text-xs text-[var(--color-muted)]">
          Envie a imagem da marca em{" "}
          <Link href="/configuracoes" className="font-medium text-[var(--color-primary)]">
            Configurações
          </Link>{" "}
          para usar aqui.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Publicar {item.type === "VIDEO" ? "este vídeo" : "esta foto"} com a marca da empresa
          </label>

          {enabled && (
            <>
              <div>
                <div className="mb-1 text-xs text-[var(--color-muted)]">Posição</div>
                <div className="grid w-[132px] grid-cols-3 gap-1">
                  {GRID.map((p) => (
                    <button
                      key={p}
                      onClick={() => update({ position: p })}
                      aria-label={p}
                      className={`h-10 rounded border text-[10px] ${
                        position === p
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                          : "hover:bg-black/5"
                      }`}
                    >
                      <span
                        className={`mx-auto block h-2.5 w-2.5 rounded-sm ${
                          position === p ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]/40"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {item.type === "VIDEO" && (
                  <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                    A marca é mantida dentro da área segura do Reels (longe dos botões e da legenda).
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs text-[var(--color-muted)]">Tamanho</div>
                <div className="flex gap-1.5">
                  {SIZES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => update({ size: s.key })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        size === s.key
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "hover:bg-black/5"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-xs text-[var(--color-muted)]">
                  <span>Opacidade</span>
                  <span>{opacity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={opacity}
                  onChange={(e) => update({ opacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div className="text-xs">
                {status === "rendering" && (
                  <span className="text-amber-700">Preparando a versão com marca…</span>
                )}
                {status === "saving" && <span className="text-[var(--color-muted)]">Salvando…</span>}
                {status === "idle" && hasWatermarked && (
                  <span className="text-green-700">Versão com marca pronta.</span>
                )}
              </div>

              {hasWatermarked && status === "idle" && (
                <div className="overflow-hidden rounded border bg-[var(--color-bg)]">
                  {item.type === "VIDEO" ? (
                    <video
                      key={rev}
                      src={`${mediaUrl(item.id, "watermarked")}${rev ? `&r=${rev}` : ""}`}
                      controls
                      className="max-h-64 w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={rev}
                      src={`${mediaUrl(item.id, "watermarked")}${rev ? `&r=${rev}` : ""}`}
                      alt=""
                      className="max-h-64 w-full object-contain"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
