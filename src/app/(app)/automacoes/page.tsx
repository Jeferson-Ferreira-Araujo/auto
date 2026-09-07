import Link from "next/link";
import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { loadCategoryTree, formatPath } from "@/lib/categories";
import { whatsappConfigured } from "@/lib/whatsapp/service";
import { getWhatsAppHealth } from "@/lib/whatsapp/health";
import { AutomationsClient, type Automation } from "./AutomationsClient";
import { WhatsAppMarketingPanel, type WhatsAppMarketingState } from "./WhatsAppMarketingPanel";

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { org } = await requireOrgOrOnboarding();
  const sp = await searchParams;

  if (sp.view === "whatsapp") {
    const configured = whatsappConfigured();
    const [health, contact] = configured
      ? await Promise.all([
          getWhatsAppHealth(),
          prisma.whatsAppContact.findFirst({
            where: { organizationId: org.id },
            select: { verifiedAt: true },
          }),
        ])
      : [null, null];
    const state: WhatsAppMarketingState = {
      configured,
      connected: Boolean(contact?.verifiedAt),
      outreachEnabled: org.whatsappOutreachEnabled,
      promoMessage: org.whatsappPromoMessage ?? "",
      health,
    };
    return (
      <>
        <PageHeader
          title="WhatsApp"
          description="Qualidade do número, divulgação para clientes e mensagem de promoção."
        />
        <Link href="/automacoes" className="mb-4 inline-block text-sm text-[var(--color-primary)]">
          ← Automações
        </Link>
        <WhatsAppMarketingPanel state={state} />
      </>
    );
  }

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
