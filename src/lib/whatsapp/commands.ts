import type { Organization } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { createScheduledPost } from "@/lib/posts";
import { formatTime } from "@/lib/display";
import { describeWhen } from "./dates";

const log = childLogger({ mod: "whatsapp/commands" });

function localYmd(instant: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instant)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

/** Intervalo [início, fim) de um dia no fuso da organização, em instantes UTC. */
export function dayRange(day: "today" | "tomorrow", tz: string, now = new Date()): { start: Date; end: Date } {
  const base = day === "tomorrow" ? new Date(now.getTime() + 86400000) : now;
  const ymd = localYmd(base, tz);
  const start = fromZonedTime(`${ymd}T00:00:00`, tz);
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

export const HELP_TEXT = [
  "🤖 *NEZZA* — comandos disponíveis:",
  "",
  "• *pausar automações* / *ativar automações*",
  "• *o que está programado para hoje?* / *...para amanhã?*",
  "• *cancelar publicações de hoje*",
  "• Envie uma *imagem* com a legenda:",
  '   _"Poste amanhã às 18h_',
  '   _Legenda: seu texto aqui"_',
].join("\n");

export async function pauseAutomations(org: Organization): Promise<string> {
  await prisma.organization.update({ where: { id: org.id }, data: { autoPublishStatus: "PAUSED" } });
  return "⏸️ Publicação automática *pausada*. As automações não vão publicar até você reativar. Publicações manuais continuam.";
}

export async function resumeAutomations(org: Organization): Promise<string> {
  await prisma.organization.update({ where: { id: org.id }, data: { autoPublishStatus: "ACTIVE" } });
  return "▶️ Publicação automática *reativada*. As automações voltam a publicar nos horários agendados.";
}

export async function listScheduled(org: Organization, day: "today" | "tomorrow"): Promise<string> {
  const { start, end } = dayRange(day, org.timezone);
  const posts = await prisma.scheduledPost.findMany({
    where: { organizationId: org.id, scheduledAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "PROCESSING", "DRAFT"] } },
    include: { mediaAsset: { select: { name: true, type: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  const label = day === "tomorrow" ? "amanhã" : "hoje";
  if (posts.length === 0) return `Nada agendado para ${label}. 🎉`;
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
