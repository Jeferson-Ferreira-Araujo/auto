import type { WhatsAppContact } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { createScheduledPost } from "@/lib/posts";
import { WhatsAppService } from "./service";
import { defaultParser } from "./parser";
import { parseWhenLoose, describeWhen } from "./dates";
import { isLinkCodeMatch, PENDING_TTL_MS } from "./link";
import { HELP_TEXT } from "./commands";
import { receiveWhatsAppMedia, WhatsAppMediaError } from "./media";
import { executeCommand, applyPending } from "./executor";
import { formatResult } from "./format";
import type { IncomingMessage, OutgoingMessage, ParsedCommand, PendingAction } from "./types";

const log = childLogger({ mod: "whatsapp/inbound" });

const NOT_LINKED =
  "👋 Olá! Este número ainda não está vinculado a nenhuma empresa na AUTORA.\n\n" +
  "Para vincular: entre na AUTORA → *Configurações → WhatsApp*, informe este número e envie aqui o código de 6 dígitos que aparecer.";

const CONFIRM_PENDINGS = new Set<PendingAction["type"]>([
  "CONFIRM_CANCEL_TODAY",
  "CONFIRM_CANCEL_ONE",
  "CONFIRM_RESCHEDULE",
  "CONFIRM_PUBLISH_NOW",
]);

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
  let parsedForLog: unknown = null;
  const status: "PROCESSED" | "IGNORED" | "FAILED" = "PROCESSED";

  try {
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phoneE164 },
      include: { organization: true },
    });

    // 2. Contato inexistente ou ainda não verificado → fluxo de vínculo.
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
        await sendOutcome(phoneE164, msg, { kind: "text", text: `✅ WhatsApp vinculado à empresa *${contact.organization.name}*.\n\n${HELP_TEXT}` }, parsedForLog, "PROCESSED");
      } else {
        await sendOutcome(phoneE164, msg, { kind: "text", text: NOT_LINKED }, parsedForLog, "IGNORED");
      }
      return;
    }

    await prisma.whatsAppContact.update({ where: { id: contact.id }, data: { lastInboundAt: new Date() } });
    const org = contact.organization;
    const tz = org.timezone;
    const pending = readPending(contact);

    const interactiveId = msg.type === "interactive" ? msg.interactiveId : null;
    const text =
      msg.type === "text"
        ? msg.text
        : msg.type === "interactive"
          ? msg.title
          : msg.type === "image"
            ? (msg.image.caption ?? "")
            : msg.type === "video"
              ? (msg.video.caption ?? "")
              : "";
    const hasImage = msg.type === "image";
    const hasVideo = msg.type === "video";

    // 3. Recebeu mídia → baixa, valida, cria MediaAsset, marca como "última mídia".
    let mediaReady = false;
    if (hasImage || hasVideo) {
      try {
        const media = hasImage
          ? await receiveWhatsAppMedia({ organizationId: org.id, timezone: tz, mediaId: msg.image.mediaId, mimeHint: msg.image.mime, kind: "image" })
          : await receiveWhatsAppMedia({ organizationId: org.id, timezone: tz, mediaId: (msg as Extract<IncomingMessage, { type: "video" }>).video.mediaId, mimeHint: (msg as Extract<IncomingMessage, { type: "video" }>).video.mime, kind: "video" });
        await prisma.whatsAppContact.update({
          where: { id: contact.id },
          data: { lastMediaAssetId: media.id, lastMediaAt: new Date() },
        });
        contact.lastMediaAssetId = media.id;
        contact.lastMediaAt = new Date();
        if (media.processingStatus !== "READY") {
          await sendOutcome(
            phoneE164,
            msg,
            { kind: "text", text: `Recebi a mídia, mas ela não pôde ser preparada: ${media.processingError ?? "formato não suportado"}.` },
            parsedForLog,
            "PROCESSED",
          );
          return;
        }
        mediaReady = true;
      } catch (err) {
        const emsg = err instanceof WhatsAppMediaError ? err.message : "Não consegui baixar a mídia. Tente enviar de novo.";
        await sendOutcome(phoneE164, msg, { kind: "text", text: emsg }, parsedForLog, "PROCESSED");
        return;
      }
    }

    // 4. Estado de conversa pendente.
    if (pending) {
      const outcome = await resolvePending(contact, pending, { text, interactiveId, tz, mediaReady });
      if (outcome) {
        parsedForLog = { pending: pending.type };
        await commit(contact, outcome.pending);
        await sendOutcome(phoneE164, msg, formatResult(outcome.result), parsedForLog, status);
        return;
      }
      // pendência não resolvida aqui → segue para o parser normal e descarta a pendência
      await clearPending(contact.id);
    }

    // 5. Parser → executor → formatter.
    let parsed: ParsedCommand = await defaultParser.parse({ text, hasImage, hasVideo, interactiveId, timezone: tz });

    // Mídia recém-recebida sem intenção clara na legenda → assume "agendar".
    if (mediaReady && (parsed.kind === "UNKNOWN" || parsed.kind === "MENU" || parsed.kind === "HELP")) {
      parsed = { kind: "SCHEDULE_POST", scheduledAt: null, caption: null };
    }

    parsedForLog = { parsed };
    const outcome = await executeCommand({ org, contact }, parsed);
    await commit(contact, outcome.pending);
    await sendOutcome(phoneE164, msg, formatResult(outcome.result), parsedForLog, status);
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

