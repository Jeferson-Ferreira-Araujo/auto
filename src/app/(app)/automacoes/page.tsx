import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AutomationsClient, type Automation } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const { org } = await requireOrgContext();

  const [automations, accounts, categories] = await Promise.all([
    prisma.automation.findMany({
      where: { organizationId: org.id },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.instagramAccount.findMany({
      where: { organizationId: org.id, status: "CONNECTED" },
      select: { id: true, username: true },
    }),
    prisma.mediaCategory.findMany({
      where: { organizationId: org.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const list: Automation[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    instagramAccountId: a.instagramAccountId,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? null,
    mediaType: a.mediaType,
    selectionStrategy: a.selectionStrategy,
    daysOfWeek: a.daysOfWeek,
    publicationTime: a.publicationTime,
    isActive: a.isActive,
  }));

  return (
    <>
      <PageHeader
        title="Automações"
        description="Regras recorrentes de publicação. O sistema escolhe a mídia e agenda com antecedência."
      />
      <AutomationsClient automations={list} accounts={accounts} categories={categories} />
    </>
  );
}
