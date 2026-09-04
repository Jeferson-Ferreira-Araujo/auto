import type { MediaAsset, Organization, WhatsAppContact } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { createScheduledPost, rescheduleScheduledPost, cancelScheduledPostById, findEditablePostsInRange } from "@/lib/posts";
import { setAutomationActive, findAutomationByName } from "@/lib/automations";
import { loadCategoryTree, resolveCategoryPath, formatPath } from "@/lib/categories";
import { eligibleMedia, pickByStrategy } from "@/lib/scheduler/selection";
import { VideoProcessingService } from "@/lib/video/service";
import { InstagramInsightsService } from "@/lib/instagram/insights";
import { resolveRange } from "@/lib/insights/range";
import { formatNumber } from "@/lib/insights/report";
import { formatTime } from "@/lib/display";
import {
  dayRange,
  listScheduled,
  countTodayCancellable,
  pauseAutomations,
  resumeAutomations,
  categoryTreeText,
  HELP_TEXT,
} from "./commands";
import { describeWhen } from "./dates";
import type { ExecResult, ParsedCommand, PendingAction, ReportRange } from "./types";

const log = childLogger({ mod: "whatsapp/executor" });

const LAST_MEDIA_TTL_MS = 2 * 60 * 60 * 1000;

export type ExecOutcome = { result: ExecResult; pending?: PendingAction | null };

const text = (t: string): ExecOutcome => ({ result: { kind: "text", text: t } });

/** Resolve a "última mídia" do contato, só se recente. */
async function lastMedia(contact: WhatsAppContact): Promise<MediaAsset | null> {
  if (!contact.lastMediaAssetId || !contact.lastMediaAt) return null;
  if (Date.now() - contact.lastMediaAt.getTime() > LAST_MEDIA_TTL_MS) return null;
  return prisma.mediaAsset.findFirst({
    where: { id: contact.lastMediaAssetId, organizationId: contact.organizationId },
  });
}

function awaitMediaText(purpose: "publish" | "library" | "enhance"): ExecOutcome {
  const msg =
    purpose === "enhance"
      ? "🎬 Me envie o *vídeo* que você quer melhorar."
      : purpose === "library"
        ? "🖼️ Me envie a *foto* ou *vídeo* para adicionar à biblioteca."
        : "📸 Me envie a *foto* ou *vídeo* que você quer publicar (pode já vir com a legenda).";
  return { result: { kind: "text", text: msg }, pending: { type: "AWAIT_MEDIA", purpose } };
}

async function reportText(org: Organization, range: ReportRange): Promise<string> {
  const r = await InstagramInsightsService.getReport(org.id, resolveRange({ range }));
  if (r.status === "not_connected") {
    return "📊 Ative os relatórios reconectando o Instagram no painel (Configurações → Instagram).";
  }
  if (r.status === "no_data") return `📊 Ainda não há publicações registradas nos ${r.label}.`;
  const m = Object.fromEntries(r.metrics.map((x) => [x.key, x]));
  const line = (k: string) => (m[k] ? formatNumber(m[k].value) : "0");
  const parts = [
    `📊 *${r.label}*`,
    `• ${line("posts")} publicações`,
    `• ${line("views")} visualizações · ${line("reach")} de alcance`,
    `• ${line("likes")} curtidas · ${line("comments")} comentários · ${line("saved")} salvos`,
  ];
  if (r.followers != null) parts.push(`• ${r.followers >= 0 ? "+" : ""}${formatNumber(r.followers)} seguidores`);
  if (r.sentences[0]) parts.push("", r.sentences[0]);
  return parts.join("\n");
}

