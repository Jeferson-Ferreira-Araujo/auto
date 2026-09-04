import Link from "next/link";
import type { Prisma, PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { POST_STATUS_LABEL, POST_STATUS_TONE, formatDateTime } from "@/lib/display";
import { MediaThumb } from "@/components/MediaThumb";

export type HistoryFilters = {
  view?: string;
  status?: string;
  tipo?: string;
  categoria?: string;
  conta?: string;
  desde?: string;
  ate?: string;
};

export async function HistoryView({
  organizationId,
  timezone,
  filters,
}: {
  organizationId: string;
  timezone: string;
  filters: HistoryFilters;
}) {
  const [categories, accounts] = await Promise.all([
    prisma.mediaCategory.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.instagramAccount.findMany({ where: { organizationId }, select: { id: true, username: true } }),
  ]);

  const where: Prisma.ScheduledPostWhereInput = { organizationId };
  if (filters.status) where.status = filters.status as PostStatus;
  if (filters.conta) where.instagramAccountId = filters.conta;
  if (filters.tipo) where.mediaAsset = { type: filters.tipo as "IMAGE" | "VIDEO" };
  if (filters.categoria) where.automation = { categoryId: filters.categoria };
  if (filters.desde || filters.ate) {
    where.scheduledAt = {};
    if (filters.desde) where.scheduledAt.gte = new Date(filters.desde);
    if (filters.ate) where.scheduledAt.lte = new Date(`${filters.ate}T23:59:59`);
  }

  const posts = await prisma.scheduledPost.findMany({
    where,
    include: {
      mediaAsset: { select: { id: true, name: true, type: true } },
      instagramAccount: { select: { username: true } },
      automation: { select: { category: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });

  const field = "h-9 rounded-[var(--radius)] border bg-white px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/calendario" className="rounded-full border bg-white px-3 py-1">
          Calendário
        </Link>
        <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 font-medium text-white">Lista / Histórico</span>
      </div>

      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="view" value="lista" />
        <select name="status" defaultValue={filters.status ?? ""} className={field}>
          <option value="">Todos os status</option>
          {(["SCHEDULED", "PROCESSING", "PUBLISHED", "FAILED", "CANCELLED", "DRAFT"] as PostStatus[]).map((s) => (
            <option key={s} value={s}>
              {POST_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={filters.tipo ?? ""} className={field}>
          <option value="">Imagem e vídeo</option>
          <option value="IMAGE">Imagem</option>
          <option value="VIDEO">Vídeo</option>
        </select>
        <select name="categoria" defaultValue={filters.categoria ?? ""} className={field}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="conta" defaultValue={filters.conta ?? ""} className={field}>
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username}
            </option>
          ))}
        </select>
        <input type="date" name="desde" defaultValue={filters.desde ?? ""} className={field} />
        <input type="date" name="ate" defaultValue={filters.ate ?? ""} className={field} />
        <button className="h-9 rounded-[var(--radius)] bg-[var(--color-primary)] px-3 text-sm font-medium text-white">
          Filtrar
        </button>
      </form>

      {posts.length === 0 ? (
        <EmptyState title="Nada no histórico" description="Quando houver publicações, elas aparecem aqui." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="p-3">Mídia</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Conta</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Data/hora</th>
                  <th className="p-3">Origem</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tent.</th>
                  <th className="p-3">Erro</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <MediaThumb id={p.mediaAsset.id} type={p.mediaAsset.type} className="h-8 w-8 rounded object-cover" />
                        <span className="block max-w-40 truncate">{p.mediaAsset.name}</span>
                      </div>
                    </td>
                    <td className="p-3">{p.mediaAsset.type === "VIDEO" ? "Vídeo" : "Imagem"}</td>
                    <td className="p-3">@{p.instagramAccount.username}</td>
                    <td className="p-3">{p.automation?.category?.name ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(p.scheduledAt, timezone)}</td>
                    <td className="p-3">{p.source === "AUTOMATION" ? "Automática" : "Manual"}</td>
                    <td className="p-3">
                      <Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="p-3">{p.retryCount}</td>
                    <td className="max-w-52 truncate p-3 text-xs text-red-700" title={p.errorMessage ?? ""}>
                      {p.errorMessage ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
