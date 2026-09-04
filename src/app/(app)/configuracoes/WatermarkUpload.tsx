"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { getWatermarkUploadUrl, removeOrgWatermark, setOrgWatermark } from "./watermark-actions";

export function WatermarkUpload({ hasWatermark }: { hasWatermark: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    if (!["image/png", "image/webp"].includes(file.type)) {
      return toast.push("Use um PNG ou WEBP com fundo transparente.", "error");
    }
    if (file.size > 3 * 1024 * 1024) return toast.push("Imagem muito grande (máx 3 MB).", "error");
    setBusy(true);
    try {
      const res = await getWatermarkUploadUrl({ mimeType: file.type as "image/png" });
      if (!res.ok) throw new Error(res.error.message);
      const put = await fetch(res.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Falha no upload");
      const saved = await setOrgWatermark({ key: res.data.key });
      if (!saved.ok) throw new Error(saved.error.message);
      toast.push("Marca d'água salva", "success");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Erro", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">Marca d&apos;água</h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Imagem sobreposta às publicações quando você liga a marca em uma foto ou vídeo na Biblioteca.
          Use PNG/WEBP com fundo transparente. É diferente do logo.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="flex items-center gap-3">
          {hasWatermark && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/media?watermark=1"
              alt="marca d'água"
              className="h-12 w-12 rounded border bg-[var(--color-bg)] object-contain"
            />
          )}
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Enviando…" : hasWatermark ? "Trocar" : "Enviar imagem"}
          </Button>
          {hasWatermark && (
            <button
              onClick={() =>
                start(async () => {
                  const res = await removeOrgWatermark({});
                  if (!res.ok) return toast.push(res.error.message, "error");
                  toast.push("Marca d'água removida", "success");
                  router.refresh();
                })
              }
              className="text-xs text-[var(--color-danger)] underline"
              disabled={pending}
            >
              Remover
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
