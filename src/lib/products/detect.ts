import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { emitEvent } from "@/lib/events/emit";
import { expirationStatus, daysUntilExpiration } from "./status";

const log = childLogger({ mod: "products/detect" });

/**
 * Varre as validades PENDENTES e emite `PRODUCT_EXPIRING` (status URGENTE) e
 * `PRODUCT_EXPIRED` (já vencido). Idempotente via `dedupeKey` — cada registro
 * só gera um evento de cada tipo. Chamado pelo cron `detect-expirations`.
 */
export async function runExpirationDetection(): Promise<{ scanned: number; expiring: number; expired: number }> {
  const now = new Date();
  const rows = await prisma.productExpiration.findMany({
    where: { outcome: "PENDING" },
    include: { product: { select: { name: true } } },
  });

  let expiring = 0;
  let expired = 0;

  for (const r of rows) {
    const org = await prisma.organization.findUnique({
      where: { id: r.organizationId },
      select: { expiryWarningDays: true, expiryUrgentDays: true },
    });
    const cfg = { warningDays: org?.expiryWarningDays ?? 30, urgentDays: org?.expiryUrgentDays ?? 7 };
    const status = expirationStatus(r.expirationDate, cfg, now);
    const daysLeft = daysUntilExpiration(r.expirationDate, now);
    const iso = r.expirationDate.toISOString();

    if (status === "VENCIDO") {
      await emitEvent(
        r.organizationId,
        "PRODUCT_EXPIRED",
        { expirationId: r.id, productId: r.productId, productName: r.product.name, quantity: r.quantity, expirationDate: iso },
        `PRODUCT_EXPIRED:${r.id}`,
      );
      expired++;
    } else if (status === "URGENTE") {
      await emitEvent(
        r.organizationId,
        "PRODUCT_EXPIRING",
        {
          expirationId: r.id,
          productId: r.productId,
          productName: r.product.name,
          quantity: r.quantity,
          daysLeft,
          expirationDate: iso,
        },
        `PRODUCT_EXPIRING:${r.id}`,
      );
      expiring++;
    }
  }

  const result = { scanned: rows.length, expiring, expired };
  log.info(result, "detecção de validades concluída");
  return result;
}
