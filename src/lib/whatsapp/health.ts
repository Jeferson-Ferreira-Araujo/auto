import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { WhatsAppService, whatsappConfigured } from "./service";

const log = childLogger({ mod: "whatsapp/health" });
const SINGLETON = "singleton";

export type WhatsAppHealthView = {
  qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  messagingLimitTier: string | null;
  lastEvent: string | null;
  lastEventAt: string | null;
  checkedAt: string | null;
};

const RATINGS = new Set(["GREEN", "YELLOW", "RED"]);

/** Normaliza o valor da Meta (que às vezes vem "GREEN", às vezes "HIGH"). */
function normalizeRating(v: string | null | undefined): WhatsAppHealthView["qualityRating"] {
  if (!v) return "UNKNOWN";
  const up = v.toUpperCase();
  if (RATINGS.has(up)) return up as WhatsAppHealthView["qualityRating"];
  if (up === "HIGH") return "GREEN";
  if (up === "MEDIUM") return "YELLOW";
  if (up === "LOW" || up === "FLAGGED") return "RED";
  return "UNKNOWN";
}

/** Consulta ativa (cron) — busca na Graph API e grava o snapshot. */
export async function refreshWhatsAppHealth(): Promise<{ skipped?: true; qualityRating?: string }> {
  if (!whatsappConfigured()) return { skipped: true };
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;

  let h: Awaited<ReturnType<typeof WhatsAppService.fetchPhoneHealth>>;
  try {
    h = await WhatsAppService.fetchPhoneHealth();
  } catch (err) {
    // Não deixa a nota "verde" antiga passar despercebida quando a checagem falha
    // (token expirado, permissão etc.). Registra e propaga para o cron sinalizar.
    await prisma.whatsAppHealth
      .upsert({
        where: { id: SINGLETON },
        create: { id: SINGLETON, phoneNumberId, lastEvent: "CHECK_FAILED", lastEventAt: new Date() },
        update: { lastEvent: "CHECK_FAILED", lastEventAt: new Date() },
      })
      .catch(() => {});
    log.error({ err }, "não consegui consultar a saúde do número WhatsApp");
    throw err;
  }

  const now = new Date();
  await prisma.whatsAppHealth.upsert({
    where: { id: SINGLETON },
    create: {
      id: SINGLETON,
      phoneNumberId,
      qualityRating: h.qualityRating,
      messagingLimitTier: h.messagingLimitTier,
      nameStatus: h.nameStatus,
      checkedAt: now,
    },
    update: {
      phoneNumberId,
      qualityRating: h.qualityRating,
      messagingLimitTier: h.messagingLimitTier,
      nameStatus: h.nameStatus,
      checkedAt: now,
    },
  });
  return { qualityRating: h.qualityRating ?? "UNKNOWN" };
}

/** Evento vindo do webhook (tempo real). Registra e revalida o snapshot. */
export async function recordWhatsAppHealthEvent(event: string, limitTier?: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "unknown";
  const now = new Date();
  try {
    await prisma.whatsAppHealth.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, phoneNumberId, lastEvent: event, lastEventAt: now, messagingLimitTier: limitTier ?? null },
      update: { lastEvent: event, lastEventAt: now, ...(limitTier ? { messagingLimitTier: limitTier } : {}) },
    });
  } catch (err) {
    log.warn({ err, event }, "falha ao gravar evento de saúde do WhatsApp");
  }
  // Busca o valor autoritativo (best-effort — o webhook não traz a nota final).
  await refreshWhatsAppHealth().catch((err) => log.warn({ err }, "refresh pós-evento falhou"));
}

export async function getWhatsAppHealth(): Promise<WhatsAppHealthView | null> {
  const row = await prisma.whatsAppHealth.findUnique({ where: { id: SINGLETON } });
  if (!row) return null;
  return {
    qualityRating: normalizeRating(row.qualityRating),
    messagingLimitTier: row.messagingLimitTier,
    lastEvent: row.lastEvent,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}
