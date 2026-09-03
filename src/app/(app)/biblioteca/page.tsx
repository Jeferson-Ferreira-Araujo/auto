import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Uploader } from "./Uploader";
import { LibraryClient, type MediaItem } from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function BibliotecaPage() {
  const { org } = await requireOrgOrOnboarding();

  const [assets, categories] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { organizationId: org.id },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mediaCategory.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const items: MediaItem[] = assets.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    caption: a.caption,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? null,
    isActive: a.isActive,
    availableFrom: a.availableFrom?.toISOString() ?? null,
    availableUntil: a.availableUntil?.toISOString() ?? null,
    usageCount: a.usageCount,
    lastPublishedAt: a.lastPublishedAt?.toISOString() ?? null,
    processingStatus: a.processingStatus,
    processingError: a.processingError,
    processingNote: a.processingNote,
    width: a.width,
    height: a.height,
    duration: a.duration,
    createdAt: a.createdAt.toISOString(),
    publishVariant: a.publishVariant,
    hasEnhanced: Boolean(a.enhancedStorageKey),
    activeVideoJobId: a.activeVideoJobId,
  }));

  return (
    <>
      <PageHeader title="Biblioteca" description={`${items.length} mídia(s) · limite de ${org.mediaLimit}`} />
      <div className="space-y-6">
        <Uploader />
        <LibraryClient items={items} categories={categories} orgHasLogo={Boolean(org.logoStorageKey)} />
      </div>
    </>
  );
}
