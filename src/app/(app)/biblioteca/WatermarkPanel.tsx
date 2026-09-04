"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useToast } from "@/components/ui/toast";
import { mediaUrl } from "@/lib/display";
import { resolveImageLayout, type WatermarkPosition, type WatermarkSize } from "@/lib/media/watermark";
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

              <div>
                <div className="mb-1 text-xs text-[var(--color-muted)]">Prévia</div>
                <LivePreview
                  id={item.id}
                  type={item.type}
                  position={position}
                  size={size}
                  opacity={opacity}
                />

                <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                  Prévia aproximada.{" "}
                  {status === "rendering"
                    ? "Gerando a versão final do vídeo…"
                    : status === "saving"
                      ? "Salvando…"
                      : hasWatermarked
                        ? "Versão final pronta."
                        : ""}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Prévia instantânea composta no navegador (sem ida ao servidor). */
function LivePreview({
  id,
  type,
  position,
  size,
  opacity,
}: {
  id: string;
  type: "IMAGE" | "VIDEO";
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
}) {
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [wm, setWm] = useState<{ w: number; h: number } | null>(null);

  const layout =
    base && wm
      ? resolveImageLayout({
          mediaW: base.w,
          mediaH: base.h,
          wmNaturalW: wm.w,
          wmNaturalH: wm.h,
          position,
          size,
          kind: type,
        })
      : null;

  const style: CSSProperties =
    layout && base
      ? {
          left: `${(layout.left / base.w) * 100}%`,
          top: `${(layout.top / base.h) * 100}%`,
          width: `${(layout.width / base.w) * 100}%`,
          opacity: Math.max(10, Math.min(100, opacity)) / 100,
        }
      : { display: "none" };

  return (
    <div className="flex justify-center rounded border bg-[var(--color-bg)] p-1">
      <div className="relative">
        {type === "VIDEO" ? (
          <video
            src={`${mediaUrl(id, "preview")}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) =>
              setBase({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
            }
            className="block max-h-64 w-auto max-w-full"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(id, "preview")}
            alt=""
            onLoad={(e) =>
              setBase({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="block max-h-64 w-auto max-w-full"
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/api/media?watermark=1"
          alt=""
          onLoad={(e) => setWm({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="pointer-events-none absolute"
          style={style}
        />
      </div>
    </div>
  );
}
