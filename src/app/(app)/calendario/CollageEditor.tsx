"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mediaUrl } from "@/lib/display";
import { cn } from "@/lib/utils";
import { COLLAGE_LAYOUTS, type CollageLayout } from "@/lib/collage/layouts";
import { createCollage } from "./collage-actions";
import type { PickMedia } from "./CalendarClient";

/** Miniatura de um layout: os mesmos `slots` desenhados em escala pequena, só pra escolher. */
function LayoutThumb({ layout, active }: { layout: CollageLayout; active: boolean }) {
  return (
    <div
      className={cn(
        "relative aspect-square w-14 shrink-0 overflow-hidden rounded border bg-[var(--color-bg)]",
        active ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30" : "border-[var(--color-border)]",
      )}
    >
      {layout.slots.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-[2px] bg-[var(--color-muted)]/50"
          style={{
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            width: `${s.w * 100}%`,
            height: `${s.h * 100}%`,
            padding: 1,
            backgroundClip: "content-box",
          }}
        />
      ))}
    </div>
  );
}

export function CollageEditor({
  images,
  onCreated,
  onCancel,
}: {
  images: PickMedia[];
  onCreated: (asset: { id: string; name: string }) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [layout, setLayout] = useState<CollageLayout>(COLLAGE_LAYOUTS[0]);
  const [slots, setSlots] = useState<(string | null)[]>(Array(COLLAGE_LAYOUTS[0].count).fill(null));
  const [activeSlot, setActiveSlot] = useState<number | null>(0);

  function pickLayout(l: CollageLayout) {
    setLayout(l);
    setSlots(Array(l.count).fill(null));
    setActiveSlot(0);
  }

  function pickImage(mediaId: string) {
    if (activeSlot === null) return;
    setSlots((cur) => cur.map((v, i) => (i === activeSlot ? mediaId : v)));
    const next = slots.findIndex((v, i) => i !== activeSlot && v === null);
    setActiveSlot(next === -1 ? null : next);
  }

  const complete = slots.every((s) => s !== null);

  function submit() {
    if (!complete) return;
    start(async () => {
      const res = await createCollage({ layoutKey: layout.key, mediaAssetIds: slots as string[] });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Montagem criada", "success");
      onCreated(res.data);
    });
  }

  return (
    <div className="mb-4 space-y-3 rounded-[var(--radius)] border bg-[var(--color-bg)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Montagem (grade de fotos)</span>
        <button type="button" onClick={onCancel} className="text-xs text-[var(--color-muted)] hover:underline">
          Cancelar
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {COLLAGE_LAYOUTS.map((l) => (
          <button key={l.key} type="button" onClick={() => pickLayout(l)} title={l.label}>
            <LayoutThumb layout={l} active={l.key === layout.key} />
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--color-muted)]">{layout.label}</p>

      <div className="grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-2">
        {/* Preview ao vivo — mesma proporção usada de verdade na composição final. */}
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius)] border bg-white">
          {layout.slots.map((s, i) => (
            <div
              key={i}
              className="absolute overflow-hidden"
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`, padding: 2 }}
            >
              {slots[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(slots[i]!, "preview")} alt="" className="h-full w-full object-cover" />
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSlot(i)}
                  className={cn(
                    "flex h-full w-full items-center justify-center rounded border-2 border-dashed text-xs text-[var(--color-muted)]",
                    activeSlot === i ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
                  )}
                >
                  {i + 1}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Escolha das fotos pro espaço selecionado. */}
        <div>
          <p className="mb-1 text-xs text-[var(--color-muted)]">
            {activeSlot !== null ? `Escolha a foto do espaço ${activeSlot + 1}` : "Todos os espaços preenchidos"}
          </p>
          {images.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-center text-xs text-[var(--color-muted)]">
              Nenhuma foto disponível na biblioteca.
            </p>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto rounded border p-1.5">
              {images.map((m) => {
                const usedInOtherSlot = slots.includes(m.id) && slots[activeSlot ?? -1] !== m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={activeSlot === null || usedInOtherSlot}
                    onClick={() => pickImage(m.id)}
                    title={m.name}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded border-2",
                      slots.includes(m.id) ? "border-[var(--color-primary)]" : "border-transparent",
                      (activeSlot === null || usedInOtherSlot) && "opacity-40",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(m.id, "thumb")} alt="" className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Button onClick={submit} disabled={!complete || pending} className="w-full">
        {pending ? "Montando…" : "Usar esta montagem"}
      </Button>
    </div>
  );
}