async function bestPostText(org: Organization, range: ReportRange): Promise<string> {
  const r = await InstagramInsightsService.getReport(org.id, resolveRange({ range }));
  if (r.status !== "ok" || !r.best) {
    return "Ainda não tenho uma publicação com dados suficientes nesse período.";
  }
  const b = r.best;
  const tipo = b.mediaProductType === "REELS" ? "Reel" : b.mediaType === "IMAGE" ? "Imagem" : "Publicação";
  const when = new Intl.DateTimeFormat("pt-BR", { timeZone: org.timezone, day: "2-digit", month: "2-digit" }).format(new Date(b.publishedAt));
  return (
    `🏆 Sua melhor publicação (${r.label}):\n` +
    `${tipo} de ${when} — ${formatNumber(b.views || b.reach)} visualizações, ${formatNumber(b.likes)} curtidas, ${formatNumber(b.comments)} comentários.` +
    (b.permalink ? `\n${b.permalink}` : "")
  );
}

async function accountStatusText(org: Organization): Promise<string> {
  const [ig, autoTotal, autoActive, scheduled, media, published] = await Promise.all([
    prisma.instagramAccount.findUnique({ where: { organizationId: org.id } }),
    prisma.automation.count({ where: { organizationId: org.id } }),
    prisma.automation.count({ where: { organizationId: org.id, isActive: true } }),
    prisma.scheduledPost.count({
      where: { organizationId: org.id, status: "SCHEDULED", scheduledAt: { gte: new Date() } },
    }),
    prisma.mediaAsset.count({ where: { organizationId: org.id } }),
    prisma.scheduledPost.count({ where: { organizationId: org.id, status: "PUBLISHED" } }),
  ]);
  return [
    `📋 *${org.name}*`,
    `• Instagram: ${ig?.status === "CONNECTED" ? `@${ig.username} ✅` : "não conectado ⚠️"}`,
    `• Publicação automática: ${org.autoPublishStatus === "PAUSED" ? "pausada ⏸️" : "ativa ▶️"}`,
    `• Automações: ${autoActive}/${autoTotal} ativas`,
    `• Agendadas: ${scheduled} · Publicadas: ${published}`,
    `• Mídias na biblioteca: ${media}`,
  ].join("\n");
}

/** Resolve termos livres num nó da árvore de categorias da org. */
async function resolveCat(orgId: string, terms: string[]) {
  const tree = await loadCategoryTree(orgId);
  const res = resolveCategoryPath(tree, terms);
  return { tree, res };
}

// ─────────────────────────── executor ───────────────────────────

