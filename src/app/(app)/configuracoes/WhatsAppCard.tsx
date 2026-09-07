"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/display";
import type { WhatsAppHealthView } from "@/lib/whatsapp/health";
import {
  linkWhatsApp,
  regenerateWhatsAppCode,
  setWhatsappOutreach,
  setWhatsappPromoMessage,
  unlinkWhatsApp,
} from "./whatsapp-actions";

export type WhatsAppState = {
  configured: boolean;
  testNumber: string | null;
  outreachEnabled: boolean;
  promoMessage: string;
  health: WhatsAppHealthView | null;
  contact: { phoneE164: string; verified: boolean; verifiedAt: string | null; code: string | null } | null;
};

const RATING_UI: Record<WhatsAppHealthView["qualityRating"], { label: string; cls: string }> = {
  GREEN: { label: "Verde — boa", cls: "bg-green-100 text-green-800" },
  YELLOW: { label: "Amarela — atenção", cls: "bg-amber-100 text-amber-800" },
  RED: { label: "Vermelha — em risco", cls: "bg-red-100 text-red-800" },
  UNKNOWN: { label: "Sem dados ainda", cls: "bg-slate-100 text-slate-700" },
};

const EVENT_LABEL: Record<string, string> = {
  CHECK_FAILED: "falha ao verificar (token do WhatsApp pode ter expirado)",
  FLAGGED: "número sinalizado pela Meta",
  UNFLAGGED: "número normalizado",
  ONBOARDING: "em liberação",
};

const TIER_LABEL: Record<string, string> = {
  TIER_50: "50 clientes/dia",
  TIER_250: "250 clientes/dia",
  TIER_1K: "1.000 clientes/dia",
  TIER_10K: "10.000 clientes/dia",
  TIER_100K: "100.000 clientes/dia",
  TIER_UNLIMITED: "sem limite",
};

function WhatsAppHealthPanel({
  health,
  outreachEnabled,
  promoMessage,
}: {
  health: WhatsAppHealthView | null;
  outreachEnabled: boolean;
  promoMessage: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(promoMessage);
  const rating = health?.qualityRating ?? "UNKNOWN";
  const ui = RATING_UI[rating];

  function toggle(next: boolean) {
    start(async () => {
      const res = await setWhatsappOutreach({ enabled: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? "Divulgação por WhatsApp ativada" : "Divulgação por WhatsApp desativada", "success");
      router.refresh();
    });
  }

  function saveMsg() {
    start(async () => {
      const res = await setWhatsappPromoMessage({ message: msg });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(res.data.set ? "Mensagem de promoção salva" : "Promoção desativada (mensagem vazia)", "success");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-[var(--radius)] border bg-[var(--color-bg)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Qualidade do número</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
        {health?.messagingLimitTier && (
          <span className="text-xs text-[var(--color-muted)]">
            · limite: {TIER_LABEL[health.messagingLimitTier] ?? health.messagingLimitTier}
          </span>
        )}
      </div>

      {(health?.checkedAt || health?.lastEventAt) && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {health?.checkedAt ? `Verificado em ${formatDateTime(health.checkedAt)}` : "Ainda não verificado"}
          {health?.lastEvent && health?.lastEventAt
            ? ` · Meta: ${EVENT_LABEL[health.lastEvent] ?? health.lastEvent} (${formatDateTime(health.lastEventAt)})`
            : ""}
        </p>
      )}

      {rating === "RED" || rating === "YELLOW" ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          A qualidade caiu. Reduza os envios de divulgação e evite mensagens não solicitadas até voltar ao verde,
          senão o número pode ser limitado ou bloqueado pela Meta.
        </p>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={outreachEnabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border)]"
        />
        <span>
          Enviar mensagens de <strong>divulgação</strong> aos clientes
          <span className="block text-xs text-[var(--color-muted)]">
            Desligue aqui se a qualidade cair. Não afeta o atendimento (respostas continuam normais).
          </span>
        </span>
      </label>

      <div className="mt-3 border-t pt-3">
        <p className="text-sm font-medium">Mensagem da promoção</p>
        <p className="mb-1.5 text-xs text-[var(--color-muted)]">
          Enviada na manhã seguinte a quem fez pedido e respondeu <strong>SIM</strong>. Deixe em branco para não
          enviar nada. O “responda SAIR para não receber mais” é adicionado automaticamente. Escreva{" "}
          <code className="rounded bg-[var(--color-bg)] px-1">{"{cupom}"}</code> para inserir o cupom ativo (veja abaixo).
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          maxLength={900}
          placeholder="Ex.: Bom dia! 🥐 Hoje o bolo de fubá está saindo quentinho. Peça o seu!"
          className="w-full rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 text-sm"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <Button size="sm" onClick={saveMsg} disabled={pending || msg === promoMessage}>
            Salvar mensagem
          </Button>
          {!promoMessage && <span className="text-xs text-[var(--color-muted)]">divulgação inativa (sem mensagem)</span>}
        </div>
      </div>

      <p className="mt-3 rounded-md bg-[var(--color-primary-soft)] px-2 py-1.5 text-xs text-[var(--color-primary)]">
        Como funciona: a atendente confirma o pedido normalmente e envia aqui{" "}
        <code className="rounded bg-white/60 px-1">pedido 11999998888</code> (opcional: valor). A AUTORA registra e
        pede o consentimento ao cliente.
      </p>
    </div>
  );
}

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
          Opere a AUTORA por mensagem: envie foto/vídeo para publicar ou agendar, veja a agenda,
          pause/ative automações, mova mídias para categorias, consulte o desempenho e peça a melhoria
          de vídeo. Digite <strong>menu</strong> no WhatsApp para as opções.
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

        <WhatsAppHealthPanel
          health={state.health}
          outreachEnabled={state.outreachEnabled}
          promoMessage={state.promoMessage}
        />
      </CardBody>
    </Card>
  );
}
