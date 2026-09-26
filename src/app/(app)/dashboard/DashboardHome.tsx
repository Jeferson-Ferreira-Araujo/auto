import Link from "next/link";
import type { OrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";
import { Card, CardBody } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { AutoPublishToggle } from "@/components/AutoPublishToggle";
import { WEEKDAY_SHORT, formatTime } from "@/lib/display";
import { MediaThumb } from "@/components/MediaThumb";
import { getExpirationBoard } from "@/lib/products/queries";

function dayLabel(d: Date, tz: string): string {
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const today = fmt(new Date());
  const tomorrow = fmt(new Date(Date.now() + 86400_000));
  const target = fmt(d);
  if (target === today) return "Hoje";
  if (target === tomorrow) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d);
}

type Attn = { icon: "alert" | "clock"; tone: "danger" | "urgent" | "warning"; text: string; href: string };

const KPI_TONES = {
  warning: { chip: "bg-amber-50 text-[var(--color-warning)]", bar: "bg-[var(--color-warning)]" },
  primary: { chip: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]", bar: "bg-[var(--color-primary)]" },
  success: { chip: "bg-emerald-50 text-[var(--color-success)]", bar: "bg-[var(--color-success)]" },
  violet: { chip: "bg-violet-50 text-[var(--color-violet)]", bar: "bg-[var(--color-violet)]" },
} as const;