export async function executeCommand(
  ctx: { org: Organization; contact: WhatsAppContact },
  parsed: ParsedCommand,
): Promise<ExecOutcome> {
  const { org, contact } = ctx;
  const tz = org.timezone;

  switch (parsed.kind) {
    case "MENU":
      return { result: { kind: "menu" } };
    case "HELP":
      return text(HELP_TEXT);
    case "CONFIRM":
    case "DECLINE":
      return text("Ok. 👍");

    case "PAUSE_AUTOMATIONS":
      return text(await pauseAutomations(org));
    case "RESUME_AUTOMATIONS":
      return text(await resumeAutomations(org));

    case "PAUSE_ONE":
    case "RESUME_ONE": {
      const active = parsed.kind === "RESUME_ONE";
      const auto = await findAutomationByName(org.id, parsed.name);
      if (!auto) return text(`Não achei uma automação chamada *${parsed.name}*. Envie *liste as automações* no painel para conferir o nome.`);
      await setAutomationActive(org.id, auto.id, active);
      return text(`${active ? "▶️" : "⏸️"} Automação *${auto.name}* ${active ? "reativada" : "pausada"}.`);
    }

    case "LIST_SCHEDULED":
      return text(await listScheduled(org, parsed.day));

    case "LIST_CATEGORIES":
      return text(await categoryTreeText(org));

    case "SCHEDULE_FROM_CATEGORY": {
      const { tree, res } = await resolveCat(org.id, parsed.terms);
      if (!res) {
        return text(`Não achei a categoria «${parsed.terms.join(" ")}».\n\n${await categoryTreeText(org)}`);
      }
      if ("ambiguous" in res) {
        const opts = res.ambiguous.map((n) => `• ${formatPath(n.path)}`).join("\n");
        return text(`Encontrei mais de uma opção para «${parsed.terms.join(" ")}»:\n${opts}\n\nEspecifique melhor.`);
      }
      const node = res.node;
      const onDate = parsed.scheduledAt ?? new Date();
      const media = await eligibleMedia({ organizationId: org.id, categoryId: node.id, mediaType: "ANY", onDate });
      const chosen = pickByStrategy(media, "LEAST_USED", 0);
      if (!chosen) {
        const withMedia = tree.filter((n) => n.mediaCount > 0 && n.path.join(">").startsWith(node.path.slice(0, -1).join(">")));
        const hint = withMedia.length ? `\n\nVocê tem mídia em:\n${withMedia.map((n) => `• ${formatPath(n.path)}`).join("\n")}` : "";
        return text(`Não achei nenhuma mídia em *${formatPath(node.path)}*.${hint}`);
      }
      if (parsed.scheduledAt) {
        try {
          await createScheduledPost(org.id, {
            mediaAssetId: chosen.id,
            scheduledAt: parsed.scheduledAt,
            caption: parsed.caption,
            source: "MANUAL",
          });
          return text(`✅ Agendei *${chosen.name}* (${formatPath(node.path)}) para *${describeWhen(parsed.scheduledAt, tz)}*.`);
        } catch (err) {
          return text(`❌ Não consegui agendar: ${err instanceof Error ? err.message : "erro"}`);
        }
      }
      return {
        result: { kind: "text", text: `Achei *${chosen.name}* em ${formatPath(node.path)}. Quando devo publicar? (ex.: *amanhã às 18h*)` },
        pending: { type: "SCHEDULE_WITH_MEDIA", mediaAssetId: chosen.id, caption: parsed.caption },
      };
    }

    case "ACCOUNT_STATUS":
      return text(await accountStatusText(org));

    case "PERFORMANCE":
      return text(await reportText(org, parsed.range));
    case "BEST_POST":
      return text(await bestPostText(org, parsed.range));

    case "CANCEL_TODAY": {
      const n = await countTodayCancellable(org);
      if (n === 0) return text("Não há publicações agendadas para hoje.");
      return {
        result: {
          kind: "buttons",
          body: `⚠️ Isso vai *cancelar ${n} publicação(ões)* de hoje. Confirmar?`,
          options: [
            { id: "confirm:yes", title: "Cancelar" },
            { id: "confirm:no", title: "Não" },
          ],
        },
        pending: { type: "CONFIRM_CANCEL_TODAY", count: n },
      };
    }

    case "CANCEL_ONE": {
      const { start, end } = dayRange(parsed.day, tz);
      const posts = await findEditablePostsInRange(org.id, start, end, parsed.hhmm ? { hhmm: parsed.hhmm, timeZone: tz } : undefined);
      const dayLabel = parsed.day === "tomorrow" ? "amanhã" : "hoje";
      if (posts.length === 0) {
        return text(`Não achei publicação agendada para ${dayLabel}${parsed.hhmm ? ` às ${parsed.hhmm}` : ""}.`);
      }
      if (posts.length > 1) {
        const lines = posts.map((p) => `• ${formatTime(p.scheduledAt, tz)} — ${p.mediaAsset.name}`);
        return text(`Tem ${posts.length} publicações ${dayLabel}:\n${lines.join("\n")}\n\nMe diga o horário exato para cancelar (ex.: *cancelar ${dayLabel} às ${formatTime(posts[0].scheduledAt, tz)}*).`);
      }
      const p = posts[0];
      const label = `${formatTime(p.scheduledAt, tz)} — ${p.mediaAsset.name}`;
      return {
        result: {
          kind: "buttons",
          body: `⚠️ Cancelar a publicação de ${dayLabel} (${label})?`,
          options: [
            { id: "confirm:yes", title: "Cancelar" },
            { id: "confirm:no", title: "Não" },
          ],
        },
        pending: { type: "CONFIRM_CANCEL_ONE", postId: p.id, label },
      };
    }

    case "RESCHEDULE": {
      if (!parsed.to) return text("Não entendi o novo horário. Ex.: *mude o post das 18h para 20h*.");
      const { start, end } = dayRange(parsed.day, tz);
      const posts = await findEditablePostsInRange(
        org.id,
        start,
        end,
        parsed.fromHhmm ? { hhmm: parsed.fromHhmm, timeZone: tz } : undefined,
      );
      const dayLabel = parsed.day === "tomorrow" ? "amanhã" : "hoje";
      if (posts.length === 0) return text(`Não achei publicação de ${dayLabel}${parsed.fromHhmm ? ` às ${parsed.fromHhmm}` : ""}.`);
      if (posts.length > 1) {
        const lines = posts.map((p) => `• ${formatTime(p.scheduledAt, tz)} — ${p.mediaAsset.name}`);
        return text(`Tem mais de uma publicação nesse horário:\n${lines.join("\n")}\nEspecifique melhor.`);
      }
      const p = posts[0];
      const label = `${formatTime(p.scheduledAt, tz)} — ${p.mediaAsset.name}`;
      return {
        result: {
          kind: "buttons",
          body: `Mudar *${label}* para *${describeWhen(parsed.to, tz)}*?`,
          options: [
            { id: "confirm:yes", title: "Mudar" },
            { id: "confirm:no", title: "Não" },
          ],
        },
        pending: { type: "CONFIRM_RESCHEDULE", postId: p.id, toIso: parsed.to.toISOString(), label },
      };
    }

    case "SCHEDULE_POST": {
      const media = await lastMedia(contact);
      if (!media) return awaitMediaText("publish");
      if (media.processingStatus !== "READY") return text("A última mídia ainda está sendo preparada. Tente de novo em instantes.");
      if (parsed.scheduledAt) {
        try {
          await createScheduledPost(org.id, {
            mediaAssetId: media.id,
            scheduledAt: parsed.scheduledAt,
            caption: parsed.caption,
            source: "MANUAL",
          });
          return text(`✅ Publicação agendada para *${describeWhen(parsed.scheduledAt, tz)}*.`);
        } catch (err) {
          return text(`❌ Não consegui agendar: ${err instanceof Error ? err.message : "erro"}`);
        }
      }
      return {
        result: { kind: "text", text: "Quando devo publicar? Responda com o horário, ex.: *amanhã às 18h* ou *hoje 20:00*." },
        pending: { type: "SCHEDULE_WITH_MEDIA", mediaAssetId: media.id, caption: parsed.caption },
      };
    }

    case "PUBLISH_NOW": {
      const media = await lastMedia(contact);
      if (!media) return awaitMediaText("publish");
      if (media.processingStatus !== "READY") return text("A última mídia ainda está sendo preparada. Tente de novo em instantes.");
      return {
        result: {
          kind: "buttons",
          body: `Publicar *${media.name}* no Instagram agora?${media.type === "VIDEO" ? " (o Reel leva alguns minutos para processar)" : ""}`,
          options: [
            { id: "confirm:yes", title: "Publicar" },
            { id: "confirm:no", title: "Não" },
          ],
        },
        pending: { type: "CONFIRM_PUBLISH_NOW", mediaAssetId: media.id },
      };
    }

    case "SAVE_TO_LIBRARY": {
      const media = await lastMedia(contact);
      if (!media) return awaitMediaText("library");
      return text(`✅ *${media.name}* está salva na biblioteca.`);
    }

    case "SET_CATEGORY": {
      const media = await lastMedia(contact);
      if (!media) return text("Me envie a foto ou vídeo primeiro e depois diga a categoria.");
      const { res } = await resolveCat(org.id, parsed.terms);
      if (!res) return text(`Não achei a categoria «${parsed.terms.join(" ")}».\n\n${await categoryTreeText(org)}`);
      if ("ambiguous" in res) {
        return text(
          `Mais de uma opção para «${parsed.terms.join(" ")}»:\n${res.ambiguous.map((n) => `• ${formatPath(n.path)}`).join("\n")}\nEspecifique melhor.`,
        );
      }
      await prisma.mediaAsset.update({ where: { id: media.id }, data: { categoryId: res.node.id } });
      return text(`✅ *${media.name}* agora está em *${formatPath(res.node.path)}*.`);
    }

    case "TOGGLE_MEDIA": {
      const media = await lastMedia(contact);
      if (!media) return text("Me envie a foto ou vídeo primeiro.");
      await prisma.mediaAsset.update({ where: { id: media.id }, data: { isActive: parsed.active } });
      return text(`${parsed.active ? "✅" : "🚫"} *${media.name}* ${parsed.active ? "ativada" : "desativada"} para publicação automática.`);
    }

    case "ENHANCE_VIDEO": {
      const media = await lastMedia(contact);
      if (!media) return awaitMediaText("enhance");
      if (media.type !== "VIDEO") return text("A melhoria automática é só para vídeos. Me envie o vídeo.");
      if (media.processingStatus !== "READY") return text("O vídeo ainda está sendo preparado. Tente de novo em instantes.");
      try {
        await VideoProcessingService.requestEnhancement(org.id, media.id, { auto: true });
        await VideoProcessingService.setPublishVariant(org.id, media.id, "ENHANCED").catch(() => {});
        return text("🎬 Preparando a versão melhorada — fica pronta em alguns minutos e será usada quando você publicar esse vídeo.");
      } catch (err) {
        return text(`❌ Não consegui iniciar a melhoria: ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    case "AWAIT_MEDIA":
      return awaitMediaText(parsed.purpose);

    default:
      log.debug({ parsed }, "comando não reconhecido");
      return text(`Não entendi. 🤔\n\n${HELP_TEXT}`);
  }
}

/** Aplica um estado pendente confirmado. Usado pelo inbound quando o usuário responde sim/não. */
export async function applyPending(
  ctx: { org: Organization; contact: WhatsAppContact },
  pending: PendingAction,
  confirmed: boolean,
): Promise<ExecOutcome> {
  const { org } = ctx;
  const tz = org.timezone;

  if (!confirmed) return text("Ok, não fiz nada.");

  switch (pending.type) {
    case "CONFIRM_CANCEL_TODAY": {
      const { start, end } = dayRange("today", tz);
      const res = await prisma.scheduledPost.updateMany({
        where: { organizationId: org.id, scheduledAt: { gte: start, lt: end }, status: { in: ["SCHEDULED", "DRAFT"] } },
        data: { status: "CANCELLED", errorMessage: "Cancelada via WhatsApp." },
      });
      return text(`🗑️ ${res.count} publicação(ões) de hoje canceladas.`);
    }
    case "CONFIRM_CANCEL_ONE":
      try {
        await cancelScheduledPostById(org.id, pending.postId, "Cancelada via WhatsApp.");
        return text(`🗑️ Publicação cancelada (${pending.label}).`);
      } catch (err) {
        return text(`❌ ${err instanceof Error ? err.message : "Não consegui cancelar."}`);
      }
    case "CONFIRM_RESCHEDULE":
      try {
        await rescheduleScheduledPost(org.id, pending.postId, new Date(pending.toIso));
        return text(`✅ Publicação remarcada para *${describeWhen(new Date(pending.toIso), tz)}*.`);
      } catch (err) {
        return text(`❌ ${err instanceof Error ? err.message : "Não consegui remarcar."}`);
      }
    case "CONFIRM_PUBLISH_NOW":
      try {
        await createScheduledPost(org.id, {
          mediaAssetId: pending.mediaAssetId,
          scheduledAt: new Date(Date.now() + 60_000),
          source: "MANUAL",
        });
        return text("🚀 Publicação na fila — vai ao ar em instantes.");
      } catch (err) {
        return text(`❌ Não consegui publicar: ${err instanceof Error ? err.message : "erro"}`);
      }
    default:
      return text("Ok.");
  }
}
