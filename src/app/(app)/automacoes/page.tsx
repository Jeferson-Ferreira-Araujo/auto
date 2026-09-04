import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { loadCategoryTree, formatPath } from "@/lib/categories";
import { AutomationsClient, type Automation } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const { org } = await requireOrgOrOnboarding();

  const [automations, accounts, tree] = await Promise.all([
    prisma.automation.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.instagramAccount.findMany({
      where: { organizationId: org.id, status: "CONNECTED" },
      select: { id: true, username: true },
    }),
    loadCategoryTree(org.id),
  ]);

  const pathById = new Map(tree.map((n) => [n.id, formatPath(n.path)]));
  const categories = tree.filter((n) => n.isActive).map((n) => ({ id: n.id, name: formatPath(n.path) }));

  const list: Automation[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    instagramAccountId: a.instagramAccountId,
    categoryId: a.categoryId,
    categoryName: a.categoryId ? (pathById.get(a.categoryId) ?? null) : null,
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