function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: "box" | "calendar" | "check" | "automation";
  tone: keyof typeof KPI_TONES;
  label: string;
  value: number;
  hint: string;
  href?: string;
}) {
  const Ico = Icon[icon];
  const t = KPI_TONES[tone];
  const body = (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
      <CardBody>
        <div className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
            <Ico width={16} height={16} />
          </span>
          <span className="text-sm text-[var(--color-muted)]">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold text-[var(--color-heading)]">{value}</div>
        <div className="text-xs text-[var(--color-muted)]">{hint}</div>
      </CardBody>
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

function activityLine(e: { type: string; payload: unknown; createdAt: Date }, tz: string): { mark: "ok" | "warn"; text: string } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const at = formatTime(e.createdAt, tz);
  switch (e.type) {
    case "POST_PUBLISHED":
      return { mark: "ok", text: `Publicação realizada às ${at}` };
    case "POST_FAILED":
      return { mark: "warn", text: `Uma publicação falhou às ${at}` };
    case "PRODUCT_EXPIRING":
      return { mark: "warn", text: `${p.quantity} un de ${p.productName} vencem em ${p.daysLeft} dia(s)` };
    case "PRODUCT_EXPIRED":
      return { mark: "warn", text: `${p.quantity} un de ${p.productName} venceram` };
    case "AUTOMATION_FAILED":
      return { mark: "warn", text: `Uma automação falhou às ${at}` };
    default:
      return { mark: "ok", text: e.type };
  }
}

export async function DashboardHome({ ctx }: { ctx: OrgContext }) {
  const { org } = ctx;
  const tz = org.timezone;
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  const [dash, board, failedPosts, publishedToday, activity] = await Promise.all([
    getDashboardData(org.id, now.toISOString(), weekStart.toISOString(), weekEnd.toISOString(), in7d.toISOString()),
    getExpirationBoard(org.id),
    prisma.scheduledPost.findMany({
      where: { organizationId: org.id, status: "FAILED" },
      select: { id: true, errorMessage: true, mediaAsset: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.scheduledPost.count({
      where: { organizationId: org.id, status: "PUBLISHED", publishedAt: { gte: startOfToday } },
    }),
    prisma.domainEvent.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const { instagram, upcoming, weekPosts, automations, categoriesCount, mediaCount, publishedCount } = dash;
  const todayDow = now.getDay();
  const postedDays = new Set(weekPosts.map((p) => new Date(p.scheduledAt).getDay()));
  const todayPosts = weekPosts.filter((p) => new Date(p.scheduledAt).getDay() === todayDow);

  // Precisa da sua atenção
  const attn: Attn[] = [];
  if (board.counts.vencido > 0)
    attn.push({ icon: "alert", tone: "danger", text: `${board.counts.vencido} produto(s) vencido(s)`, href: "/produtos" });
  if (board.counts.urgente > 0)
    attn.push({ icon: "clock", tone: "urgent", text: `${board.counts.urgente} produto(s) vencem em ${board.thresholds.urgentDays} dias`, href: "/produtos" });
  if (failedPosts.length > 0)
    attn.push({ icon: "alert", tone: "danger", text: `${failedPosts.length} publicação(ões) falharam`, href: "/calendario?view=lista" });
  if (!instagram || instagram.status !== "CONNECTED")
    attn.push({ icon: "alert", tone: "warning", text: "Instagram não está conectado", href: "/configuracoes?view=instagram" });

  const steps = [
    { done: instagram?.status === "CONNECTED", label: "Conectar Instagram", href: "/configuracoes?view=instagram" },
    { done: mediaCount > 0, label: "Enviar mídias", href: "/biblioteca" },
    { done: categoriesCount > 0, label: "Criar categorias", href: "/biblioteca?view=categorias" },
    { done: automations.length > 0 || publishedCount > 0, label: "Criar agendamento ou automação", href: "/automacoes" },
  ];
  const pendingSteps = steps.filter((s) => !s.done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Início</h1>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">O que está acontecendo no seu negócio hoje.</p>
      </div>

      {org.autoPublishStatus === "PAUSED" && <AutoPublishToggle status="PAUSED" />}

      {/* Precisa da sua atenção */}
      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold">Precisa da sua atenção</h2>
          {attn.length === 0 && pendingSteps.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Tudo em ordem por aqui. ✓</p>
          ) : (
            <ul className="space-y-2">
              {attn.map((a, i) => {
                const Ico = Icon[a.icon];
                return (
                  <li key={i}>
                    <Link
                      href={a.href}
                      className="flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm hover:border-[var(--color-primary)]"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          a.tone === "danger"
                            ? "bg-red-50 text-[var(--color-danger)]"
                            : a.tone === "urgent"
                              ? "bg-orange-50 text-[var(--color-urgent)]"
                              : "bg-amber-50 text-[var(--color-warning)]"
                        }`}
                      >
                        <Ico width={15} height={15} />
                      </span>
                      <span className="flex-1 font-medium">{a.text}</span>
                      <Icon.arrowUpRight width={14} height={14} className="text-[var(--color-muted)]" />
                    </Link>
                  </li>
                );
              })}
              {pendingSteps.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm hover:border-[var(--color-primary)]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                      <Icon.check width={15} height={15} />
                    </span>
                    <span className="flex-1 font-medium">{s.label}</span>
                    <Icon.arrowUpRight width={14} height={14} className="text-[var(--color-muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Visão de hoje */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon="box"
          tone="warning"
          label="Validades"
          value={board.counts.vencido + board.counts.urgente}
          hint="precisam de ação"
          href="/produtos"
        />
        <KpiCard
          icon="calendar"
          tone="primary"
          label="Publicações hoje"
          value={todayPosts.length}
          hint="agendadas para hoje"
          href="/calendario"
        />
        <KpiCard
          icon="check"
          tone="success"
          label="Publicado hoje"
          value={publishedToday}
          hint="a AUTORA publicou por você"
        />
        <KpiCard
          icon="automation"
          tone="violet"
          label="Automações ativas"
          value={automations.length}
          hint="rodando no seu negócio"
          href="/automacoes"
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Próximas publicações */}
        <div className="min-w-0 lg:col-span-3">
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Próximas publicações</h2>
                <Link href="/calendario" className="text-xs font-medium text-[var(--color-primary)]">
                  Ver calendário
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                  Nada agendado. Crie uma automação ou agende no calendário.
                </p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5">
                      <div className="w-14 shrink-0 text-xs leading-tight text-[var(--color-muted)]">
                        <div className="font-medium text-[var(--color-text)]">{dayLabel(new Date(p.scheduledAt), tz)}</div>
                        {formatTime(p.scheduledAt, tz)}
                      </div>
                      <MediaThumb id={p.mediaAsset.id} type={p.mediaAsset.type} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.mediaAsset.name}</div>
                        {p.caption && <div className="truncate text-xs text-[var(--color-muted)]">{p.caption}</div>}
                      </div>
                      <Icon.instagram width={16} height={16} className="shrink-0 text-[var(--color-muted)]" />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Atividade da AUTORA */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold">Atividade da AUTORA</h2>
              {activity.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                  Enquanto você trabalha, a AUTORA também trabalha. As ações aparecem aqui.
                </p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {activity.map((e) => {
                    const l = activityLine(e, tz);
                    return (
                      <li key={e.id} className="flex gap-2">
                        <span className={l.mark === "ok" ? "text-[var(--color-success)]" : "text-[var(--color-urgent)]"}>
                          {l.mark === "ok" ? "✓" : "⚠"}
                        </span>
                        <span className="text-[var(--color-text)]">{l.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Calendário semanal</h2>
                <Link href="/calendario" className="text-xs font-medium text-[var(--color-primary)]">
                  Ver completo
                </Link>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_SHORT.map((wd, i) => {
                  const date = new Date(weekStart.getTime() + i * 86400_000);
                  const isToday = i === todayDow;
                  return (
                    <div
                      key={wd}
                      className={`flex flex-col items-center rounded-lg py-1.5 text-center ${isToday ? "bg-[var(--color-primary)] text-white" : ""}`}
                    >
                      <span className={`text-[10px] ${isToday ? "text-white/80" : "text-[var(--color-muted)]"}`}>{wd}</span>
                      <span className="text-sm font-semibold">{date.getDate()}</span>
                      <span
                        className={`mt-0.5 h-1 w-1 rounded-full ${
                          postedDays.has(i) ? (isToday ? "bg-white" : "bg-[var(--color-primary)]") : "bg-transparent"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
