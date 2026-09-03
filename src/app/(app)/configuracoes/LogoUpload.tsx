"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { getLogoUploadUrl, removeOrgLogo, setOrgLogo } from "./logo-actions";

export function LogoUpload({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return toast.push("Use PNG, JPEG ou WEBP.", "error");
    }
    if (file.size > 3 * 1024 * 1024) return toast.push("Logo muito grande (máx 3 MB).", "error");
    setBusy(true);
    try {
      const res = await getLogoUploadUrl({ mimeType: file.type as "image/png" });
      if (!res.ok) throw new Error(res.error.message);
      const put = await fetch(res.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Falha no upload");
      const saved = await setOrgLogo({ key: res.data.key });
      if (!saved.ok) throw new Error(saved.error.message);
      toast.push("Logo salvo", "success");
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
        <h3 className="mb-1 font-medium">Logo da empresa</h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          PNG com fundo transparente funciona melhor. Usado ao aplicar “Incluir logo” na melhoria de vídeos.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="flex items-center gap-3">
          {hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/media?logo=1" alt="logo" className="h-12 w-12 rounded border bg-[var(--color-bg)] object-contain" />
          )}
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Enviando…" : hasLogo ? "Trocar logo" : "Enviar logo"}
          </Button>
          {hasLogo && (
            <button
              onClick={() =>
                start(async () => {
                  const res = await removeOrgLogo({});
                  if (!res.ok) return toast.push(res.error.message, "error");
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
