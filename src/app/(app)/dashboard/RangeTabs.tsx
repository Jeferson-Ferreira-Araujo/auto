"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
] as const;

function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export function RangeTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("range") ?? "7d";
  const [from, setFrom] = useState(params.get("from") ?? todayISO(29));
  const [to, setTo] = useState(params.get("to") ?? todayISO(0));

  function go(range: string, extra?: Record<string, string>) {
    const q = new URLSearchParams();
    q.set("view", "desempenho");
    q.set("range", range);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    router.push(`/dashboard?${q.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-[var(--radius)] border p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => (t.key === "custom" ? go("custom", { from, to }) : go(t.key))}
            className={cn(
              "rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm",
              current === t.key
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-muted)] hover:bg-black/5",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {current === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--color-muted)]">
            De
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 block rounded-[var(--radius)] border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--color-muted)]">
            Até
            <input
              type="date"
              value={to}
              max={todayISO(0)}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 block rounded-[var(--radius)] border px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={() => go("custom", { from, to })}
            className="rounded-[var(--radius)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
