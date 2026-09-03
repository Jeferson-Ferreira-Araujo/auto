"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmUpload } from "./actions";
import { formatBytes } from "@/lib/utils";

type Job = { name: string; size: number; status: "enviando" | "processando" | "ok" | "erro"; message?: string };

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime";

export function Uploader() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  async function uploadOne(file: File, update: (j: Partial<Job>) => void) {
    // 1. pede a URL pré-assinada
    const presignRes = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
    });
    if (!presignRes.ok) {
      const body = await presignRes.json().catch(() => null);
      throw new Error(body?.error?.message ?? "Falha ao autorizar o upload");
    }
    const { uploadUrl, storageKey } = await presignRes.json();

    // 2. envia direto ao R2 (não passa pela Vercel)
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) throw new Error("Falha ao enviar o arquivo");

    // 3. confirma: o servidor valida e processa
    update({ status: "processando" });
    const res = await confirmUpload({
      storageKey,
      originalName: file.name,
      declaredMime: file.type,
      fileSize: file.size,
    });
    if (!res.ok) throw new Error(res.error.message);
    if (res.data.processingStatus === "INCOMPATIBLE" || res.data.processingStatus === "FAILED") {
      update({ status: "erro", message: res.data.processingError ?? "Mídia incompatível" });
      return;
    }
    update({ status: "ok" });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const list = Array.from(files);
    setJobs(list.map((f) => ({ name: f.name, size: f.size, status: "enviando" as const })));

    for (let i = 0; i < list.length; i++) {
      try {
        await uploadOne(list[i], (patch) =>
          setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, ...patch } : j))),
        );
      } catch (err) {
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, status: "erro", message: err instanceof Error ? err.message : "Erro" } : j,
          ),
        );
      }
    }

    setBusy(false);
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
    const okCount = jobs.filter((j) => j.status === "ok").length;
    if (okCount) toast.push("Mídias enviadas", "success");
  }

  return (
    <div className="rounded-[var(--radius)] border border-dashed bg-[var(--color-surface)] p-6 text-center">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-sm text-[var(--color-muted)]">
        Imagens (JPEG, PNG, WEBP) e vídeos (MP4). Você pode enviar vários de uma vez.
      </p>
      <Button className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Enviando…" : "Escolher arquivos"}
      </Button>

      {jobs.length > 0 && (
        <ul className="mt-4 space-y-1 text-left text-sm">
          {jobs.map((j, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded bg-[var(--color-bg)] px-3 py-1.5">
              <span className="truncate">{j.name}</span>
              <span className="shrink-0 text-xs">
                {formatBytes(j.size)} ·{" "}
                {j.status === "ok" && <span className="text-green-700">pronto</span>}
                {j.status === "enviando" && <span className="text-[var(--color-muted)]">enviando…</span>}
                {j.status === "processando" && <span className="text-amber-700">processando…</span>}
                {j.status === "erro" && <span className="text-red-700" title={j.message}>{j.message ?? "erro"}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
