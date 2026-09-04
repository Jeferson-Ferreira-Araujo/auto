import { requireOrgOrOnboarding } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { loadCategoryTree } from "@/lib/categories";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const { org } = await requireOrgOrOnboarding();
  const nodes = await loadCategoryTree(org.id);

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organize suas mídias em grupos e subgrupos livres (ex.: Produtos › Pizzas › Frango). As automações e o WhatsApp usam essa estrutura para escolher o que publicar."
      />
      <CategoriesClient nodes={nodes} />
    </>
  );
}