// ─────────────── pendências ───────────────

type ResolveInput = { text: string; interactiveId: string | null; tz: string; mediaReady: boolean };

async function resolvePending(
  contact: WhatsAppContact & { organization: import("@prisma/client").Organization },
  pending: PendingAction,
  input: ResolveInput,
): Promise<{ result: import("./types").ExecResult; pending?: PendingAction | null } | null> {
  const org = contact.organization;
  const yesNo = confirmValue(input.text, input.interactiveId);

  if (CONFIRM_PENDINGS.has(pending.type)) {
    if (yesNo === null) {
      // não é sim/não: se for outro comando claro, deixa o parser assumir (retorna null p/ fall-through)
      const p = await defaultParser.parse({ text: input.text, hasImage: false, hasVideo: false, interactiveId: input.interactiveId, timezone: input.tz });
      if (p.kind !== "UNKNOWN") return null;
      return { result: { kind: "text", text: "Responda *sim* ou *não*." }, pending };
    }
    const out = await applyPending({ org, contact }, pending, yesNo === "yes");
    return { result: out.result, pending: null };
  }

  if (pending.type === "SCHEDULE_WITH_MEDIA" || pending.type === "CONFIRM_SCHEDULE") {
    if (yesNo === "no") return { result: { kind: "text", text: "Ok, cancelei o agendamento." }, pending: null };
    const mediaAssetId = "mediaAssetId" in pending ? pending.mediaAssetId : "";
    const when =
      pending.type === "CONFIRM_SCHEDULE" && yesNo === "yes"
        ? new Date(pending.scheduledAt)
        : parseWhenLoose(input.text, input.tz);
    if (!when) {
      return { result: { kind: "text", text: "Não entendi o horário. Responda algo como *amanhã às 18h* ou *hoje 20:00*." }, pending };
    }
    try {
      await createScheduledPost(org.id, {
        mediaAssetId,
        scheduledAt: when,
        caption: extractCaption(input.text) ?? ("caption" in pending ? pending.caption : null),
        source: "MANUAL",
      });
      return { result: { kind: "text", text: `✅ Publicação agendada para *${describeWhen(when, input.tz)}*.` }, pending: null };
    } catch (err) {
      return { result: { kind: "text", text: `❌ Não consegui agendar: ${err instanceof Error ? err.message : "erro"}` }, pending: null };
    }
  }

  if (pending.type === "AWAIT_MEDIA") {
    if (input.mediaReady) {
      const override: ParsedCommand =
        pending.purpose === "enhance"
          ? { kind: "ENHANCE_VIDEO" }
          : pending.purpose === "library"
            ? { kind: "SAVE_TO_LIBRARY" }
            : { kind: "SCHEDULE_POST", scheduledAt: parseWhenLoose(input.text, input.tz), caption: extractCaption(input.text) };
      const out = await executeCommand({ org, contact }, override);
      return { result: out.result, pending: out.pending ?? null };
    }
    // mandou texto em vez de mídia → deixa o parser normal assumir
    return null;
  }

  return null;
}

