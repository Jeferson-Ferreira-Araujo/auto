/**
 * Divulgação por WhatsApp (delivery) — consentimento e envio no dia seguinte.
 *
 * Regras:
 *  - A atendente registra o pedido (`pedido <telefone>`). Isso cria o cliente e
 *    dispara o pedido de consentimento — de graça, porque a janela de 24h está
 *    aberta (o cliente acabou de conversar).
 *  - O cliente responde SIM/NÃO. SAIR cancela a qualquer momento.
 *  - No dia seguinte, `sendPendingPromos()` envia a promoção só para quem:
 *    deu consentimento, pediu nas últimas ~26h, ainda está na janela de 24h,
 *    e não recebeu promoção hoje. Respeita o interruptor e a nota de qualidade.
 *
 * Prisma puro (roda no worker do GitHub Actions).
 */
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { toE164 } from "./link";
import { WhatsAppService } from "./service";
import { getWhatsAppHealth } from "./health";

const log = childLogger({ mod: "whatsapp/promo" });

const OPT_OUT_RE = /^(sair|parar|para|cancelar|descadastrar|remover|stop|nao quero mais)[.!]*$/;
const YES_RE = /^(sim|s|quero|aceito|pode|claro|ok|bora|manda|pode mandar|👍|✅)[.!]*$/;
const NO_RE = /^(nao|n|nao quero|dispenso|agora nao)[.!]*$/;

