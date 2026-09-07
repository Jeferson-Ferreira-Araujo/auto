"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { LabelScanner, type LabelScanResult } from "@/components/LabelScanner";
import { fileToDownscaledDataUrl } from "@/lib/image/downscale";
import { lookupProduct, registerExpiration, setProductImage } from "./actions";

function formatISOToBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

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
  const [dateOptions, setDateOptions] = useState<string[]>([]);
  const [nameOptions, setNameOptions] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);

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

  function onLabelResult(r: LabelScanResult) {
    setDateOptions(r.dates);
    setNameOptions(r.names);
    if (r.dates[0]) setExpirationDate(r.dates[0]);
    if (r.names[0] && productName.trim().length === 0) setProductName(r.names[0]);
    if (r.photo) setPhoto(r.photo);
    setBarcode(null);
    setProductId(null);
    setStep("details");
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await fileToDownscaledDataUrl(file));
    } catch {
      toast.push("Não consegui abrir essa imagem", "error");
    }
  }

  function useTypedName() {
    if (productName.trim().length < 1) return;
    setBarcode(null);
    setProductId(null);
    setStep("details");
  }

  function submit() {
    const qty = Number(quantity);
    if (!productId && productName.trim().length < 1) return toast.push("Informe o nome do produto", "error");
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
      if (photo) {
        const up = await setProductImage({ productId: res.data.productId, dataUrl: photo });
        if (!up.ok) toast.push("Validade salva, mas a foto não subiu.", "error");
      }
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
            <p className="text-sm text-[var(--color-muted)]">
              Aponte para a validade impressa — a AUTORA lê a data e o nome, e guarda a foto.
            </p>
            <LabelScanner onResult={onLabelResult} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold">Ou digite o nome</p>
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
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Tem código de barras? <span className="font-medium">(opcional)</span> — ajuda a reconhecer o produto da próxima vez.
            </p>
            <BarcodeScanner onDetect={onBarcode} />
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
              {nameOptions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {nameOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setProductName(n)}
                      className="rounded-full border px-2.5 py-1 text-xs hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}

          <Field label="Foto do produto (opcional)">
            <div className="flex items-center gap-3">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-md border object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-[var(--color-bg)] text-[var(--color-muted)]">
                  <Icon.box width={22} height={22} />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded-md bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)]">
                  {photo ? "Trocar foto" : "Tirar / escolher foto"}
                  <input type="file" accept="image/*" capture="environment" onChange={onPhotoFile} className="hidden" />
                </label>
                {photo && (
                  <button type="button" onClick={() => setPhoto(null)} className="text-left text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]">
                    Remover
                  </button>
                )}
              </div>
            </div>
          </Field>

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
            {dateOptions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {dateOptions.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setExpirationDate(iso)}
                    className={`rounded-full border px-2.5 py-1 text-xs hover:border-[var(--color-primary)] ${
                      expirationDate === iso
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                        : ""
                    }`}
                  >
                    {formatISOToBR(iso)}
                  </button>
                ))}
              </div>
            )}
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
