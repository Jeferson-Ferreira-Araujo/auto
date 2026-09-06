import Link from "next/link";
import { requireOrgOrOnboarding } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { getExpirationBoard, listExpirations, type ExpirationRow } from "@/lib/products/queries";
import { EXPIRATION_STATUS_LABEL, EXPIRATION_STATUS_TONE, formatExpirationDate } from "@/lib/products/status";
import { RegisterExpirationFlow } from "./RegisterExpirationFlow";
import { ExpirationList } from "./ExpirationList";

function daysText(r: ExpirationRow): string {
  if (r.daysLeft < 0) return `venceu há ${Math.abs(r.daysLeft)} dia(s)`;
  if (r.daysLeft === 0) return "vence hoje";
  return `vence em ${r.daysLeft} dia(s)`;
}

function BucketCard({
  title,
  tone,
  count,
  items,
}: {
  title: string;
  tone: "danger" | "urgent" | "warning";
  count: number;
  items: ExpirationRow[];
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-muted)]">{title}</h2>
          <span
            className={`text-2xl font-bold ${
              tone === "danger"
                ? "text-[var(--color-danger)]"
                : tone === "urgent"
                  ? "text-[var(--color-urgent)]"
                  : "text-[var(--color-warning)]"
            }`}
          >
            {count}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">Nada aqui. 👍</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.productName}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {r.quantity} un · {formatExpirationDate(r.expirationDate)} · {daysText(r)}
                    {r.location ? ` · ${r.location}` : ""}
                  </div>
                </div>
                <Badge tone={EXPIRATION_STATUS_TONE[r.status]}>{EXPIRATION_STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const { org } = await requireOrgOrOnboarding();
  const sp = await searchParams;

  if (sp.view === "registrar") {
    return (
      <>
        <PageHeader title="Registrar validade" description="Escaneie o código ou busque o produto, informe a quantidade e a data." />
        <Link href="/produtos" className="mb-4 inline-block text-sm text-[var(--color-primary)]">
          ← Voltar
        </Link>
        <RegisterExpirationFlow />
      </>
    );
  }

  if (sp.view === "lista") {
    const rows = await listExpirations(org.id, { outcome: "PENDING" });
    return (
      <>
        <PageHeader
          title="Validades registradas"
          description="Marque como vendido, descartado ou preço rebaixado quando resolver."
          action={
            <Link href="/produtos?view=registrar">
              <Button size="sm">
                <Icon.plus width={16} height={16} /> Registrar
              </Button>
            </Link>
          }
        />
        <Link href="/produtos" className="mb-4 inline-block text-sm text-[var(--color-primary)]">
          ← Painel
        </Link>
        <ExpirationList rows={rows} />
      </>
    );
  }

  const board = await getExpirationBoard(org.id);
  const total = board.counts.vencido + board.counts.urgente + board.counts.atencao + board.counts.ok;

  return (
    <>
      <PageHeader
        title="Validades"
        description="O que precisa de atenção antes de vencer."
        action={
          <Link href="/produtos?view=registrar">
            <Button size="sm">
              <Icon.plus width={16} height={16} /> Registrar validade
            </Button>
          </Link>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon="📦"
          title="Nenhuma validade registrada"
          description="Registre os produtos próximos do vencimento e a AUTORA avisa antes de virar prejuízo."
          action={
            <Link href="/produtos?view=registrar">
              <Button>Registrar a primeira</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BucketCard title="Vencidos" tone="danger" count={board.counts.vencido} items={board.vencido} />
          <BucketCard title={`Vencem em ${board.thresholds.urgentDays} dias`} tone="urgent" count={board.counts.urgente} items={board.urgente} />
          <BucketCard title={`Vencem em ${board.thresholds.warningDays} dias`} tone="warning" count={board.counts.atencao} items={board.atencao} />
        </div>
      )}

      {total > 0 && (
        <div className="mt-4">
          <Link href="/produtos?view=lista" className="text-sm font-medium text-[var(--color-primary)]">
            Ver todas as validades →
          </Link>
        </div>
      )}
    </>
  );
}
