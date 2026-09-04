"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { syncInsightsNow } from "./insights-actions";

export function SyncInsightsButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await syncInsightsNow({});
            if (!res.ok) return toast.push(res.error.message, "error");
            if (res.data.synced) {
              toast.push("Relatórios atualizados!", "success");
              router.refresh();
            } else if (res.data.needsReconnect) {
              setMsg(
                "O Instagram não liberou o acesso às métricas. Reconecte e mantenha TODAS as permissões marcadas.",
              );
            } else {
              setMsg(res.data.error ?? "Ainda sem dados. Tente novamente em alguns minutos.");
            }
          })
        }
      >
        {pending ? "Sincronizando…" : "Sincronizar agora"}
      </Button>
      {msg && <p className="max-w-xs text-center text-xs text-[var(--color-danger)]">{msg}</p>}
    </div>
  );
}
