import type { Organization, WhatsAppContact } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { ingestFromBuffer } from "@/lib/media/ingest";
import { WhatsAppService } from "./service";
import { defaultParser } from "./parser";
import { parsePtBrDateTime } from "./dates";
import { isLinkCodeMatch, PENDING_TTL_MS } from "./link";
import {
  HELP_TEXT,
  cancelToday,
  countTodayCancellable,
  listScheduled,
  pauseAutomations,
  resumeAutomations,
  schedule,
  unknownReply,
} from "./commands";
import type { IncomingMessage, PendingAction } from "./types";

const log = childLogger({ mod: "whatsapp/inbound" });

const NOT_LINKED =
  "👋 Olá! Este número ainda não está vinculado a nenhuma empresa na NEZZA.\n\n" +
  "Para vincular: entre na NEZZA → *Configurações → WhatsApp*, informe este número e envie aqui o código de 6 dígitos que aparecer.";

/** Processa UMA mensagem recebida. Sempre resolve (nunca lança) — a rota devolve 200. */
export async function handleInboundMessage(msg: IncomingMessage): Promise<void> {
  // 1. Idempotência: registra o evento; se o wamid já existe, ignora.
  try {
    await prisma.whatsAppEvent.create({
      data: {
        wamid: msg.wamid,
        direction: "INBOUND",
        phoneE164: `+${msg.from}`,
        messageType: msg.type,
        bodyPreview: previewOf(msg),
        status: "RECEIVED",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      log.debug({ wamid: msg.wamid }, "webhook duplicado — ignorado");
      return;
    }
    throw err;
  }

  const phoneE164 = `+${msg.from}`;
  let reply = "";
  let parsedForLog: unknown = null;
  let status: "PROCESSED" | "IGNORED" | "FAILED" = "PROCESSED";

  try {
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phoneE164 },
      include: { organization: true },
    });

    // 2. Contato inexistente ou ainda não verificado.
    if (!contact || !contact.verifiedAt) {
      const text = msg.type === "text" ? msg.text : "";
      if (
        contact &&
        !contact.verifiedAt &&
        contact.verificationExpiresAt &&
        contact.verificationExpiresAt > new Date() &&
        isLinkCodeMatch(text, contact.verificationCode)
      ) {
        await prisma.whatsAppContact.update({
          where: { id: contact.id },
          data: { verifiedAt: new Date(), verificationCode: null, verificationExpiresAt: null, lastInboundAt: new Date() },
        });
        reply = `✅ WhatsApp vinculado à empresa *${contact.organization.name}*.\n\n${HELP_TEXT}`;
      } else {
        reply = NOT_LINKED;
        status = "IGNORED";
      }
      await send(phoneE164, msg, reply, parsedForLog, status);
      return;
    }

    await prisma.whatsAppContact.update({ where: { id: contact.id }, data: { lastInboundAt: new Date() } });
    const org = contact.organization;
    const pending = readPending(contact);
    const text = msg.type === "text" ? msg.text : msg.type === "image" ? (msg.image.caption ?? "") : "";
    const parsed = await defaultParser.parse({ text, hasImage: msg.type === "image", timezone: org.timezone });
    parsedForLog = { pending: pending?.type ?? null, parsed };

    // 3. Estado de conversa pendente.
    if (pending) {
      if (pending.type === "CONFIRM_CANCEL_TODAY") {
        if (parsed.kind === "CONFIRM") {
          const n = await cancelToday(org);
          reply = `🗑️ ${n} publicação(ões) de hoje foram canceladas.`;
        } else {
          reply = "Ok, não cancelei nada.";
        }
        await clearPending(contact.id);
        await send(phoneE164, msg, reply, parsedForLog, status);
        return;
      }
      if (pending.type === "SCHEDULE_WITH_MEDIA" || pending.type === "CONFIRM_SCHEDULE") {
        const when =
          pending.type === "CONFIRM_SCHEDULE" && parsed.kind === "CONFIRM"
            ? new Date(pending.scheduledAt)
            : parsePtBrDateTime(text, org.timezone);
        if (parsed.kind === "DECLINE") {
          reply = "Ok, cancelei o agendamento.";
          await clearPending(contact.id);
        } else if (when) {
          const caption = extractCaptionFrom(text) ?? pending.caption ?? null;
          reply = await scheduleGuarded(org, pending.mediaAssetId, when, caption);
          await clearPending(contact.id);
        } else {
          reply = "Não entendi o horário. Responda algo como *amanhã às 18h* ou *hoje 20:00*.";
        }
        await send(phoneE164, msg, reply, parsedForLog, status);
        return;
      }
    }

    // 4. Imagem recebida.
    if (msg.type === "image") {
      const asset = await downloadAndIngest(org.id, org.timezone, msg.image.mediaId, msg.image.mime);
      if (asset.processingStatus !== "READY") {
        reply = `Recebi a imagem, mas ela não pôde ser preparada: ${asset.processingError ?? "formato não suportado"}.`;
        await send(phoneE164, msg, reply, parsedForLog, status);
        return;
      }
      const captionText = msg.image.caption ?? "";
      const when = parsePtBrDateTime(captionText, org.timezone);
      const caption = extractCaptionFrom(captionText);
      if (when) {
        reply = await scheduleGuarded(org, asset.id, when, caption);
      } else {
        await setPending(contact.id, { type: "SCHEDULE_WITH_MEDIA", mediaAssetId: asset.id, caption });
        reply =
          "🖼️ Imagem recebida e pronta! Quando devo publicar?\n" +
          "Responda com o horário, ex.: *amanhã às 18h* ou *hoje 20:00*.";
      }
      await send(phoneE164, msg, reply, parsedForLog, status);
      return;
    }

    // 5. Comandos de texto.
    switch (parsed.kind) {
      case "PAUSE_AUTOMATIONS":
        reply = await pauseAutomations(org);
        break;
      case "RESUME_AUTOMATIONS":
        reply = await resumeAutomations(org);
        break;
      case "LIST_SCHEDULED":
        reply = await listScheduled(org, parsed.day);
        break;
      case "CANCEL_TODAY": {
        const n = await countTodayCancellable(org);
        if (n === 0) {
          reply = "Não há publicações agendadas para hoje.";
        } else {
          await setPending(contact.id, { type: "CONFIRM_CANCEL_TODAY", count: n });
          reply = `⚠️ Isso vai *cancelar ${n} publicação(ões)* de hoje. Confirmar? (responda *sim* ou *não*)`;
        }
        break;
      }
      case "SCHEDULE_POST":
        reply =
          "Para agendar, envie a *imagem* que você quer publicar junto com a legenda:\n" +
          '_"Poste amanhã às 18h_\n_Legenda: seu texto"_';
        break;
      case "HELP":
        reply = HELP_TEXT;
        break;
      default:
        reply = unknownReply();
    }
    await send(phoneE164, msg, reply, parsedForLog, status);
  } catch (err) {
    log.error({ err, wamid: msg.wamid }, "falha ao processar mensagem do WhatsApp");
    await prisma.whatsAppEvent.updateMany({
      where: { wamid: msg.wamid, direction: "INBOUND" },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
    });
    try {
      await WhatsAppService.sendText(phoneE164, "😕 Tive um problema para processar sua mensagem. Tente de novo em instantes.");
    } catch {
      /* ignora */
    }
  }
}

