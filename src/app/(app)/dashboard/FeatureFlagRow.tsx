"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setFeatureFlag } from "./admin-actions";
import type { FeatureKey } from "@/lib/features";

export type FeatureFlagView = {
  key: FeatureKey;
  label: string;
  description: string;
  /** Estado do próprio interruptor (independente do pai). */
  ownEnabled: boolean;
  /** Verdadeiro se um ancestral (categoria) está desligado — desliga isto na prática também. */
  disabledByParent: boolean;
  /** Sub-item de uma categoria (indenta e mostra um traço à esquerda). */
  nested?: boolean;
};

export function FeatureFlagRow({ feature }: { feature: FeatureFlagView }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function apply(next: boolean) {
    start(async () => {
      const res = await setFeatureFlag({ key: feature.key, enabled: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? `"${feature.label}" ativada` : `"${feature.label}" desativada`, "success");
      setConfirming(false);
      router.refresh();
    });
  }

  function requestToggle() {
    if (feature.ownEnabled) {
      setConfirming(true); // desligar precisa de confirmação — afeta todas as empresas
    } else {
      apply(true);
    }
  }

  const effectivelyOn = feature.ownEnabled && !feature.disabledByParent;

  return (
    <div
      className={`flex items-start justify-between gap-4 border-b p-3 last:border-0 ${
        feature.nested ? "border-l-2 border-dashed pl-6" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{feature.label}</span>
          {effectivelyOn ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              Ativa
            </span>
          ) : feature.disabledByParent ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Desativada (categoria desligada)
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
              Desativada
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{feature.description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={feature.ownEnabled}
        onClick={requestToggle}
        disabled={pending || feature.disabledByParent}
        title={feature.disabledByParent ? "Ligue a categoria acima para controlar isto" : undefined}
        className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          feature.ownEnabled
            ? "justify-end border-[var(--color-primary)] bg-[var(--color-primary)]"
            : "justify-start border-[var(--color-border)] bg-[var(--color-border)]"
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow" />
      </button>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Desativar funcionalidade">
        <p className="text-sm">
          Desativar <strong>&quot;{feature.label}&quot;</strong> para <strong>todas as empresas</strong> do sistema
          agora?
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{feature.description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => apply(false)} disabled={pending}>
            {pending ? "Desativando…" : "Desativar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
