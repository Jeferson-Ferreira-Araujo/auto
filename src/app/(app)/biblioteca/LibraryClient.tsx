"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mediaUrl, formatDateTime } from "@/lib/display";
import { deleteMedia, updateMedia, reprocessMedia } from "./actions";

export type MediaItem = {
  id: string;
  type: "IMAGE" | "VIDEO";
  name: string;
  caption: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  usageCount: number;
  lastPublishedAt: string | null;
  processingStatus: "PENDING" | "READY" | "INCOMPATIBLE" | "FAILED";
  processingError: string | null;
  processingNote: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
};

type Category = { id: string; name: string };
type Filter = "all" | "image" | "video" | "active" | "inactive" | "expired";

export function LibraryClient({ items, categories }: { items: MediaItem[]; categories: Category[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryId, setCategoryId] = useState<string>("");
  const [editing, setEditing] = useState<MediaItem | null>(null);

  const [now] = useState(() => Date.now());
  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (categoryId && m.categoryId !== categoryId) return false;
      switch (filter) {
        case "image":
          return m.type === "IMAGE";
        case "video":
          return m.type === "VIDEO";
        case "active":
          return m.isActive;
        case "inactive":
          return !m.isActive;
        case "expired":
          return m.availableUntil != null && new Date(m.availableUntil).getTime() < now;
        default:
          return true;
      }
    });
  }, [items, filter, categoryId, now]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "image", label: "Imagens" },
    { key: "video", label: "Vídeos" },
    { key: "active", label: "Ativos" },
    { key: "inactive", label: "Inativos" },
    { key: "expired", label: "Expirados" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f.key ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] border"
            }`}
          >
            {f.label}
          </button>
        ))}
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="ml-auto h-8 w-48">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma mídia aqui" description="Ajuste os filtros ou envie novos arquivos." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <MediaCard key={m.id} item={m} now={now} onOpen={() => setEditing(m)} />
          ))}
        </div>
      )}

      {editing && (
        <EditModal item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function MediaCard({ item, now, onOpen }: { item: MediaItem; now: number; onOpen: () => void }) {
  const expired = item.availableUntil != null && new Date(item.availableUntil).getTime() < now;
  return (
    <Card className="overflow-hidden">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-square bg-[var(--color-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(item.id, "thumb")} alt={item.name} className="h-full w-full object-cover" />
          <span className="absolute left-1.5 top-1.5">
            <Badge tone={item.type === "VIDEO" ? "info" : "neutral"}>{item.type === "VIDEO" ? "Vídeo" : "Imagem"}</Badge>
          </span>
        </div>
        <div className="p-2.5">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {!item.isActive && <Badge>Inativo</Badge>}
            {expired && <Badge tone="warning">Expirado</Badge>}
            {item.processingStatus === "INCOMPATIBLE" && <Badge tone="danger">Incompatível</Badge>}
            {item.processingStatus === "READY" && item.isActive && !expired && <Badge tone="success">Pronto</Badge>}
            {item.categoryName && <Badge tone="primary">{item.categoryName}</Badge>}
          </div>
        </div>
      </button>
    </Card>
  );
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function EditModal({
  item,
  categories,
  onClose,
}: {
  item: MediaItem;
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(item.name);
  const [caption, setCaption] = useState(item.caption ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [isActive, setIsActive] = useState(item.isActive);
  const [from, setFrom] = useState(toDateInput(item.availableFrom));
  const [until, setUntil] = useState(toDateInput(item.availableUntil));

  function save() {
    start(async () => {
      const res = await updateMedia({
        id: item.id,
        name,
        caption: caption.trim() ? caption : null,
        categoryId: categoryId || null,
        isActive,
        availableFrom: from ? new Date(from) : null,
        availableUntil: until ? new Date(until) : null,
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Mídia atualizada", "success");
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Excluir esta mídia? O arquivo será removido do armazenamento.")) return;
    start(async () => {
      const res = await deleteMedia({ id: item.id });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Mídia excluída", "success");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar mídia" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-[var(--radius)] border bg-[var(--color-bg)]">
            {item.type === "VIDEO" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={mediaUrl(item.id, "preview")} controls className="max-h-80 w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(item.id, "preview")} alt={item.name} className="max-h-80 w-full object-contain" />
            )}
          </div>
          <dl className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
            <div>Dimensões: {item.width && item.height ? `${item.width}×${item.height}` : "—"}</div>
            {item.duration != null && <div>Duração: {item.duration.toFixed(1)}s</div>}
            <div>Enviada em: {formatDateTime(item.createdAt)}</div>
            <div>
              Uso: {item.usageCount}x{" "}
              {item.lastPublishedAt ? `· última em ${formatDateTime(item.lastPublishedAt)}` : "· nunca publicada"}
            </div>
          </dl>
          {item.processingStatus === "INCOMPATIBLE" && (
            <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
              {item.processingError}
              {item.type === "IMAGE" && (
                <button
                  onClick={() =>
                    start(async () => {
                      const res = await reprocessMedia({ id: item.id });
                      if (!res.ok) return toast.push(res.error.message, "error");
                      toast.push("Mídia reprocessada", "success");
                      onClose();
                      router.refresh();
                    })
                  }
                  className="ml-2 font-medium underline"
                  disabled={pending}
                >
                  Ajustar automaticamente
                </button>
              )}
            </div>
          )}
          {item.processingNote && item.processingStatus === "READY" && (
            <p className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-800">{item.processingNote}</p>
          )}
        </div>

        <div>
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Legenda padrão" hint="Usada automaticamente quando esta mídia for publicada.">
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Disponível a partir de">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Disponível até">
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Mídia ativa (pode ser publicada automaticamente)
          </label>

          <div className="flex justify-between">
            <Button variant="danger" onClick={remove} disabled={pending}>
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={pending}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
