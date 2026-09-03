import type { Prisma, PostStatus } from "@prisma/client";
import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { POST_STATUS_LABEL, POST_STATUS_TONE, mediaUrl, formatDateTime } from "@/lib/display";

export const dynamic = "force-dynamic";

type SP = {
  status?: string;
  type?: string;
  categoria?: string;
  conta?: string;
  desde?: string;
  ate?: string;
};

export default async function HistoricoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { org } = await requireOrgContext();
  const sp = await searchParams;

  const [categories, accounts] = await Promise.all([
    prisma.mediaCategory.findMany({ where: { organizationId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.instagramAccount.findMany({ where: { organizationId: org.id }, select: { id: true, username: true } }),
  ]);

  const where: Prisma.ScheduledPostWhereInput = { organizationId: org.id };
  if (sp.status) where.status = sp.status as PostStatus;
  if (sp.conta) where.instagramAccountId = sp.conta;
  if (sp.type) where.mediaAsset = { type: sp.type as "IMAGE" | "VIDEO" };
  if (sp.categoria) where.automation = { categoryId: sp.categoria };
  if (sp.desde || sp.ate) {
    where.scheduledAt = {};
    if (sp.desde) where.scheduledAt.gte = new Date(sp.desde);
    if (sp.ate) where.scheduledAt.lte = new Date(`${sp.ate}T23:59:59`);
  }

  const posts = await prisma.scheduledPost.findMany({
    where,
    include: {
      mediaAsset: { select: { id: true, name: true, type: true } },
      instagramAccount: { select: { username: true } },
      automation: { select: { name: true, category: { select: { name: true } } } },
      _count: { select: { publicationLogs: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });

  const field = "h-9 rounded-[var(--radius)] border bg-white px-2 text-sm";

  return (
    <>
      <PageHeader title="Histórico" description="Todas as publicações — agendadas, publicadas e com falha." />

      <form className="mb-4 flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className={field}>
          <option value="">Todos os status</option>
          {(["SCHEDULED", "PROCESSING", "PUBLISHED", "FAILED", "CANCELLED", "DRAFT"] as PostStatus[]).map((s) => (
            <option key={s} value={s}>
              {POST_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className={field}>
          <option value="">Imagem e vídeo</option>
          <option value="IMAGE">Imagem</option>
          <option value="VIDEO">Vídeo</option>
        </select>
        <select name="categoria" defaultValue={sp.categoria ?? ""} className={field}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="conta" defaultValue={sp.conta ?? ""} className={field}>
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username}
            </option>
          ))}
        </select>
        <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={field} />
        <input type="date" name="ate" defaultValue={sp.ate ?? ""} className={field} />
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
                  <th className="p-3">Tentativas</th>
                  <th className="p-3">Erro</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(p.mediaAsset.id, "thumb")} alt="" className="h-8 w-8 rounded object-cover" />
                        <span className="max-w-40 truncate">{p.mediaAsset.name}</span>
                      </div>
                    </td>
                    <td className="p-3">{p.mediaAsset.type === "VIDEO" ? "Vídeo" : "Imagem"}</td>
                    <td className="p-3">@{p.instagramAccount.username}</td>
                    <td className="p-3">{p.automation?.category?.name ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(p.scheduledAt, org.timezone)}</td>
                    <td className="p-3">{p.source === "AUTOMATION" ? "Automática" : "Manual"}</td>
                    <td className="p-3">
                      <Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="p-3">{p.retryCount}</td>
                    <td className="p-3 max-w-52 truncate text-xs text-red-700" title={p.errorMessage ?? ""}>
                      {p.errorMessage ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
