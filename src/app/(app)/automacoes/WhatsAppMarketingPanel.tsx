"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/display";
import type { WhatsAppHealthView } from "@/lib/whatsapp/health";
import { setWhatsappOutreach, setWhatsappPromoMessage } from "./whatsapp-marketing-actions";

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

export type WhatsAppMarketingState = {
  configured: boolean;
  connected: boolean;
  outreachEnabled: boolean;
  promoMessage: string;
  health: WhatsAppHealthView | null;
};

export function WhatsAppMarketingPanel({ state }: { state: WhatsAppMarketingState }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(state.promoMessage);
  const rating = state.health?.qualityRating ?? "UNKNOWN";
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

  if (!state.configured) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--color-muted)]">
            Integração com WhatsApp ainda não configurada neste ambiente.
          </p>
        </CardBody>
      </Card>
    );
  }

  const h = state.health;

  return (
    <div className="space-y-4">
      {!state.connected && (
        <Card>
          <CardBody>
            <p className="text-sm">
              Nenhum número do WhatsApp vinculado.{" "}
              <Link href="/configuracoes" className="font-medium text-[var(--color-primary)]">
                Conectar em Configurações →
              </Link>
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h3 className="mb-3 font-medium">Qualidade do número</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
            {h?.messagingLimitTier && (
              <span className="text-xs text-[var(--color-muted)]">
                · limite: {TIER_LABEL[h.messagingLimitTier] ?? h.messagingLimitTier}
              </span>
            )}
          </div>

          {(h?.checkedAt || h?.lastEventAt) && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {h?.checkedAt ? `Verificado em ${formatDateTime(h.checkedAt)}` : "Ainda não verificado"}
              {h?.lastEvent && h?.lastEventAt
                ? ` · Meta: ${EVENT_LABEL[h.lastEvent] ?? h.lastEvent} (${formatDateTime(h.lastEventAt)})`
                : ""}
            </p>
          )}

          {(rating === "RED" || rating === "YELLOW") && (
            <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              A qualidade caiu. Reduza os envios de divulgação e evite mensagens não solicitadas até voltar ao verde,
              senão o número pode ser limitado ou bloqueado pela Meta.
            </p>
          )}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.outreachEnabled}
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
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-1 font-medium">Mensagem da promoção</h3>
          <p className="mb-2 text-sm text-[var(--color-muted)]">
            Enviada na manhã seguinte a quem fez pedido e respondeu <strong>SIM</strong>. Deixe em branco para não
            enviar nada. O “responda SAIR para não receber mais” é adicionado automaticamente. Escreva{" "}
            <code className="rounded bg-[var(--color-bg)] px-1">{"{cupom}"}</code> para inserir o cupom ativo
            (crie cupons em <Link href="/produtos?view=cupons" className="text-[var(--color-primary)]">Produtos</Link>).
          </p>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={3}
            maxLength={900}
            placeholder="Ex.: Bom dia! 🥐 Hoje o bolo de fubá está saindo quentinho. Peça o seu!"
            className="w-full rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={saveMsg} disabled={pending || msg === state.promoMessage}>
              Salvar mensagem
            </Button>
            {!state.promoMessage && (
              <span className="text-xs text-[var(--color-muted)]">divulgação inativa (sem mensagem)</span>
            )}
          </div>

          <p className="mt-3 rounded-md bg-[var(--color-primary-soft)] px-2 py-1.5 text-xs text-[var(--color-primary)]">
            Como funciona: a atendente confirma o pedido normalmente e envia{" "}
            <code className="rounded bg-white/60 px-1">pedido 11999998888</code> (opcional: valor e{" "}
            <code className="rounded bg-white/60 px-1">cupom CODIGO</code>) no WhatsApp da AUTORA. A AUTORA registra
            e pede o consentimento ao cliente.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