function norm(t: string): string {
  return t
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

export type ConsentReply = "yes" | "no" | "out" | null;

export function classifyConsentReply(text: string): ConsentReply {
  const n = norm(text);
  if (OPT_OUT_RE.test(n)) return "out";
  if (YES_RE.test(n)) return "yes";
  if (NO_RE.test(n)) return "no";
  return null;
}

// ─────────────── cupons ───────────────

type CouponLike = {
  code: string;
  description: string | null;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  minOrderCents: number | null;
  expiresAt: Date | null;
};

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const ddmm = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function formatCouponLine(c: CouponLike): string {
  const desc = c.kind === "PERCENT" ? `${c.value}% de desconto` : `${brl(c.value)} de desconto`;
  const parts = [`🎟️ Cupom *${c.code}*: ${desc}`];
  if (c.description) parts.push(c.description);
  const tail: string[] = [];
  if (c.minOrderCents) tail.push(`pedido mín. ${brl(c.minOrderCents)}`);
  if (c.expiresAt) tail.push(`válido até ${ddmm(c.expiresAt)}`);
  if (tail.length) parts.push(`(${tail.join(" · ")})`);
  return parts.join("\n");
}

/** Cupom ativo mais recente da org (não expirado). */
export async function resolveActiveCoupon(organizationId: string) {
  return prisma.coupon.findFirst({
    where: {
      organizationId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Injeta o cupom no texto: no lugar de {cupom}, ou no fim se não houver placeholder. */
export function applyCoupon(body: string, couponLine: string | null): string {
  if (body.includes("{cupom}")) {
    return body
      .replace(/\s*\{cupom\}\s*/g, couponLine ? `\n\n${couponLine}\n\n` : "\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return couponLine ? `${body.trim()}\n\n${couponLine}` : body.trim();
}

const OPT_IN_ASK =
  "✅ Pedido confirmado! Obrigado pela preferência 🥐\n\n" +
  "Quer receber nossas promoções da semana aqui no WhatsApp? Responda *SIM*.\n" +
  "(se não quiser, é só responder *NÃO* — e você pode cancelar quando quiser com *SAIR*)";

const PROMO_FOOTER = "\n\n_Para não receber mais, responda SAIR._";

/** Comando `pedido <telefone> [valor]` — registra o pedido e pede o consentimento. */
export async function registerDeliveryOrder(
  organizationId: string,
  registeredById: string,
  input: { phoneRaw: string; valueCents?: number | null; note?: string | null; couponCode?: string | null },
): Promise<
  | { ok: true; customerPhone: string; asked: boolean; status: "asked" | "send_failed" | "already_in" | "opted_out" }
  | { ok: false; error: string }
> {
  const phoneE164 = toE164(input.phoneRaw);
  if (!phoneE164) return { ok: false, error: "Telefone inválido. Use com DDD, ex.: pedido 11999998888" };

  const now = new Date();
  const customer = await prisma.whatsAppCustomer.upsert({
    where: { organizationId_phoneE164: { organizationId, phoneE164 } },
    create: { organizationId, phoneE164, lastOrderAt: now },
    update: { lastOrderAt: now },
  });

  const couponCode = input.couponCode?.trim().toUpperCase() || null;
  await prisma.deliveryOrder.create({
    data: {
      organizationId,
      customerId: customer.id,
      registeredById,
      valueCents: input.valueCents ?? null,
      couponCode,
      note: input.note?.trim() || null,
    },
  });

  if (couponCode) {
    await prisma.coupon
      .updateMany({ where: { organizationId, code: couponCode }, data: { timesRedeemed: { increment: 1 } } })
      .catch(() => {});
  }

  if (customer.promoOptOutAt) return { ok: true, customerPhone: phoneE164, asked: false, status: "opted_out" };
  if (customer.promoConsent) return { ok: true, customerPhone: phoneE164, asked: false, status: "already_in" };

  // Marca que perguntamos (mesmo antes do envio confirmar) — assim um "SIM"
  // do cliente é reconhecido como consentimento.
  await prisma.whatsAppCustomer.update({ where: { id: customer.id }, data: { promoAskedAt: now } });

  // Pergunta o consentimento (janela aberta — grátis).
  try {
    await WhatsAppService.sendText(phoneE164, OPT_IN_ASK);
    return { ok: true, customerPhone: phoneE164, asked: true, status: "asked" };
  } catch (err) {
    log.error({ err, phoneE164 }, "falha ao enviar pedido de consentimento");
    return { ok: true, customerPhone: phoneE164, asked: false, status: "send_failed" };
  }
}

const ASK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // interpreta SIM/NÃO por até 3 dias após perguntar

/**
 * Trata uma resposta de cliente (número NÃO vinculado como operador).
 * Retorna `{ handled }` — se true, a `reply` já é a resposta a enviar.
 */
export async function handleCustomerConsentReply(
  phoneE164: string,
  text: string,
): Promise<{ handled: boolean; reply?: string }> {
  const customer = await prisma.whatsAppCustomer.findFirst({
    where: { phoneE164 },
    orderBy: { promoAskedAt: "desc" },
  });
  if (!customer) return { handled: false };

  // Toda mensagem do cliente renova a janela de 24h (para o envio da promo).
  await prisma.whatsAppCustomer.update({ where: { id: customer.id }, data: { lastInboundAt: new Date() } });

  const kind = classifyConsentReply(text);
  if (!kind) return { handled: false };

  if (kind === "out") {
    if (customer.promoOptOutAt) {
      return { handled: true, reply: "Você já não recebe nossas promoções. 🙂" };
    }
    await prisma.whatsAppCustomer.update({
      where: { id: customer.id },
      data: { promoOptOutAt: new Date(), promoConsent: false },
    });
    return { handled: true, reply: "Pronto, você não vai mais receber nossas promoções. Se mudar de ideia, é só avisar. 🙏" };
  }

  // SIM/NÃO só valem se perguntamos há pouco e ainda não respondeu.
  const asked = customer.promoAskedAt?.getTime() ?? 0;
  const fresh = Date.now() - asked < ASK_WINDOW_MS;
  if (!fresh || customer.promoConsent || customer.promoOptOutAt) return { handled: false };

  if (kind === "yes") {
    await prisma.whatsAppCustomer.update({
      where: { id: customer.id },
      data: { promoConsent: true, promoConsentAt: new Date(), promoConsentText: text.slice(0, 300) },
    });
    return { handled: true, reply: "Massa! 🎉 A partir de agora você recebe nossas promoções. Pra sair, é só responder SAIR." };
  }
  // "não"
  await prisma.whatsAppCustomer.update({ where: { id: customer.id }, data: { promoAskedAt: null } });
  return { handled: true, reply: "Tudo bem, não vou te mandar promoções. Bom te ver por aqui! 🥐" };
}

/** Cron matinal — envia a promoção para quem pediu ontem e consentiu. */
export async function sendPendingPromos(): Promise<{
  orgs: number;
  sent: number;
  skippedWindowClosed: number;
  skippedHealth: number;
}> {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const orderFrom = new Date(now - 26 * 60 * 60 * 1000);
  const orderTo = new Date(now - 2 * 60 * 60 * 1000);
  const windowFrom = new Date(now - 24 * 60 * 60 * 1000);

  const health = await getWhatsAppHealth();
  const stats = { orgs: 0, sent: 0, skippedWindowClosed: 0, skippedHealth: 0 };

  if (health?.qualityRating === "RED") {
    log.warn("nota de qualidade RED — nenhuma promoção enviada");
    return { ...stats, skippedHealth: 1 };
  }

  const orgs = await prisma.organization.findMany({
    where: {
      whatsappOutreachEnabled: true,
      whatsappPromoMessage: { not: null },
      blockedAt: null,
    },
    select: { id: true, whatsappPromoMessage: true },
  });

  for (const org of orgs) {
    stats.orgs++;
    const raw = (org.whatsappPromoMessage ?? "").trim();
    if (!raw) continue;

    const coupon = await resolveActiveCoupon(org.id);
    const body = applyCoupon(raw, coupon ? formatCouponLine(coupon) : null);
    let sentWithCoupon = 0;

    const customers = await prisma.whatsAppCustomer.findMany({
      where: {
        organizationId: org.id,
        promoConsent: true,
        promoOptOutAt: null,
        lastOrderAt: { gte: orderFrom, lte: orderTo },
        OR: [{ lastPromoAt: null }, { lastPromoAt: { lt: startOfToday } }],
      },
      take: 500,
    });

    for (const c of customers) {
      if (!c.lastInboundAt || c.lastInboundAt < windowFrom) {
        stats.skippedWindowClosed++;
        continue;
      }
      try {
        await WhatsAppService.sendText(c.phoneE164, body + PROMO_FOOTER);
        await prisma.whatsAppCustomer.update({ where: { id: c.id }, data: { lastPromoAt: new Date() } });
        stats.sent++;
        if (coupon) sentWithCoupon++;
      } catch (err) {
        log.error({ err, phone: c.phoneE164 }, "falha ao enviar promoção");
      }
    }

    if (coupon && sentWithCoupon > 0) {
      await prisma.coupon
        .update({ where: { id: coupon.id }, data: { timesSent: { increment: sentWithCoupon } } })
        .catch(() => {});
    }
  }

  return stats;
}
