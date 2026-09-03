import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/primitives";
import { CreateOrgForm } from "./CreateOrgForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
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

  const orgId = membership.organizationId;
  const [instagram, categories, media, schedules] = await Promise.all([
    prisma.instagramAccount.findUnique({ where: { organizationId: orgId } }),
    prisma.mediaCategory.count({ where: { organizationId: orgId } }),
    prisma.mediaAsset.count({ where: { organizationId: orgId } }),
    prisma.scheduledPost.count({ where: { organizationId: orgId } }),
  ]);

  const steps = [
    { done: true, title: "Criar empresa", desc: membership.organization.name, href: "/configuracoes" },
    {
      done: instagram?.status === "CONNECTED",
      title: "Conectar Instagram",
      desc: instagram ? `@${instagram.username}` : "Conecte sua conta profissional do Instagram",
      href: "/instagram",
    },
    {
      done: categories > 0,
      title: "Criar categorias",
      desc: categories > 0 ? `${categories} categoria(s)` : "Ex.: Promoções, Produtos, Bastidores",
      href: "/categorias",
    },
    {
      done: media > 0,
      title: "Enviar mídias",
      desc: media > 0 ? `${media} mídia(s) na biblioteca` : "Suba imagens e vídeos",
      href: "/biblioteca",
    },
    {
      done: schedules > 0,
      title: "Criar agendamento ou automação",
      desc: schedules > 0 ? `${schedules} publicação(ões) na agenda` : "Agende manualmente ou crie uma regra recorrente",
      href: "/automacoes",
    },
  ];

  const allDone = steps.every((s) => s.done);

  return (
    <div className="mx-auto max-w-2xl p-4 py-10">
      <h1 className="mb-1 text-xl font-bold">Primeiros passos</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Complete os passos abaixo. Você pode fazer isso em qualquer ordem.
      </p>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <Link key={i} href={s.href}>
            <Card className="transition-colors hover:border-[var(--color-primary)]">
              <CardBody className="flex items-center gap-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    s.done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{s.title}</div>
                  <div className="truncate text-sm text-[var(--color-muted)]">{s.desc}</div>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-[var(--radius)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          {allDone ? "Ir para o painel" : "Continuar mais tarde"}
        </Link>
      </div>
    </div>
  );
}