// ─────────────── helpers ───────────────

function previewOf(msg: IncomingMessage): string {
  if (msg.type === "text") return msg.text.slice(0, 200);
  if (msg.type === "image") return `[imagem] ${msg.image.caption ?? ""}`.slice(0, 200);
  return `[${msg.type}]`;
}

function readPending(contact: WhatsAppContact): PendingAction | null {
  if (!contact.pendingAction || !contact.pendingExpiresAt) return null;
  if (contact.pendingExpiresAt < new Date()) return null;
  return contact.pendingAction as unknown as PendingAction;
}

async function setPending(contactId: string, action: PendingAction): Promise<void> {
  await prisma.whatsAppContact.update({
    where: { id: contactId },
    data: {
      pendingAction: action as unknown as Prisma.InputJsonValue,
      pendingExpiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });
}

async function clearPending(contactId: string): Promise<void> {
  await prisma.whatsAppContact.update({
    where: { id: contactId },
    data: { pendingAction: Prisma.DbNull, pendingExpiresAt: null },
  });
}

function extractCaptionFrom(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*(?:legenda|caption|texto)\s*:\s*([\s\S]+)$/i);
  return m ? m[1].trim() : null;
}

async function downloadAndIngest(orgId: string, tz: string, mediaId: string, mimeHint: string) {
  const meta = await WhatsAppService.getMediaMeta(mediaId);
  const bytes = await WhatsAppService.downloadMedia(meta.url);
  return ingestFromBuffer({
    organizationId: orgId,
    bytes,
    mimeType: meta.mime || mimeHint,
    originalName: `whatsapp-${new Date().toISOString().slice(0, 16)}`,
    timezone: tz,
  });
}

async function scheduleGuarded(
  org: Organization,
  mediaAssetId: string,
  when: Date,
  caption: string | null,
): Promise<string> {
  try {
    return await schedule(org, { mediaAssetId, scheduledAt: when, caption });
  } catch (err) {
    return `❌ Não consegui agendar: ${err instanceof Error ? err.message : "erro"}`;
  }
}

async function send(
  phoneE164: string,
  inbound: IncomingMessage,
  reply: string,
  parsed: unknown,
  status: "PROCESSED" | "IGNORED" | "FAILED",
): Promise<void> {
  let outWamid = "";
  try {
    outWamid = await WhatsAppService.sendText(phoneE164, reply);
  } catch (err) {
    log.error({ err }, "falha ao enviar resposta no WhatsApp");
  }
  await prisma.whatsAppEvent.updateMany({
    where: { wamid: inbound.wamid, direction: "INBOUND" },
    data: { status, responseText: reply.slice(0, 1000), parsed: (parsed ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  if (outWamid) {
    await prisma.whatsAppEvent.create({
      data: {
        wamid: outWamid,
        direction: "OUTBOUND",
        phoneE164,
        messageType: "text",
        bodyPreview: reply.slice(0, 200),
        status: "PROCESSED",
      },
    });
  }
}
