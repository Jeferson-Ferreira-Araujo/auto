import Link from "next/link";
import type { OrgContext } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { Card, CardBody } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icons";
import { AutoPublishToggle } from "@/components/AutoPublishToggle";
import { POST_STATUS_LABEL, POST_STATUS_TONE, WEEKDAY_SHORT, formatTime } from "@/lib/display";
import { MediaThumb } from "@/components/MediaThumb";
import { InstagramInsightsService } from "@/lib/instagram/insights";
import { resolveRange } from "@/lib/insights/range";
import { formatNumber } from "@/lib/insights/report";
import { AutomationToggle } from "./AutomationToggle";

const BADGE_TONE: Record<string, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-green-50 text-green-700",
  danger: "bg-red-50 text-red-700",
  primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
};

function StatusPill({ status }: { status: keyof typeof POST_STATUS_LABEL }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE[POST_STATUS_TONE[status]]}`}>
      {POST_STATUS_LABEL[status]}
    </span>
  );
}

function dayLabel(d: Date, tz: string): string {
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const today = fmt(new Date());
  const tomorrow = fmt(new Date(Date.now() + 86400_000));
  const target = fmt(d);
  if (target === today) return "Hoje";
  if (target === tomorrow) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d);
}

function Kpi({
  icon,
  tint,
  label,
  value,
  sub,
  delta,
}: {
  icon: IconName;
  tint: string;
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
}) {
  const Ico = Icon[icon];
  const showDelta = delta != null && Number.isFinite(delta);
  const up = (delta ?? 0) >= 0;
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tint}`}>
            <Ico width={18} height={18} />
          </span>
          <span className="text-sm text-[var(--color-muted)]">{label}</span>
        </div>
        <div className="mt-2 text-[26px] font-bold leading-none">{value}</div>
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {showDelta && (
            <span className={up ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
              {up ? "↑" : "↓"} {Math.abs(Math.round((delta ?? 0) * 100))}%
            </span>
          )}
          <span className="text-[var(--color-muted)]">{sub}</span>
        </div>
      </CardBody>
    </Card>
  );
}

