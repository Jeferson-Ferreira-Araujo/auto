import type { Organization } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { createScheduledPost } from "@/lib/posts";
import { loadCategoryTree } from "@/lib/categories";
import { formatTime } from "@/lib/display";
import { describeWhen } from "./dates";

const log = childLogger({ mod: "whatsapp/commands" });

function localYmd(instant: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instant)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

/** Intervalo [início, fim) de um dia (ou da semana) no fuso da organização, em instantes UTC. */
export function dayRange(
  day: "today" | "tomorrow" | "week",
  tz: string,
  now = new Date(),
): { start: Date; end: Date } {
  const base = day === "tomorrow" ? new Date(now.getTime() + 86400000) : now;
  const ymd = localYmd(base, tz);
  const start = fromZonedTime(`${ymd}T00:00:00`, tz);
  const spanDays = day === "week" ? 7 : 1;
  const end = new Date(start.getTime() + spanDays * 86400000);
  return { start, end };
}

export const HELP_TEXT = [
  "🤖 *AUTOMIDIA* — o que dá pra fazer por aqui:",
  "",
  "• Envie uma *foto* ou *vídeo* e diga quando publicar (_“amanhã às 18h”_) ou _“publique agora”_",
  "• *o que tem hoje / amanhã / essa semana?*",
  "• *mude o post das 18h para 20h* · *cancele a publicação de hoje às 12h*",
  "• *pause todas as automações* · *ative novamente Promoções*",
  "• *salve essa foto na categoria Produtos* · *liste as categorias*",
  "• *como foi meu desempenho essa semana?* · *qual foi minha melhor publicação?*",
  "• *melhore esse vídeo* · *status da conta*",
  "",
  "Digite *menu* para as opções.",
].join("\n");

export async function pauseAutomations(org: Organization): Promise<string> {
  await prisma.organization.update({ where: { id: org.id }, data: { autoPublishStatus: "PAUSED" } });
  return "⏸️ Publicação automática *pausada*. As automações não vão publicar até você reativar. Publicações manuais continuam.";
}

export async function resumeAutomations(org: Organization): Promise<string> {
  await prisma.organization.update({ where: { id: org.id }, data: { autoPublishStatus: "ACTIVE" } });
  return "▶️ Publicação automática *reativada*. As automações voltam a publicar nos horários agendados.";
}

export async function listScheduled(org: Organization, day: "today" | "tomorrow" | "week"): Promise<string> {
  const { start, end } = dayRange(day, org.timezone);
  const posts = await prisma.scheduledPost.findMany({
    where: { organizationId: org.id, scheduledAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "PROCESSING", "DRAFT"] } },
    include: { mediaAsset: { select: { name: true, type: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  const label = day === "tomorrow" ? "amanhã" : day === "week" ? "os próximos 7 dias" : "hoje";
  if (posts.length === 0) return `Nada agendado para ${label}. 🎉`;

  if (day === "week") {
    const byDay = new Map<string, typeof posts>();
    for (const p of posts) {
      const k = new Intl.DateTimeFormat("pt-BR", { timeZone: org.timezone, weekday: "short", day: "2-digit", month: "2-digit" }).format(p.scheduledAt);
      byDay.set(k, [...(byDay.get(k) ?? []), p]);
    }
    const blocks = [...byDay.entries()].map(([d, list]) => {
      const lines = list.map(
        (p) => `   ${formatTime(p.scheduledAt, org.timezone)} — ${p.mediaAsset.type === "VIDEO" ? "🎬" : "🖼"} ${p.mediaAsset.name}`,
      );
      return `*${d}*\n${lines.join("\n")}`;
    });
    return `📅 Programado para ${label}:\n\n${blocks.join("\n\n")}`;
  }

  const lines = posts.map(
    (p) =>
      `• ${formatTime(p.scheduledAt, org.timezone)} — ${p.mediaAsset.type === "VIDEO" ? "🎬" : "🖼"} ${p.mediaAsset.name}` +
      (p.status === "DRAFT" ? " _(rascunho)_" : ""),
  );
  return `📅 Programado para ${label}:\n${lines.join("\n")}`;
}

export async function countTodayCancellable(org: Organization): Promise<number> {
  const { start, end } = dayRange("today", org.timezone);
  return prisma.scheduledPost.count({
    where: { organizationId: org.id, scheduledAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "DRAFT"] } },
  });
}

export async function cancelToday(org: Organization): Promise<number> {
  const { start, end } = dayRange("today", org.timezone);
  const res = await prisma.scheduledPost.updateMany({
    where: { organizationId: org.id, scheduledAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "DRAFT"] } },
    data: { status: "CANCELLED", errorMessage: "Cancelada via WhatsApp." },
  });
  log.info({ orgId: org.id, count: res.count }, "cancelamento em massa via WhatsApp");
  return res.count;
}

export async function schedule(
  org: Organization,
  input: { mediaAssetId: string; scheduledAt: Date; caption: string | null },
): Promise<string> {
  await createScheduledPost(org.id, {
    mediaAssetId: input.mediaAssetId,
    scheduledAt: input.scheduledAt,
    caption: input.caption,
    source: "MANUAL",
  });
  return `✅ Publicação agendada para *${describeWhen(input.scheduledAt, org.timezone)}*.`;
}

export function unknownReply(): string {
  return `Não entendi 🤔\n\n${HELP_TEXT}`;
}

/** Árvore de categorias indentada para o WhatsApp. */
export async function categoryTreeText(org: Organization): Promise<string> {
  const tree = await loadCategoryTree(org.id);
  if (tree.length === 0) return "Nenhuma categoria criada. Crie no painel (Categorias).";
  const lines = tree.map(
    (n) => `${"  ".repeat(n.depth)}• ${n.name}${n.isActive ? "" : " _(inativa)_"}${n.mediaCount ? ` — ${n.mediaCount}` : ""}`,
  );
  return `🗂️ Categorias:\n${lines.join("\n")}`;
}
