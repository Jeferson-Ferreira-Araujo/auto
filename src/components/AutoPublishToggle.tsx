"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setAutoPublish } from "@/app/(app)/configuracoes/actions";

export function AutoPublishToggle({ status }: { status: "ACTIVE" | "PAUSED" }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const paused = status === "PAUSED";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border bg-[var(--color-surface)] p-4">
      <div>
        <div className="font-medium">Publicação automática</div>
        <div className="text-sm text-[var(--color-muted)]">
          {paused
            ? "Pausada. As automações não publicam. Publicações manuais continuam funcionando."
            : "Ativa. As automações publicam nos horários agendados."}
        </div>
      </div>
      <Button
        variant={paused ? "primary" : "secondary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setAutoPublish({ status: paused ? "ACTIVE" : "PAUSED" });
            if (!res.ok) return toast.push(res.error.message, "error");
            toast.push(paused ? "Publicação automática retomada" : "Publicação automática pausada", "success");
            router.refresh();
          })
        }
      >
        {paused ? "Retomar" : "Pausar tudo"}
      </Button>
    </div>
  );
}
