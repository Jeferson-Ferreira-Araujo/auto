"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MediaThumb } from "@/components/MediaThumb";
import { cn } from "@/lib/utils";
import { COLLAGE_LAYOUTS, type CollageLayout } from "@/lib/collage/layouts";
import { createCollage } from "./collage-actions";
import { getVideoJob } from "../biblioteca/video-actions";
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
  media,
  onCreated,
  onCancel,
}: {
  media: PickMedia[];
  onCreated: (asset: { id: string; name: string; type: "IMAGE" | "VIDEO" }) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [layout, setLayout] = useState<CollageLayout>(COLLAGE_LAYOUTS[0]);
  const [slots, setSlots] = useState<(string | null)[]>(Array(COLLAGE_LAYOUTS[0].count).fill(null));
  const [activeSlot, setActiveSlot] = useState<number | null>(0);
  const [rendering, setRendering] = useState<string | null>(null); // mensagem de progresso quando tem vídeo
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false); // evita empilhar checagens se a rede estiver lenta
  const doneRef = useRef(false); // garante que COMPLETED/FAILED só seja tratado uma vez

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const byId = new Map(media.map((m) => [m.id, m]));

  function pickLayout(l: CollageLayout) {
    setLayout(l);
    setSlots(Array(l.count).fill(null));
    setActiveSlot(0);
  }

  function pickMedia(mediaId: string) {
    if (activeSlot === null) return;
    setSlots((cur) => cur.map((v, i) => (i === activeSlot ? mediaId : v)));
    const next = slots.findIndex((v, i) => i !== activeSlot && v === null);
    setActiveSlot(next === -1 ? null : next);
  }

  const complete = slots.every((s) => s !== null);

  function pollJob(jobId: string, name: string, mediaAssetId: string) {
    doneRef.current = false;
    pollRef.current = setInterval(async () => {
      // Numa rede lenta, uma checagem pode não voltar antes da próxima disparar — sem isto,
      // várias respostas "concluído" chegando fora de ordem tratavam a mesma montagem várias
      // vezes (cada uma adicionando de novo na lista, mesmo sendo só um vídeo no servidor).
      if (inFlightRef.current || doneRef.current) return;
      inFlightRef.current = true;
      const res = await getVideoJob({ jobId });
      inFlightRef.current = false;
      if (doneRef.current || !res.ok) return;

      if (res.data.status === "COMPLETED") {
        doneRef.current = true;
        if (pollRef.current) clearInterval(pollRef.current);
        setRendering(null);
        toast.push("Montagem criada", "success");
        onCreated({ id: mediaAssetId, name, type: "VIDEO" });
      } else if (res.data.status === "FAILED") {
        doneRef.current = true;
        if (pollRef.current) clearInterval(pollRef.current);
        setRendering(null);
        toast.push(res.data.errorMessage ?? "Não foi possível montar a grade.", "error");
      }
    }, 3000);
  }

  function submit() {
    if (!complete) return;
    start(async () => {
      const res = await createCollage({ layoutKey: layout.key, mediaAssetIds: slots as string[] });
      if (!res.ok) return toast.push(res.error.message, "error");
      if (res.data.pending && res.data.jobId) {
        setRendering("Montando a grade com vídeo… pode levar um minuto.");
        pollJob(res.data.jobId, res.data.name, res.data.id);
        return;
      }
      toast.push("Montagem criada", "success");
      onCreated({ id: res.data.id, name: res.data.name, type: "IMAGE" });
    });
  }

  const busy = pending || rendering !== null;

  return (
    <div className="mb-4 space-y-3 rounded-[var(--radius)] border bg-[var(--color-bg)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Montagem (grade de fotos e vídeos)</span>
        {!rendering && (
          <button type="button" onClick={onCancel} className="text-xs text-[var(--color-muted)] hover:underline">
            Cancelar
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {COLLAGE_LAYOUTS.map((l) => (
          <button key={l.key} type="button" onClick={() => pickLayout(l)} disabled={busy} title={l.label}>
            <LayoutThumb layout={l} active={l.key === layout.key} />
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--color-muted)]">{layout.label}</p>

      <div className="grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-2">
        {/* Preview ao vivo — mesma proporção usada de verdade na composição final. */}
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius)] border bg-white">
          {layout.slots.map((s, i) => {
            const chosen = slots[i] ? byId.get(slots[i]!) : null;
            return (
              <div
                key={i}
                className="absolute overflow-hidden"
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`, padding: 2 }}
              >
                {chosen ? (
                  <div className="relative h-full w-full">
                    <MediaThumb id={chosen.id} type={chosen.type} variant="preview" className="h-full w-full object-cover" />
                    {chosen.type === "VIDEO" && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">
                        🎬
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveSlot(i)}
                    disabled={busy}
                    className={cn(
                      "flex h-full w-full items-center justify-center rounded border-2 border-dashed text-xs text-[var(--color-muted)]",
                      activeSlot === i ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
                    )}
                  >
                    {i + 1}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Escolha da mídia pro espaço selecionado. */}
        <div>
          <p className="mb-1 text-xs text-[var(--color-muted)]">
            {activeSlot !== null ? `Escolha a mídia do espaço ${activeSlot + 1}` : "Todos os espaços preenchidos"}
          </p>
          {media.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-center text-xs text-[var(--color-muted)]">
              Nenhuma mídia disponível na biblioteca.
            </p>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto rounded border p-1.5">
              {media.map((m) => {
                const usedInOtherSlot = slots.includes(m.id) && slots[activeSlot ?? -1] !== m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={busy || activeSlot === null || usedInOtherSlot}
                    onClick={() => pickMedia(m.id)}
                    title={m.name}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded border-2",
                      slots.includes(m.id) ? "border-[var(--color-primary)]" : "border-transparent",
                      (busy || activeSlot === null || usedInOtherSlot) && "opacity-40",
                    )}
                  >
                    <MediaThumb id={m.id} type={m.type} className="h-full w-full object-cover" />
                    {m.type === "VIDEO" && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">
                        🎬
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Button onClick={submit} disabled={!complete || busy} className="w-full">
        {pending ? "Montando…" : rendering ? "Renderizando…" : "Usar esta montagem"}
      </Button>
      {rendering && <p className="text-xs text-[var(--color-muted)]">{rendering}</p>}
    </div>
  );
}
