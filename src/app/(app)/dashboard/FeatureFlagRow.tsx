"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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

  function toggle() {
    const next = !feature.ownEnabled;
    if (!next && !confirm(`Desativar "${feature.label}" para TODAS as empresas do sistema?`)) return;
    start(async () => {
      const res = await setFeatureFlag({ key: feature.key, enabled: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? `"${feature.label}" ativada` : `"${feature.label}" desativada`, "success");
      router.refresh();
    });
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
        onClick={toggle}
        disabled={pending || feature.disabledByParent}
        title={feature.disabledByParent ? "Ligue a categoria acima para controlar isto" : undefined}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          feature.ownEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        } disabled:opacity-40`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            feature.ownEnabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
