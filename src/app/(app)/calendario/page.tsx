import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarClient, type CalPost, type PickMedia } from "./CalendarClient";
import { HistoryView, type HistoryFilters } from "./HistoryView";

function monthRange(monthParam?: string) {
  const now = new Date();
  const [y, m] = monthParam?.split("-").map(Number) ?? [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  const end = new Date(Date.UTC(y, m ?? 1, 1));
  return { y: y ?? now.getFullYear(), m: m ?? now.getMonth() + 1, start, end };
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<HistoryFilters & { month?: string }>;
}) {
  const { org } = await requireOrgOrOnboarding();
  const sp = await searchParams;

  if (sp.view === "lista") {
    return (
      <>
        <PageHeader title="Histórico" description="Todas as publicações — agendadas, publicadas e com falha." />
        <HistoryView organizationId={org.id} timezone={org.timezone} filters={sp} />
      </>
    );
  }

  const { y, m, start, end } = monthRange(sp.month);
  const windowStart = new Date(start.getTime() - 8 * 86400000);
  const windowEnd = new Date(end.getTime() + 8 * 86400000);

  const [posts, accounts, media] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { organizationId: org.id, scheduledAt: { gte: windowStart, lte: windowEnd } },
      include: {
        mediaAsset: { select: { id: true, name: true, type: true } },
        instagramAccount: { select: { username: true } },
        automation: { select: { name: true, category: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.instagramAccount.findMany({
      where: { organizationId: org.id, status: "CONNECTED" },
      select: { id: true, username: true },
    }),
    prisma.mediaAsset.findMany({
      where: { organizationId: org.id, processingStatus: "READY", isActive: true },
      select: { id: true, name: true, type: true, caption: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const calPosts: CalPost[] = posts.map((p) => ({
    id: p.id,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    source: p.source,
    caption: p.caption,
    mediaId: p.mediaAsset.id,
    mediaName: p.mediaAsset.name,
    mediaType: p.mediaAsset.type,
    account: p.instagramAccount.username,
    category: p.automation?.category?.name ?? null,
    automationName: p.automation?.name ?? null,
    errorMessage: p.errorMessage,
    instagramMediaId: p.instagramMediaId,
  }));

  const pickMedia: PickMedia[] = media.map((mm) => ({ id: mm.id, name: mm.name, type: mm.type, caption: mm.caption }));

  return (
    <>
      <PageHeader title="Calendário" description="Tudo o que está agendado e o que já foi publicado." />
      <CalendarClient
        year={y}
        month={m}
        posts={calPosts}
        accounts={accounts}
        media={pickMedia}
        timezone={org.timezone}
      />
    </>
  );
}
