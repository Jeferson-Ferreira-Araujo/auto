"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EXPIRATION_STATUS_LABEL, EXPIRATION_STATUS_TONE, formatExpirationDate } from "@/lib/products/status";
import type { ExpirationRow } from "@/lib/products/queries";
import { resolveExpiration } from "./actions";

const OUTCOMES: { value: "SOLD" | "DISCARDED" | "PRICED_DOWN"; label: string }[] = [
  { value: "SOLD", label: "Vendido" },
  { value: "PRICED_DOWN", label: "Preço rebaixado" },
  { value: "DISCARDED", label: "Descartado" },
];

export function ExpirationList({ rows }: { rows: ExpirationRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon="✅" title="Nada pendente" description="Nenhuma validade em aberto no momento." />;
  }

  function resolve(id: string, outcome: (typeof OUTCOMES)[number]["value"]) {
    setBusyId(id);
    start(async () => {
      const res = await resolveExpiration({ id, outcome });
      setBusyId(null);
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Registro resolvido", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="divide-y p-0">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{r.productName}</span>
                <Badge tone={EXPIRATION_STATUS_TONE[r.status]}>{EXPIRATION_STATUS_LABEL[r.status]}</Badge>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {r.quantity} un · vence {formatExpirationDate(r.expirationDate)}
                {r.location ? ` · ${r.location}` : ""}
                {r.lot ? ` · lote ${r.lot}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map((o) => (
                <Button
                  key={o.value}
                  size="sm"
                  variant="secondary"
                  disabled={pending && busyId === r.id}
                  onClick={() => resolve(r.id, o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
