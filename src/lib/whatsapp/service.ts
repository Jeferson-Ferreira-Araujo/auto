import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import type { IncomingMessage } from "./types";

/**
 * WhatsAppService — ÚNICO ponto de contato com a WhatsApp Cloud API da Meta.
 * Nenhuma outra parte do código deve chamar graph.facebook.com para WhatsApp.
 */

const log = childLogger({ mod: "WhatsAppService" });

function cfg() {
  const e = env();
  return {
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: e.WHATSAPP_ACCESS_TOKEN,
    appSecret: e.WHATSAPP_APP_SECRET,
    verifyToken: e.WHATSAPP_VERIFY_TOKEN,
    version: e.WHATSAPP_GRAPH_VERSION,
    graph: `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}`,
  };
}

/** true se todas as variáveis essenciais estão presentes (leitura leve, sem validar o env inteiro). */
export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN,
  );
}

export function whatsappTestNumber(): string | null {
  return process.env.WHATSAPP_TEST_NUMBER ?? null;
}

async function metaFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${cfg().accessToken}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    log.error({ status: res.status, body }, "erro na WhatsApp Cloud API");
    throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

export const WhatsAppService = {
  /** Verificação do webhook (GET). Retorna o challenge se o token bater, senão null. */
  verifyWebhook(mode: string | null, token: string | null, challenge: string | null): string | null {
    if (mode === "subscribe" && token && token === cfg().verifyToken) return challenge ?? "";
    return null;
  },

  /** Valida o header X-Hub-Signature-256 contra o corpo cru usando o App Secret. */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader?.startsWith("sha256=")) return false;
    const expected = signatureHeader.slice("sha256=".length);
    const digest = createHmac("sha256", cfg().appSecret ?? "").update(rawBody, "utf8").digest("hex");
    try {
      return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(digest, "hex"));
    } catch {
      return false;
    }
  },

  /** Normaliza o payload do webhook em mensagens. Ignora statuses de entrega. */
  parseWebhook(payload: unknown): IncomingMessage[] {
    const out: IncomingMessage[] = [];
    const entries = (payload as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> })?.value;
        const messages = (value?.messages as unknown[] | undefined) ?? [];
        for (const m of messages) {
          const msg = m as Record<string, unknown>;
          const base = {
            wamid: String(msg.id),
            from: String(msg.from),
            timestamp: Number(msg.timestamp) || Math.floor(Date.now() / 1000),
          };
          if (msg.type === "text") {
            out.push({ ...base, type: "text", text: String((msg.text as { body?: string })?.body ?? "") });
          } else if (msg.type === "image") {
            const img = msg.image as { id?: string; mime_type?: string; caption?: string };
            out.push({
              ...base,
              type: "image",
              image: { mediaId: String(img?.id), mime: String(img?.mime_type ?? "image/jpeg"), caption: img?.caption },
            });
          } else {
            out.push({ ...base, type: "unsupported", raw: String(msg.type) });
          }
        }
      }
    }
    return out;
  },

  /** Passo 1 do download: resolve a URL temporária da mídia. */
  async getMediaMeta(mediaId: string): Promise<{ url: string; mime: string; size: number }> {
    const res = (await metaFetch(`${cfg().graph}/${mediaId}`)) as {
      url: string;
      mime_type: string;
      file_size: number;
    };
    return { url: res.url, mime: res.mime_type, size: res.file_size };
  },

  /** Passo 2: baixa os bytes da mídia (a URL exige o mesmo Bearer token). */
  async downloadMedia(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg().accessToken}` } });
    if (!res.ok) throw new Error(`Falha ao baixar mídia do WhatsApp (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  },

  /** Envia uma mensagem de texto simples. Retorna o wamid da mensagem enviada. */
  async sendText(toWaId: string, body: string): Promise<string> {
    const res = (await metaFetch(`${cfg().graph}/${cfg().phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "text",
        text: { preview_url: false, body: body.slice(0, 4096) },
      }),
    })) as { messages?: Array<{ id: string }> };
    return res.messages?.[0]?.id ?? "";
  },
};
