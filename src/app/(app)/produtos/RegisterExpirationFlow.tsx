"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { lookupProduct, registerExpiration } from "./actions";

type Step = "identify" | "details";

export function RegisterExpirationFlow() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [step, setStep] = useState<Step>("identify");
  const [productId, setProductId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expirationDate, setExpirationDate] = useState("");
  const [location, setLocation] = useState("");
  const [lot, setLot] = useState("");

  function onBarcode(code: string) {
    setBarcode(code);
    start(async () => {
      const res = await lookupProduct({ barcode: code });
      if (res.ok && res.data.product) {
        setProductId(res.data.product.id);
        setProductName(res.data.product.name);
      } else {
        setProductId(null);
      }
      setStep("details");
    });
  }

  function useTypedName() {
    if (productName.trim().length < 1) return;
    setBarcode(null);
    setProductId(null);
    setStep("details");
  }

  function submit() {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return toast.push("Quantidade inválida", "error");
    if (!expirationDate) return toast.push("Informe a data de validade", "error");
    start(async () => {
      const res = await registerExpiration({
        productId: productId ?? undefined,
        barcode: barcode ?? undefined,
        productName: productId ? undefined : productName.trim() || undefined,
        quantity: qty,
        expirationDate: new Date(expirationDate),
        lot: lot.trim() || null,
        location: location.trim() || null,
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(`Validade registrada: ${res.data.productName}`, "success");
      router.push("/produtos");
      router.refresh();
    });
  }

  if (step === "identify") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-sm font-semibold">1. Qual é o produto?</h2>
            <BarcodeScanner onDetect={onBarcode} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">Ou digite o nome:</p>
            <div className="flex gap-2">
              <Input
                placeholder="Ex.: Coca-Cola 2L"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
              <Button type="button" disabled={productName.trim().length < 1} onClick={useTypedName}>
                Continuar
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardBody className="space-y-1">
          <h2 className="text-sm font-semibold">
            2. {productId ? productName : productName || "Novo produto"}
            {barcode && <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">· {barcode}</span>}
          </h2>

          {!productId && (
            <Field label="Nome do produto">
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ex.: Coca-Cola 2L" />
            </Field>
          )}

          <Field label="Quantidade">
            <Input
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
              className="text-lg"
            />
          </Field>

          <Field label="Data de validade">
            <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="text-lg" />
          </Field>

          <Field label="Local (opcional)">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Gôndola 3 / Geladeira" />
          </Field>

          <Field label="Lote (opcional)">
            <Input value={lot} onChange={(e) => setLot(e.target.value)} />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep("identify")}>
              Voltar
            </Button>
            <Button type="button" disabled={pending} onClick={submit} className="flex-1">
              {pending ? "Salvando…" : "Salvar validade"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
