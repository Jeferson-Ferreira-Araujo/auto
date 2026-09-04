import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/primitives";
import { formatBytes } from "@/lib/utils";
import { formatDateTime } from "@/lib/display";
import { AdminOrgRow } from "./AdminOrgRow";
import { AdminUserRow } from "./AdminUserRow";

export const dynamic = "force-dynamic";

const MB = 1024 * 1024;

export async function AdminPanel() {
  const admin = await requireSuperAdmin();
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [orgs, users, storage, members, postStatus, published30, igAccounts] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { memberships: { include: { organization: { select: { name: true } } } } },
    }),
    prisma.mediaAsset.groupBy({ by: ["organizationId"], _sum: { fileSize: true }, _count: { _all: true } }),
    prisma.organizationMember.groupBy({ by: ["organizationId"], _count: { _all: true } }),
    prisma.scheduledPost.groupBy({ by: ["organizationId", "status"], _count: { _all: true } }),
    prisma.scheduledPost.count({ where: { status: "PUBLISHED", publishedAt: { gte: since30 } } }),
    prisma.instagramAccount.findMany({ select: { organizationId: true, status: true, username: true } }),
  ]);

  const storageByOrg = new Map(storage.map((s) => [s.organizationId, s]));
  const membersByOrg = new Map(members.map((m) => [m.organizationId, m._count._all]));
  const igByOrg = new Map(igAccounts.map((a) => [a.organizationId, a]));
  const scheduledByOrg = new Map<string, number>();
  const publishedByOrg = new Map<string, number>();
  for (const row of postStatus) {
    if (row.status === "SCHEDULED") scheduledByOrg.set(row.organizationId, row._count._all);
    if (row.status === "PUBLISHED") publishedByOrg.set(row.organizationId, row._count._all);
  }

  const totalStorageBytes = storage.reduce((a, s) => a + (s._sum.fileSize ?? 0), 0);
  const blockedOrgs = orgs.filter((o) => o.blockedAt).length;
  const blockedUsers = users.filter((u) => u.blockedAt).length;
  const superAdmins = users.filter((u) => u.isSuperAdmin).length;

  const summary = [
    { label: "Empresas", value: String(orgs.length), sub: `${orgs.length - blockedOrgs} ativas · ${blockedOrgs} bloqueadas` },
    { label: "Usuários", value: String(users.length), sub: `${blockedUsers} bloqueados · ${superAdmins} admin` },
    { label: "Publicações (30 dias)", value: String(published30), sub: "status PUBLICADO" },
    { label: "Armazenamento total", value: `≈ ${formatBytes(totalStorageBytes)}`, sub: "arquivos originais" },
  ];

  const orgRows = orgs.map((o) => {
    const st = storageByOrg.get(o.id);
    const usedBytes = st?._sum.fileSize ?? 0;
    const mediaCount = st?._count._all ?? 0;
    const usedMb = usedBytes / MB;
    const pct = o.storageLimitMb > 0 ? Math.round((usedMb / o.storageLimitMb) * 100) : 0;
    const needsPlan = usedMb > 0.8 * o.storageLimitMb || mediaCount > 0.9 * o.mediaLimit;
    const ig = igByOrg.get(o.id);
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      blocked: Boolean(o.blockedAt),
      members: membersByOrg.get(o.id) ?? 0,
      mediaCount,
      mediaLimit: o.mediaLimit,
      uploadLimitMb: o.uploadLimitMb,
      storageLimitMb: o.storageLimitMb,
      usedLabel: formatBytes(usedBytes),
      pct,
      needsPlan,
      scheduled: scheduledByOrg.get(o.id) ?? 0,
      published: publishedByOrg.get(o.id) ?? 0,
      igStatus: ig?.status ?? null,
      igUsername: ig?.username ?? null,
    };
  });

  const userRows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    blocked: Boolean(u.blockedAt),
    isSuperAdmin: u.isSuperAdmin,
    orgs: u.memberships.map((m) => m.organization.name),
    isSelf: u.id === admin.id,
  }));

  return (
    <>
      <PageHeader title="Administração do sistema" description="Empresas, usuários, armazenamento e bloqueios." />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.map((s) => (
            <Card key={s.label}>
              <CardBody className="p-4">
                <div className="text-xs text-[var(--color-muted)]">{s.label}</div>
                <div className="mt-1 text-xl font-bold">{s.value}</div>
                <div className="mt-1 text-[11px] text-[var(--color-muted)]">{s.sub}</div>
              </CardBody>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">EMPRESAS</h2>
          <div className="overflow-x-auto rounded-[var(--radius)] border bg-[var(--color-surface)]">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b bg-[var(--color-bg)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Membros</th>
                  <th className="p-3">Mídias</th>
                  <th className="p-3">Armazenamento</th>
                  <th className="p-3">Agend. / Publ.</th>
                  <th className="p-3">Instagram</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orgRows.map((r) => (
                  <AdminOrgRow key={r.id} org={r} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">USUÁRIOS</h2>
          <div className="overflow-x-auto rounded-[var(--radius)] border bg-[var(--color-surface)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-[var(--color-bg)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="p-3">Usuário</th>
                  <th className="p-3">Empresas</th>
                  <th className="p-3">Criado em</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <AdminUserRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-[var(--color-muted)]">
          Armazenamento é aproximado — soma apenas os arquivos originais enviados (não conta miniaturas,
          versões melhoradas nem com marca d&apos;água). Último acesso e datas em {formatDateTime(new Date())}.
        </p>
      </div>
    </>
  );
}
