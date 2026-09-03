import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody } from "@/components/ui/primitives";
import { AutoPublishToggle } from "@/components/AutoPublishToggle";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { OWNER: "Dono", ADMIN: "Administrador", MEMBER: "Membro" };

export default async function ConfiguracoesPage() {
  const { org, user } = await requireOrgContext();
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: org.id },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const mediaCount = await prisma.mediaAsset.count({ where: { organizationId: org.id } });

  return (
    <>
      <PageHeader title="Configurações" description="Preferências da empresa." />

      <div className="space-y-6">
        <AutoPublishToggle status={org.autoPublishStatus} />

        <SettingsForm name={org.name} uploadLimitMb={org.uploadLimitMb} />

        <Card>
          <CardBody>
            <h3 className="mb-1 font-medium">Uso</h3>
            <p className="text-sm text-[var(--color-muted)]">
              {mediaCount} de {org.mediaLimit} mídias · Fuso horário {org.timezone}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium">Membros</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span>
                    {m.user.name ?? m.user.email}
                    {m.userId === user.id && <span className="text-[var(--color-muted)]"> (você)</span>}
                  </span>
                  <Badge>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Convidar mais usuários para a mesma empresa estará disponível em breve.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
