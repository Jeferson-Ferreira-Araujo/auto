import { NextResponse, type NextRequest } from "next/server";
import { childLogger } from "@/lib/logger";
import { WhatsAppService, whatsappConfigured } from "@/lib/whatsapp/service";
import { handleInboundMessage } from "@/lib/whatsapp/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = childLogger({ mod: "api/whatsapp" });

/** Verificação do webhook (Meta chama isto ao salvar a config). */
export async function GET(req: NextRequest) {
  if (!whatsappConfigured()) return new NextResponse("whatsapp não configurado", { status: 503 });

  const sp = req.nextUrl.searchParams;
  const challenge = WhatsAppService.verifyWebhook(
    sp.get("hub.mode"),
    sp.get("hub.verify_token"),
    sp.get("hub.challenge"),
  );
  if (challenge === null) {
    log.warn("verificação de webhook rejeitada");
    return new NextResponse("forbidden", { status: 403 });
  }
  log.info("webhook verificado");
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/** Eventos (mensagens recebidas). SEMPRE responde 200 para a Meta não reenviar. */
export async function POST(req: NextRequest) {
  if (!whatsappConfigured()) return NextResponse.json({ ok: true });

  const raw = await req.text();

  if (!WhatsAppService.verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    log.warn("assinatura do webhook inválida");
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const messages = WhatsAppService.parseWebhook(payload);
  for (const msg of messages) {
    try {
      await handleInboundMessage(msg);
    } catch (err) {
      log.error({ err, wamid: msg.wamid }, "erro não tratado no processamento");
    }
  }

  return NextResponse.json({ ok: true });
}