export async function DashboardHome({ ctx }: { ctx: OrgContext }) {
  const { org } = ctx;
  const tz = org.timezone;
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000);

  // semana atual (domingo → sábado) no fuso local do servidor
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  const { instagram, scheduledSoon, upcoming, weekPosts, automations, categoriesCount, mediaCount, publishedCount } =
    await getDashboardData(
      org.id,
      now.toISOString(),
      weekStart.toISOString(),
      weekEnd.toISOString(),
      in7d.toISOString(),
    );

  const report = await InstagramInsightsService.getReport(org.id, resolveRange({ range: "7d" }));
  const hasInsights = report.status === "ok";
  const m = Object.fromEntries(report.metrics.map((x) => [x.key, x]));
  const insightVal = (k: string) => (hasInsights ? formatNumber(m[k]?.value ?? 0) : "—");
  const insightDelta = (k: string) => (hasInsights ? (m[k]?.deltaPct ?? null) : null);

  // dias da semana com publicação
  const postedDays = new Set(weekPosts.map((p) => new Date(p.scheduledAt).getDay()));
  const todayDow = now.getDay();
  const todayPosts = weekPosts.filter((p) => new Date(p.scheduledAt).getDay() === todayDow);

  // primeiros passos
  const steps = [
    { done: instagram?.status === "CONNECTED", label: "Conectar Instagram", href: "/instagram" },
    { done: categoriesCount > 0, label: "Criar categorias", href: "/categorias" },
    { done: mediaCount > 0, label: "Enviar mídias", href: "/biblioteca" },
    {
      done: automations.length > 0 || scheduledSoon > 0 || publishedCount > 0,
      label: "Criar agendamento ou automação",
      href: "/automacoes",
    },
  ];
  const pendingSteps = steps.filter((s) => !s.done);

  const tip =
    report.sentences[0] ??
    "Publique com constância: contas que postam toda semana crescem mais rápido e alcançam mais gente.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Painel Principal 👋</h1>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">
          Aqui está o que está acontecendo com suas redes sociais.
        </p>
      </div>

      {pendingSteps.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">Primeiros passos</h2>
            <div className="grid gap-2 sm:grid-cols-2">
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
                  <span className={s.done ? "text-[var(--color-muted)] line-through" : "font-medium"}>
                    {s.label}
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {org.autoPublishStatus === "PAUSED" && <AutoPublishToggle status="PAUSED" />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          icon="calendar"
          tint="bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          label="Publicações agendadas"
          value={formatNumber(scheduledSoon)}
          sub="Próximos 7 dias"
        />
        <Kpi
          icon="eye"
          tint="bg-emerald-50 text-emerald-600"
          label="Visualizações"
          value={insightVal("views")}
          sub="Últimos 7 dias"
          delta={insightDelta("views")}
        />
        <Kpi
          icon="heart"
          tint="bg-rose-50 text-rose-500"
          label="Curtidas"
          value={insightVal("likes")}
          sub="Últimos 7 dias"
          delta={insightDelta("likes")}
        />
        <Kpi
          icon="comment"
          tint="bg-amber-50 text-amber-600"
          label="Comentários"
          value={insightVal("comments")}
          sub="Últimos 7 dias"
          delta={insightDelta("comments")}
        />
        <Kpi
          icon="userPlus"
          tint="bg-indigo-50 text-indigo-600"
          label="Novos seguidores"
          value={hasInsights && report.followersComparable ? insightVal("followers") : "—"}
          sub="Últimos 7 dias"
          delta={insightDelta("followers")}
        />
      </div>

      {!hasInsights && (
        <p className="-mt-3 text-xs text-[var(--color-muted)]">
          <Link href="/instagram" className="font-medium text-[var(--color-primary)]">
            Reconecte o Instagram
          </Link>{" "}
          para ver visualizações, curtidas e seguidores aqui.
        </p>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Próximas publicações */}
        <div className="min-w-0 lg:col-span-3">
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  Próximas publicações
                  {todayPosts.length > 0 && (
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                      {todayPosts.length} hoje
                    </span>
                  )}
                </h2>
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
                        <div className="font-medium text-[var(--color-text)]">
                          {dayLabel(new Date(p.scheduledAt), tz)}
                        </div>
                        {formatTime(p.scheduledAt, tz)}
                      </div>
                      <MediaThumb
                        id={p.mediaAsset.id}
                        type={p.mediaAsset.type}
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.mediaAsset.name}</div>
                        {p.caption && (
                          <div className="truncate text-xs text-[var(--color-muted)]">{p.caption}</div>
                        )}
                      </div>
                      <span className="shrink-0 text-[var(--color-muted)]">
                        <Icon.instagram width={16} height={16} />
                      </span>
                      <StatusPill status={p.status} />
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href="/calendario?view=lista"
                className="mt-2 block text-center text-xs font-semibold text-[var(--color-primary)]"
              >
                Ver todas as publicações →
              </Link>
            </CardBody>
          </Card>
        </div>

        {/* Coluna direita */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
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
                      className={`flex flex-col items-center rounded-lg py-1.5 text-center ${
                        isToday ? "bg-[var(--color-primary)] text-white" : ""
                      }`}
                    >
                      <span className={`text-[10px] ${isToday ? "text-white/80" : "text-[var(--color-muted)]"}`}>
                        {wd}
                      </span>
                      <span className="text-sm font-semibold">{date.getDate()}</span>
                      <span
                        className={`mt-0.5 h-1 w-1 rounded-full ${
                          postedDays.has(i)
                            ? isToday
                              ? "bg-white"
                              : "bg-[var(--color-primary)]"
                            : "bg-transparent"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2">
                {todayPosts.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">Nada agendado para hoje.</p>
                ) : (
                  todayPosts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5">
                      <span className="w-10 shrink-0 text-xs font-medium text-[var(--color-muted)]">
                        {formatTime(p.scheduledAt, tz)}
                      </span>
                      <MediaThumb
                        id={p.mediaAsset.id}
                        type={p.mediaAsset.type}
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.mediaAsset.name}</span>
                      <StatusPill status={p.status} />
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Status das automações</h2>
                <Link href="/automacoes" className="text-xs font-medium text-[var(--color-primary)]">
                  Gerenciar
                </Link>
              </div>
              {automations.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                  Nenhuma automação.{" "}
                  <Link href="/automacoes" className="font-medium text-[var(--color-primary)]">
                    Criar a primeira
                  </Link>
                </p>
              ) : (
                <ul className="space-y-3">
                  {automations.map((a) => (
                    <li key={a.id} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                        <Icon.automation width={16} height={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="truncate text-xs text-[var(--color-muted)]">
                          {a.daysOfWeek.length === 7
                            ? "Todos os dias"
                            : a.daysOfWeek
                                .slice()
                                .sort((x, y) => x - y)
                                .map((d) => WEEKDAY_SHORT[d])
                                .join(", ")}{" "}
                          às {a.publicationTime}
                        </div>
                      </div>
                      <AutomationToggle id={a.id} active={a.isActive} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Dica */}
      <div className="rounded-[var(--radius)] bg-gradient-to-br from-[var(--color-primary)] to-[#8b5cf6] p-5 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon.sparkle width={18} height={18} /> Dica da AUTOMIDIA
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-white/90">{tip}</p>
      </div>
    </div>
  );
}
