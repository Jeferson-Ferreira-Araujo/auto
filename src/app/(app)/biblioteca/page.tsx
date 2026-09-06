import Link from "next/link";
import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { loadCategoryTree, formatPath } from "@/lib/categories";
import { Uploader } from "./Uploader";
import { VideoMerger } from "./VideoMerger";
import { LibraryClient, type MediaItem } from "./LibraryClient";
import { CategoriesClient } from "../categorias/CategoriesClient";

function Tabs({ view }: { view: "midia" | "categorias" }) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn(
        "rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium",
        active
          ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "text-[var(--color-muted)] hover:bg-black/[0.04]",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex gap-1">
      {tab("/biblioteca", "Mídia", view === "midia")}
      {tab("/biblioteca?view=categorias", "Categorias", view === "categorias")}
    </div>
  );
}

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { org } = await requireOrgOrOnboarding();
  const sp = await searchParams;

  if (sp.view === "categorias") {
    const nodes = await loadCategoryTree(org.id);
    return (
      <>
        <PageHeader
          title="Biblioteca"
          description="Organize suas mídias em grupos e subgrupos livres (ex.: Produtos › Pizzas › Frango). As automações e o WhatsApp usam essa estrutura para escolher o que publicar."
        />
        <Tabs view="categorias" />
        <CategoriesClient nodes={nodes} />
      </>
    );
  }

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
      <Tabs view="midia" />
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