function confirmValue(text: string, interactiveId: string | null): "yes" | "no" | null {
  if (interactiveId === "confirm:yes") return "yes";
  if (interactiveId === "confirm:no") return "no";
  const t = text
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
  if (/^(s|sim|ss|ok|okay|confirmo|confirmar|pode|isso|claro|positivo|publicar|cancelar|mudar|👍|✅)[.!]?$/.test(t)) return "yes";
  if (/^(n|nao|negativo|deixa|cancela|👎|❌)[.!]?$/.test(t)) return "no";
  return null;
}

// ─────────────── helpers ───────────────

function previewOf(msg: IncomingMessage): string {
  if (msg.type === "text") return msg.text.slice(0, 200);
  if (msg.type === "interactive") return `[menu] ${msg.title}`.slice(0, 200);
  if (msg.type === "image") return `[imagem] ${msg.image.caption ?? ""}`.slice(0, 200);
  if (msg.type === "video") return `[vídeo] ${msg.video.caption ?? ""}`.slice(0, 200);
  return `[${msg.type}]`;
}

function readPending(contact: WhatsAppContact): PendingAction | null {
  if (!contact.pendingAction || !contact.pendingExpiresAt) return null;
  if (contact.pendingExpiresAt < new Date()) return null;
  return contact.pendingAction as unknown as PendingAction;
}

async function commit(contact: WhatsAppContact, pending: PendingAction | null | undefined): Promise<void> {
  if (pending === undefined) return; // executor não mexeu na pendência
  if (pending === null) return clearPending(contact.id);
  return setPending(contact.id, pending);
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

function extractCaption(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*(?:legenda|caption|texto)\s*:\s*([\s\S]+)$/i);
  return m ? m[1].trim() : null;
}

async function sendOutcome(
  phoneE164: string,
  inbound: IncomingMessage,
  out: OutgoingMessage,
  parsed: unknown,
  status: "PROCESSED" | "IGNORED" | "FAILED",
): Promise<void> {
  let outWamid = "";
  let previewText = "";
  try {
    if (out.kind === "text") {
      previewText = out.text;
      outWamid = await WhatsAppService.sendText(phoneE164, out.text);
    } else if (out.kind === "buttons") {
      previewText = out.body;
      outWamid = await WhatsAppService.sendInteractiveButtons(phoneE164, { body: out.body, options: out.options, footer: out.footer });
    } else {
      previewText = out.body;
      outWamid = await WhatsAppService.sendInteractiveList(phoneE164, {
        body: out.body,
        button: out.button,
        rows: out.rows,
        header: out.header,
        footer: out.footer,
      });
    }
  } catch (err) {
    log.error({ err }, "falha ao enviar resposta no WhatsApp");
  }

  await prisma.whatsAppEvent.updateMany({
    where: { wamid: inbound.wamid, direction: "INBOUND" },
    data: {
      status,
      responseText: previewText.slice(0, 1000),
      parsed: (parsed ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  if (outWamid) {
    await prisma.whatsAppEvent.create({
      data: {
        wamid: outWamid,
        direction: "OUTBOUND",
        phoneE164,
        messageType: out.kind === "text" ? "text" : "interactive",
        bodyPreview: previewText.slice(0, 200),
        status: "PROCESSED",
      },
    });
  }
}
