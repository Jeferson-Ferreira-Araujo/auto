"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/utils";
import { getVideoJob, mergeVideos } from "./video-actions";

const ACCEPT = "video/mp4,video/quicktime";
const MAX = 8;

type Phase = "idle" | "enviando" | "juntando";

export function VideoMerger() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");

  const busy = phase !== "idle";

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => ACCEPT.includes(f.type) || f.name.match(/\.(mp4|mov)$/i));
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX));
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(i: number, dir: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadOne(file: File): Promise<string> {
    const presignRes = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || "video/mp4", fileSize: file.size }),
    });
    if (!presignRes.ok) {
      const body = await presignRes.json().catch(() => null);
      throw new Error(body?.error?.message ?? "Falha ao autorizar o upload");
    }
    const { uploadUrl, storageKey } = await presignRes.json();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!put.ok) throw new Error(`Falha ao enviar "${file.name}"`);
    return storageKey as string;
  }

  function pollJob(jobId: string) {
    const timer = setInterval(async () => {
      const res = await getVideoJob({ jobId });
      if (!res.ok) return;
      if (res.data.status === "COMPLETED") {
        clearInterval(timer);
        setPhase("idle");
        setFiles([]);
        setName("");
        setProgress("");
        toast.push("Vídeos juntados! O novo vídeo está na biblioteca.", "success");
        router.refresh();
      } else if (res.data.status === "FAILED") {
        clearInterval(timer);
        setPhase("idle");
        setProgress("");
        toast.push(res.data.errorMessage ?? "Não foi possível juntar os vídeos.", "error");
        router.refresh();
      }
    }, 3000);
  }

  async function submit() {
    if (files.length < 2) return;
    try {
      setPhase("enviando");
      const keys: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Enviando ${i + 1} de ${files.length}…`);
        keys.push(await uploadOne(files[i]));
      }
      setPhase("juntando");
      setProgress("Juntando os vídeos… isso pode levar alguns minutos.");
      const res = await mergeVideos({ inputStorageKeys: keys, name: name.trim() || undefined });
      if (!res.ok) {
        setPhase("idle");
        setProgress("");
        return toast.push(res.error.message, "error");
      }
      router.refresh();
      pollJob(res.data.jobId);
    } catch (err) {
      setPhase("idle");
      setProgress("");
      toast.push(err instanceof Error ? err.message : "Erro ao juntar os vídeos", "error");
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-dashed bg-[var(--color-surface)] p-6">
      <div className="mb-1 text-sm font-semibold">Juntar vídeos em um só</div>
      <p className="text-sm text-[var(--color-muted)]">
        Envie de 2 a {MAX} vídeos (MP4). Eles são colocados em sequência e viram um único vídeo vertical
        (9:16), <strong>sem áudio</strong>, pronto para publicar como Reel.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {files.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-left text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-3 py-1.5">
              <span className="w-5 shrink-0 text-center text-xs font-semibold text-[var(--color-muted)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">{formatBytes(f.size)}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  className="rounded px-1 text-[var(--color-muted)] hover:bg-black/10 disabled:opacity-30"
                  aria-label="Mover para cima"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={busy || i === files.length - 1}
                  className="rounded px-1 text-[var(--color-muted)] hover:bg-black/10 disabled:opacity-30"
                  aria-label="Mover para baixo"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeAt(i)}
                  disabled={busy}
                  className="rounded px-1 text-[var(--color-danger)] hover:bg-black/10 disabled:opacity-30"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {files.length >= 2 && (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do vídeo final (opcional)"
          maxLength={120}
          className="mt-3 h-9"
          disabled={busy}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy || files.length >= MAX}>
          {files.length === 0 ? "Escolher vídeos" : "Adicionar mais"}
        </Button>
        <Button size="sm" onClick={submit} disabled={busy || files.length < 2}>
          {phase === "enviando" ? "Enviando…" : phase === "juntando" ? "Juntando…" : "Juntar vídeos"}
        </Button>
        {progress && <span className="text-xs text-[var(--color-muted)]">{progress}</span>}
      </div>

      {phase === "juntando" && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Pode fechar esta página — o vídeo aparece na biblioteca quando ficar pronto.
        </p>
      )}
    </div>
  );
}
