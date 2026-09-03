import Link from "next/link";
import { getOptionalOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { AutoPublishToggle } from "@/components/AutoPublishToggle";
import { POST_STATUS_LABEL, POST_STATUS_TONE, mediaUrl, formatDateTime } from "@/lib/display";
import { CreateOrgForm } from "./CreateOrgForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const { org } = ctx;

  const [instagram, mediaCounts, categories, scheduled, published, failed, upcoming] = await Promise.all([
    prisma.instagramAccount.findUnique({ where: { organizationId: org.id } }),
    prisma.mediaAsset.groupBy({ by: ["type"], where: { organizationId: org.id }, _count: true }),
    prisma.mediaCategory.count({ where: { organizationId: org.id } }),
    prisma.scheduledPost.count({ where: { organizationId: org.id, status: "SCHEDULED" } }),
    prisma.scheduledPost.count({ where: { organizationId: org.id, status: "PUBLISHED" } }),
    prisma.scheduledPost.count({ where: { organizationId: org.id, status: "FAILED" } }),
    prisma.scheduledPost.findMany({
      where: { organizationId: org.id, status: { in: ["SCHEDULED", "PROCESSING"] } },
      include: {
        mediaAsset: { select: { id: true, name: true } },
        instagramAccount: { select: { username: true } },
        automation: { select: { category: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 8,
    }),
  ]);

  const images = mediaCounts.find((m) => m.type === "IMAGE")?._count ?? 0;
  const videos = mediaCounts.find((m) => m.type === "VIDEO")?._count ?? 0;
  const mediaTotal = images + videos;
  const automations = await prisma.automation.count({ where: { organizationId: org.id } });

  const steps = [
    { done: instagram?.status === "CONNECTED", label: "Conectar Instagram", href: "/instagram" },
    { done: categories > 0, label: "Criar categorias", href: "/categorias" },
    { done: mediaTotal > 0, label: "Enviar mídias", href: "/biblioteca" },
    { done: automations > 0 || scheduled > 0 || published > 0, label: "Criar agendamento ou automação", href: "/automacoes" },
  ];
  const pendingSteps = steps.filter((s) => !s.done);

  const stats = [
    { label: "Imagens", value: images },
    { label: "Vídeos", value: videos },
    { label: "Categorias", value: categories },
    { label: "Agendadas", value: scheduled },
    { label: "Publicadas", value: published },
    { label: "Falhas", value: failed },
  ];

  return (
    <>
      <PageHeader title="Painel" description={org.name} />

      <div className="space-y-6">
        {pendingSteps.length > 0 && (
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold">Primeiros passos</h2>
              <div className="space-y-2">
                {steps.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    className="flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm hover:border-[var(--color-primary)]"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        s.done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {s.done ? "✓" : "•"}
                    </span>
                    <span className={s.done ? "text-[var(--color-muted)] line-through" : "font-medium"}>{s.label}</span>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <AutoPublishToggle status={org.autoPublishStatus} />

        <Card>
          <CardBody className="flex items-center justify-between">
            <div>
              <div className="text-sm text-[var(--color-muted)]">Instagram</div>
              {instagram ? (
                <div className="mt-0.5 flex items-center gap-2 font-medium">
                  @{instagram.username}
                  {instagram.status === "CONNECTED" ? (
                    <Badge tone="success">Conectado</Badge>
                  ) : (
                    <Badge tone="danger">Reconectar</Badge>
                  )}
                </div>
              ) : (
                <div className="mt-0.5 font-medium text-[var(--color-muted)]">Não conectado</div>
              )}
            </div>
            <Link href="/instagram" className="text-sm font-medium text-[var(--color-primary)]">
              Gerenciar
            </Link>
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardBody className="text-center">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-[var(--color-muted)]">{s.label}</div>
              </CardBody>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">PRÓXIMAS PUBLICAÇÕES</h2>
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nada agendado"
              description="Crie uma automação ou agende uma publicação no calendário."
              action={
                <Link href="/calendario" className="text-sm font-medium text-[var(--color-primary)]">
                  Abrir calendário
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {upcoming.map((p) => (
                <Card key={p.id}>
                  <CardBody className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(p.mediaAsset.id, "thumb")} alt="" className="h-11 w-11 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.mediaAsset.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {formatDateTime(p.scheduledAt, org.timezone)} · @{p.instagramAccount.username}
                        {p.automation?.category?.name ? ` · ${p.automation.category.name}` : ""}
                      </div>
                    </div>
                    <Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
