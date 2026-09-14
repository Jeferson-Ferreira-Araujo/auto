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
  enabled: boolean;
};

export function FeatureFlagRow({ feature }: { feature: FeatureFlagView }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function toggle() {
    const next = !feature.enabled;
    if (!next && !confirm(`Desativar "${feature.label}" para TODAS as empresas do sistema?`)) return;
    start(async () => {
      const res = await setFeatureFlag({ key: feature.key, enabled: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? `"${feature.label}" ativada` : `"${feature.label}" desativada`, "success");
      router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b p-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{feature.label}</span>
          {feature.enabled ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              Ativa
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
        aria-checked={feature.enabled}
        onClick={toggle}
        disabled={pending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          feature.enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        } disabled:opacity-60`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            feature.enabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
