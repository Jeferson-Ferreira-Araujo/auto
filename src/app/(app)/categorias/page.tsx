import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const { org } = await requireOrgOrOnboarding();
  const categories = await prisma.mediaCategory.findMany({
    where: { organizationId: org.id },
    include: { _count: { select: { mediaAssets: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organize suas mídias em grupos. Cada empresa tem as suas."
      />
      <CategoriesClient categories={categories} />
    </>
  );
}
