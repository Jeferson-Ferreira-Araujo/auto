"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrganization } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/primitives";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
];

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createOrganization({ name, timezone });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      <Field label="Nome da empresa">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Padaria da Esquina" />
      </Field>
      <Field label="Fuso horário" hint="Usado para agendar as publicações no horário certo.">
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando…" : "Criar empresa"}
      </Button>
    </form>
  );
}
