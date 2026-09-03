"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_SHORT } from "@/lib/display";
import { createAutomation, deleteAutomation, updateAutomation } from "./actions";

type Account = { id: string; username: string };
type Category = { id: string; name: string };
export type Automation = {
  id: string;
  name: string;
  instagramAccountId: string;
  categoryId: string | null;
  categoryName: string | null;
  mediaType: "IMAGE" | "VIDEO" | "ANY";
  selectionStrategy: "SEQUENTIAL" | "RANDOM" | "LEAST_USED";
  daysOfWeek: number[];
  publicationTime: string;
  isActive: boolean;
};

const STRATEGY_LABEL: Record<Automation["selectionStrategy"], string> = {
  SEQUENTIAL: "Em sequência",
  RANDOM: "Aleatória",
  LEAST_USED: "Menos usada primeiro",
};
const MEDIA_LABEL: Record<Automation["mediaType"], string> = {
  IMAGE: "Só imagens",
  VIDEO: "Só vídeos (Reels)",
  ANY: "Imagens e vídeos",
};

export function AutomationsClient({
  automations,
  accounts,
  categories,
}: {
  automations: Automation[];
  accounts: Account[];
  categories: Category[];
}) {
  const [editing, setEditing] = useState<Automation | "new" | null>(null);

  if (accounts.length === 0) {
    return (
      <EmptyState
        title="Conecte o Instagram primeiro"
        description="As automações publicam numa conta do Instagram. Conecte uma conta para começar."
        action={
          <a href="/instagram" className="text-sm font-medium text-[var(--color-primary)]">
            Ir para Instagram
          </a>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>Nova automação</Button>
      </div>

      {automations.length === 0 ? (
        <EmptyState
          title="Nenhuma automação"
          description="Crie uma regra recorrente: escolha categoria, dias e horário. O sistema seleciona a mídia e publica sozinho."
        />
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Card key={a.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    {a.isActive ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Pausada</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-muted)]">
                    {a.categoryName ?? "Todas as categorias"} · {MEDIA_LABEL[a.mediaType]} ·{" "}
                    {a.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")} às {a.publicationTime} ·{" "}
                    {STRATEGY_LABEL[a.selectionStrategy]}
                  </div>
                </div>
                <div className="flex gap-1">
                  <ToggleActive automation={a} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                    Editar
                  </Button>
                  <DeleteButton id={a.id} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <AutomationModal
          value={editing === "new" ? null : editing}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ToggleActive({ automation }: { automation: Automation }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await updateAutomation({ id: automation.id, isActive: !automation.isActive });
          if (!res.ok) return toast.push(res.error.message, "error");
          router.refresh();
        })
      }
    >
      {automation.isActive ? "Pausar" : "Ativar"}
    </Button>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir esta automação? Publicações já agendadas por ela que ainda não foram publicadas serão removidas.")) return;
        start(async () => {
          const res = await deleteAutomation({ id });
          if (!res.ok) return toast.push(res.error.message, "error");
          toast.push("Automação excluída", "success");
          router.refresh();
        });
      }}
    >
      Excluir
    </Button>
  );
}

function AutomationModal({
  value,
  accounts,
  categories,
  onClose,
}: {
  value: Automation | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [name, setName] = useState(value?.name ?? "");
  const [accountId, setAccountId] = useState(value?.instagramAccountId ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? "");
  const [mediaType, setMediaType] = useState<Automation["mediaType"]>(value?.mediaType ?? "ANY");
  const [strategy, setStrategy] = useState<Automation["selectionStrategy"]>(value?.selectionStrategy ?? "LEAST_USED");
  const [days, setDays] = useState<number[]>(value?.daysOfWeek ?? [1, 3, 5]);
  const [time, setTime] = useState(value?.publicationTime ?? "18:00");

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function submit() {
    const payload = {
      name,
      instagramAccountId: accountId,
      categoryId: categoryId || null,
      mediaType,
      selectionStrategy: strategy,
      daysOfWeek: days,
      publicationTime: time,
    };
    start(async () => {
      const res = value
        ? await updateAutomation({ id: value.id, ...payload })
        : await createAutomation(payload);
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(value ? "Automação atualizada" : "Automação criada", "success");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={value ? "Editar automação" : "Nova automação"}>
      <Field label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conteúdo Produtos" />
      </Field>
      <Field label="Publicar em">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Categoria">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de mídia">
          <Select value={mediaType} onChange={(e) => setMediaType(e.target.value as Automation["mediaType"])}>
            <option value="ANY">Imagens e vídeos</option>
            <option value="IMAGE">Só imagens</option>
            <option value="VIDEO">Só vídeos (Reels)</option>
          </Select>
        </Field>
        <Field label="Estratégia">
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value as Automation["selectionStrategy"])}>
            <option value="LEAST_USED">Menos usada primeiro</option>
            <option value="SEQUENTIAL">Em sequência</option>
            <option value="RANDOM">Aleatória</option>
          </Select>
        </Field>
      </div>
      <Field label="Dias da semana">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_SHORT.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`h-9 w-12 rounded-[var(--radius)] border text-sm ${
                days.includes(d) ? "bg-[var(--color-primary)] text-white" : "bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Horário">
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-40" />
      </Field>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={pending || days.length === 0}>
          {value ? "Salvar" : "Criar"}
        </Button>
      </div>
    </Modal>
  );
}
