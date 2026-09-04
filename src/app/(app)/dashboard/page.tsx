import { getOptionalOrgContext } from "@/lib/auth";
import { Card, CardBody } from "@/components/ui/primitives";
import { CreateOrgForm } from "./CreateOrgForm";
import { DashboardHome } from "./DashboardHome";
import { PerformanceView } from "./PerformanceView";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getOptionalOrgContext();

  // Estado 1: sem empresa → criar
  if (!ctx) {
    return (
      <div className="mx-auto max-w-md py-8">
        <h1 className="mb-1 text-xl font-bold">Bem-vindo(a) 👋</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          Vamos começar criando a sua empresa. Cada empresa tem suas próprias mídias, categorias e automações.
        </p>
        <Card>
          <CardBody>
            <CreateOrgForm />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (sp.view === "desempenho") {
    return <PerformanceView org={ctx.org} sp={sp} />;
  }

  return <DashboardHome ctx={ctx} />;
}
