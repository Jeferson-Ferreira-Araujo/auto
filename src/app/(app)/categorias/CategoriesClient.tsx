"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createCategory, updateCategory, deleteCategory } from "./actions";

type Cat = { id: string; name: string; isActive: boolean; _count: { mediaAssets: number } };

export function CategoriesClient({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  function refresh() {
    router.refresh();
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const res = await createCategory({ name });
      if (!res.ok) return toast.push(res.error.message, "error");
      setName("");
      toast.push("Categoria criada", "success");
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nova categoria (ex.: Promoções)"
              maxLength={40}
            />
            <Button type="submit" disabled={pending}>
              Adicionar
            </Button>
          </form>
        </CardBody>
      </Card>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda"
          description="Categorias ajudam a organizar suas mídias e são usadas pelas automações para escolher o que publicar."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category, onChange }: { category: Cat; onChange: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateCategory({ id: category.id, name });
      if (!res.ok) return toast.push(res.error.message, "error");
      setEditing(false);
      onChange();
    });
  }

  function toggle() {
    start(async () => {
      const res = await updateCategory({ id: category.id, isActive: !category.isActive });
      if (!res.ok) return toast.push(res.error.message, "error");
      onChange();
    });
  }

  function remove() {
    if (!confirm(`Excluir a categoria "${category.name}"? As mídias não serão apagadas.`)) return;
    start(async () => {
      const res = await deleteCategory({ id: category.id });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Categoria excluída", "success");
      onChange();
    });
  }

  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
              <Button size="sm" onClick={save} disabled={pending}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium">{category.name}</span>
              {category.isActive ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}
              <span className="text-xs text-[var(--color-muted)]">{category._count.mediaAssets} mídia(s)</span>
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={toggle} disabled={pending}>
              {category.isActive ? "Desativar" : "Ativar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
              Excluir
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
