"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { CategoryNode } from "@/lib/categories";
import { createCategory, updateCategory, deleteCategory } from "./actions";

export function CategoriesClient({ nodes }: { nodes: CategoryNode[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingUnder, setAddingUnder] = useState<string | null>(null);

  const hasChildren = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) if (n.parentId) s.add(n.parentId);
    return s;
  }, [nodes]);

  const visible = nodes.filter((n) => {
    // esconde se algum ancestral está recolhido
    let pid = n.parentId;
    while (pid) {
      if (collapsed.has(pid)) return false;
      pid = nodes.find((x) => x.id === pid)?.parentId ?? null;
    }
    return true;
  });

  function refresh() {
    router.refresh();
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addRoot(e: React.FormEvent) {
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
          <form onSubmit={addRoot} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nova categoria (ex.: Produtos)"
              maxLength={40}
            />
            <Button type="submit" disabled={pending}>
              Adicionar
            </Button>
          </form>
        </CardBody>
      </Card>

      {nodes.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda"
          description="Crie uma categoria e depois subcategorias livres dentro dela."
        />
      ) : (
        <Card>
          <CardBody className="divide-y p-0">
            {visible.map((n) => (
              <NodeRow
                key={n.id}
                node={n}
                hasChildren={hasChildren.has(n.id)}
                collapsed={collapsed.has(n.id)}
                onToggleCollapse={() => toggleCollapse(n.id)}
                adding={addingUnder === n.id}
                onStartAdd={() => setAddingUnder(addingUnder === n.id ? null : n.id)}
                onDoneAdd={() => {
                  setAddingUnder(null);
                  refresh();
                }}
                onChanged={refresh}
              />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function NodeRow({
  node,
  hasChildren,
  collapsed,
  onToggleCollapse,
  adding,
  onStartAdd,
  onDoneAdd,
  onChanged,
}: {
  node: CategoryNode;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  adding: boolean;
  onStartAdd: () => void;
  onDoneAdd: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const [subName, setSubName] = useState("");

  function saveName() {
    start(async () => {
      const res = await updateCategory({ id: node.id, name });
      if (!res.ok) return toast.push(res.error.message, "error");
      setEditing(false);
      onChanged();
    });
  }

  function toggleActive() {
    start(async () => {
      const res = await updateCategory({ id: node.id, isActive: !node.isActive });
      if (!res.ok) return toast.push(res.error.message, "error");
      onChanged();
    });
  }

  function remove() {
    if (hasChildren) {
      if (!confirm(`Excluir "${node.name}" e TODAS as suas subcategorias? As mídias não serão apagadas.`)) return;
    } else if (!confirm(`Excluir a categoria "${node.name}"? As mídias não serão apagadas.`)) {
      return;
    }
    start(async () => {
      const res = await deleteCategory({ id: node.id, withChildren: hasChildren });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Categoria excluída", "success");
      onChanged();
    });
  }

  function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!subName.trim()) return;
    start(async () => {
      const res = await createCategory({ name: subName, parentId: node.id });
      if (!res.ok) return toast.push(res.error.message, "error");
      setSubName("");
      toast.push("Subcategoria criada", "success");
      onDoneAdd();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 p-3" style={{ paddingLeft: 12 + node.depth * 20 }}>
        <button
          onClick={onToggleCollapse}
          className={`w-4 text-xs text-[var(--color-muted)] ${hasChildren ? "" : "invisible"}`}
        >
          {collapsed ? "▸" : "▾"}
        </button>

        {editing ? (
          <>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" />
            <Button size="sm" onClick={saveName} disabled={pending}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <span className={`text-sm font-medium ${node.isActive ? "" : "text-[var(--color-muted)] line-through"}`}>
              {node.name}
            </span>
            {!node.isActive && <Badge>Inativa</Badge>}
            <span className="text-xs text-[var(--color-muted)]">{node.mediaCount} mídia(s)</span>
            <div className="ml-auto flex shrink-0 gap-0.5">
              <Button size="sm" variant="ghost" onClick={onStartAdd} disabled={pending} title="Adicionar subcategoria">
                + Sub
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleActive} disabled={pending}>
                {node.isActive ? "Desativar" : "Ativar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
                Excluir
              </Button>
            </div>
          </>
        )}
      </div>

      {adding && (
        <form onSubmit={addSub} className="flex gap-2 pb-3" style={{ paddingLeft: 32 + node.depth * 20, paddingRight: 12 }}>
          <Input
            autoFocus
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder={`Subcategoria de "${node.name}" (ex.: Pizzas, Frango…)`}
            maxLength={40}
            className="h-8"
          />
          <Button size="sm" type="submit" disabled={pending}>
            Criar
          </Button>
        </form>
      )}
    </div>
  );
}
