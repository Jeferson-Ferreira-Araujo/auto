"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { updateAutomation } from "@/app/(app)/automacoes/actions";

export function AutomationToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await updateAutomation({ id, isActive: next });
      if (!res.ok) {
        setOn(!next);
        return toast.push(res.error.message, "error");
      }
      toast.push(next ? "Automação ativada" : "Automação pausada", "success");
      router.refresh();
    });
  }

  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={toggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-[var(--color-primary)]" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
