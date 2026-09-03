"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { disconnectInstagram } from "./actions";

export function DisconnectButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!confirm("Desconectar o Instagram? Publicações agendadas serão canceladas.")) return;
        start(async () => {
          const res = await disconnectInstagram({});
          if (!res.ok) return toast.push(res.error.message, "error");
          toast.push("Instagram desconectado", "success");
          router.refresh();
        });
      }}
    >
      Desconectar
    </Button>
  );
}
