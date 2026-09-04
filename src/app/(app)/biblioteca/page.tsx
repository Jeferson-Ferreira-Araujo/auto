import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { loadCategoryTree, formatPath } from "@/lib/categories";
import { Uploader } from "./Uploader";
import { VideoMerger } from "./VideoMerger";
import { LibraryClient, type MediaItem } from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function BibliotecaPage() {
  const { org } = await requireOrgOrOnboarding();

  const [assets, tree] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
    loadCategoryTree(org.id),
  ]);

  const pathById = new Map(tree.map((n) => [n.id, formatPath(n.path)]));
  const categories = tree.map((n) => ({ id: n.id, name: formatPath(n.path), depth: n.depth }));

  const items: MediaItem[] = assets.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    caption: a.caption,
    categoryId: a.categoryId,
    categoryName: a.categoryId ? (pathById.get(a.categoryId) ?? null) : null,
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
    watermarkEnabled: a.watermarkEnabled,
    watermarkPosition: a.watermarkPosition,
    watermarkSize: a.watermarkSize,
    watermarkOpacity: a.watermarkOpacity,
    hasWatermarked: Boolean(a.watermarkedStorageKey),
  }));

  return (
    <>
      <PageHeader title="Biblioteca" description={`${items.length} mídia(s) · limite de ${org.mediaLimit}`} />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Uploader />
          <VideoMerger />
        </div>
        <LibraryClient
          items={items}
          categories={categories}
          orgHasLogo={Boolean(org.logoStorageKey)}
          orgHasWatermark={Boolean(org.watermarkStorageKey)}
        />
      </div>
    </>
  );
}
