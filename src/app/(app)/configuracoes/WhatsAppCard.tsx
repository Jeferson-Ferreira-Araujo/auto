"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/display";
import { linkWhatsApp, regenerateWhatsAppCode, unlinkWhatsApp } from "./whatsapp-actions";

export type WhatsAppState = {
  configured: boolean;
  testNumber: string | null;
  contact: { phoneE164: string; verified: boolean; verifiedAt: string | null; code: string | null } | null;
};

export function WhatsAppCard({ state }: { state: WhatsAppState }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(state.contact?.code ?? null);

  if (!state.configured) {
    return (
      <Card>
        <CardBody>
          <h3 className="mb-1 font-medium">WhatsApp</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Integração com WhatsApp ainda não configurada neste ambiente. Defina as variáveis
            <code className="mx-1 rounded bg-[var(--color-bg)] px-1">WHATSAPP_*</code> para ativar.
          </p>
        </CardBody>
      </Card>
    );
  }

  const contact = state.contact;

  function doLink(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await linkWhatsApp({ phone });
      if (!res.ok) return toast.push(res.error.message, "error");
      setCode(res.data.code);
      toast.push("Código gerado. Envie-o pelo WhatsApp.", "success");
      router.refresh();
    });
  }

  function regen() {
    start(async () => {
      const res = await regenerateWhatsAppCode({});
      if (!res.ok) return toast.push(res.error.message, "error");
      setCode(res.data.code);
      router.refresh();
    });
  }

  function unlink() {
    if (!confirm("Desvincular o WhatsApp desta empresa?")) return;
    start(async () => {
      const res = await unlinkWhatsApp({});
      if (!res.ok) return toast.push(res.error.message, "error");
      setCode(null);
      setPhone("");
      toast.push("WhatsApp desvinculado", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">WhatsApp</h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Controle a NEZZA por mensagem: pausar/ativar automações, ver o que está programado, cancelar
          publicações do dia e agendar enviando uma foto com legenda.
        </p>

        {contact?.verified ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Vinculado</span>
              <span className="font-medium">{contact.phoneE164}</span>
            </div>
            {contact.verifiedAt && (
              <p className="text-xs text-[var(--color-muted)]">Verificado em {formatDateTime(contact.verifiedAt)}</p>
            )}
            <div className="pt-1">
              <Button size="sm" variant="secondary" onClick={unlink} disabled={pending}>
                Desvincular
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <form onSubmit={doLink} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Field label="Seu WhatsApp (com DDD)">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-8888"
                    inputMode="tel"
                  />
                </Field>
              </div>
              <Button type="submit" disabled={pending || phone.length < 8}>
                Gerar código
              </Button>
            </form>

            {(code || contact) && (
              <div className="rounded-[var(--radius)] border bg-[var(--color-bg)] p-3 text-sm">
                <p>
                  Envie a mensagem <strong className="tracking-widest">{code ?? contact?.code ?? "——————"}</strong> para o
                  WhatsApp{" "}
                  <strong>{state.testNumber ?? "(número de teste da Meta)"}</strong>.
                </p>
                <button onClick={regen} className="mt-2 text-xs font-medium text-[var(--color-primary)]" disabled={pending}>
                  Gerar novo código
                </button>
              </div>
            )}

            <p className="text-xs text-[var(--color-muted)]">
              Antes: adicione seu número como destinatário de teste no painel da Meta
              (WhatsApp → API Setup → “To”).
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
