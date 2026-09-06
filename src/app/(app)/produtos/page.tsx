import { requireOrgOrOnboarding } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/primitives";

export default async function ProdutosPage() {
  await requireOrgOrOnboarding();
  return (
    <>
      <PageHeader title="Validades" description="Controle de produtos próximos do vencimento." />
      <EmptyState icon="📦" title="Em breve" description="O módulo de Validades está sendo preparado." />
    </>
  );
}
