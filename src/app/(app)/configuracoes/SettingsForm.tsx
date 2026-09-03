"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { updateOrganization } from "./actions";

export function SettingsForm({ name, uploadLimitMb }: { name: string; uploadLimitMb: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [limit, setLimit] = useState(String(uploadLimitMb));

  function save() {
    start(async () => {
      const res = await updateOrganization({ name: n, uploadLimitMb: Number(limit) });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Configurações salvas", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <Field label="Nome da empresa">
          <Input value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Field label="Limite de upload por arquivo (MB)" hint="Vídeos grandes consomem mais do free tier de armazenamento.">
          <Input type="number" min={10} max={1024} value={limit} onChange={(e) => setLimit(e.target.value)} className="w-40" />
        </Field>
        <Button onClick={save} disabled={pending}>
          Salvar
        </Button>
      </CardBody>
    </Card>
  );
}
