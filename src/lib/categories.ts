import { prisma } from "@/lib/db";

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  isActive: boolean;
  depth: number;
  /** nomes do caminho da raiz até este nó, ex.: ["Produtos","Pizzas","Frango"] */
  path: string[];
  mediaCount: number;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

/** Caminho legível: "Produtos › Pizzas › Frango". */
export function formatPath(path: string[]): string {
  return path.join(" › ");
}

/**
 * Carrega todas as categorias da organização já achatadas em ordem DFS,
 * com `depth`, `path` e contagem de mídias. Uma consulta.
 */
export async function loadCategoryTree(organizationId: string): Promise<CategoryNode[]> {
  const rows = await prisma.mediaCategory.findMany({
    where: { organizationId },
    include: { _count: { select: { mediaAssets: true } } },
    orderBy: { name: "asc" },
  });

  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const k = r.parentId;
    byParent.set(k, [...(byParent.get(k) ?? []), r]);
  }

  const out: CategoryNode[] = [];
  const walk = (parentId: string | null, depth: number, parentPath: string[]) => {
    for (const r of byParent.get(parentId) ?? []) {
      const path = [...parentPath, r.name];
      out.push({
        id: r.id,
        parentId: r.parentId,
        name: r.name,
        isActive: r.isActive,
        depth,
        path,
        mediaCount: r._count.mediaAssets,
      });
      walk(r.id, depth + 1, path);
    }
  };
  walk(null, 0, []);
  return out;
}

/** `[id, ...todos os descendentes]`. */
export function descendantIds(all: Pick<CategoryNode, "id" | "parentId">[], id: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }
  const acc: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    acc.push(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return acc;
}

/** Consulta direta (sem carregar `path`/contagens) para o scheduler. */
export async function categoryAndDescendantIds(organizationId: string, categoryId: string): Promise<string[]> {
  const all = await prisma.mediaCategory.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  return descendantIds(all, categoryId);
}

/** `true` se já existe um irmão (mesmo `parentId`) com esse nome. */
export function siblingNameTaken(
  all: CategoryNode[],
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  const n = norm(name);
  return all.some((c) => c.parentId === parentId && c.id !== exceptId && norm(c.name) === n);
}

/**
 * Resolve termos livres ("pizza", "frango") num nó da árvore.
 * Escolhe o nó mais profundo cuja cadeia de ancestrais cobre TODOS os termos, na ordem.
 */
export function resolveCategoryPath(
  all: CategoryNode[],
  terms: string[],
): { node: CategoryNode } | { ambiguous: CategoryNode[] } | null {
  const wanted = terms.map(norm).filter(Boolean);
  if (wanted.length === 0) return null;

  const matches = all.filter((c) => {
    const pathNorm = c.path.map(norm);
    let i = 0;
    for (const seg of pathNorm) {
      if (i < wanted.length && seg.includes(wanted[i])) i++;
    }
    return i === wanted.length;
  });
  if (matches.length === 0) return null;

  // preferir o(s) match(es) mais profundo(s)
  const maxDepth = Math.max(...matches.map((m) => m.depth));
  const deepest = matches.filter((m) => m.depth === maxDepth);
  if (deepest.length === 1) return { node: deepest[0] };
  return { ambiguous: deepest };
}
