"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createCoupon, deleteCoupon, toggleCoupon } from "./coupon-actions";

export type CouponView = {
  id: string;
  code: string;
  description: string | null;
  kind: "PERCENT" | "AMOUNT";
  value: number; // PERCENT: 1..100 · AMOUNT: centavos
  minOrderCents: number | null;
  expiresAt: string | null;
  active: boolean;
  timesSent: number;
  timesRedeemed: number;
};

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const ddmmyyyy = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

function describe(c: CouponView): string {
  const base = c.kind === "PERCENT" ? `${c.value}% off` : `${brl(c.value)} off`;
  const min = c.minOrderCents ? ` · mín ${brl(c.minOrderCents)}` : "";
  return base + min;
}

export function CouponsManager({ coupons }: { coupons: CouponView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  function create(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(value.replace(",", "."));
    if (!code.trim() || !num || num <= 0) return toast.push("Preencha código e valor.", "error");
    start(async () => {
      const res = await createCoupon({
        code: code.trim(),
        kind,
        value: kind === "PERCENT" ? Math.round(num) : num,
        description: description.trim() || null,
        minOrderReais: minOrder ? Number(minOrder.replace(",", ".")) : null,
        expiresOn: expiresOn || null,
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(`Cupom ${res.data.code} criado`, "success");
      setCode("");
      setValue("");
      setDescription("");
      setMinOrder("");
      setExpiresOn("");
      router.refresh();
    });
  }

  function toggle(id: string, active: boolean) {
    start(async () => {
      const res = await toggleCoupon({ id, active });
      if (!res.ok) return toast.push(res.error.message, "error");
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Excluir este cupom?")) return;
    start(async () => {
      const res = await deleteCoupon({ id });
      if (!res.ok) return toast.push(res.error.message, res.error.message.includes("desativado") ? "info" : "error");
      toast.push("Cupom excluído", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">Cupons de desconto</h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          O cupom <strong>ativo</strong> mais recente entra automaticamente na promoção do WhatsApp. Use{" "}
          <code className="rounded bg-[var(--color-bg)] px-1">{"{cupom}"}</code> na mensagem para escolher onde ele aparece
          (senão vai no fim). A atendente registra o uso com{" "}
          <code className="rounded bg-[var(--color-bg)] px-1">pedido 11999998888 cupom CODIGO</code>.
        </p>

        {coupons.length > 0 && (
          <ul className="mb-4 divide-y">
            {coupons.map((c) => {
              const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className="text-[var(--color-muted)]">{describe(c)}</span>
                  {c.description && <span className="text-xs text-[var(--color-muted)]">· {c.description}</span>}
                  {c.expiresAt && (
                    <span className={`text-xs ${expired ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
                      · {expired ? "expirado" : `até ${ddmmyyyy(c.expiresAt)}`}
                    </span>
                  )}
                  <Badge tone={c.active && !expired ? "success" : "neutral"}>
                    {c.active ? (expired ? "expirado" : "ativo") : "inativo"}
                  </Badge>
                  <span className="text-xs text-[var(--color-muted)]">
                    {c.timesSent} enviados · {c.timesRedeemed} usados
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => toggle(c.id, !c.active)}>
                      {c.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(c.id)}>
                      Excluir
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={create} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Código">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PAO10" />
          </Field>
          <Field label="Tipo">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "PERCENT" | "AMOUNT")}
              className="w-full rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 text-sm"
            >
              <option value="PERCENT">Porcentagem</option>
              <option value="AMOUNT">Valor (R$)</option>
            </select>
          </Field>
          <Field label={kind === "PERCENT" ? "% desconto" : "R$ desconto"}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder={kind === "PERCENT" ? "10" : "5,00"} />
          </Field>
          <Field label="Vence em (opcional)">
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
          <Field label="Descrição (opcional)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Só em bolos" />
          </Field>
          <Field label="Pedido mínimo R$ (opcional)">
            <Input value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputMode="decimal" placeholder="30" />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-4">
            <Button type="submit" disabled={pending}>
              Criar cupom
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
