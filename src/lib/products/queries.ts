import type { ExpirationOutcome } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { orgTag } from "@/lib/cache";
import { daysUntilExpiration, expirationStatus, type ExpirationStatus, type ExpiryThresholds } from "./status";

/** Item de validade já em shape JSON-safe (datas em ISO — o unstable_cache faz round-trip). */
export type ExpirationRow = {
  id: string;
  productId: string;
  productName: string;
  barcode: string | null;
  quantity: number;
  expirationDate: string; // ISO date
  lot: string | null;
  location: string | null;
  status: ExpirationStatus;
  daysLeft: number;
  outcome: ExpirationOutcome;
};

export type ExpirationBoard = {
  counts: { vencido: number; urgente: number; atencao: number; ok: number };
  vencido: ExpirationRow[];
  urgente: ExpirationRow[];
  atencao: ExpirationRow[];
  thresholds: ExpiryThresholds;
};

const DAY = 86_400_000;

async function loadBoard(orgId: string): Promise<ExpirationBoard> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { expiryWarningDays: true, expiryUrgentDays: true },
  });
  const thresholds: ExpiryThresholds = {
    warningDays: org?.expiryWarningDays ?? 30,
    urgentDays: org?.expiryUrgentDays ?? 7,
  };

  const now = new Date();
  const horizon = new Date(now.getTime() + (thresholds.warningDays + 1) * DAY);

  const rows = await prisma.productExpiration.findMany({
    where: { organizationId: orgId, outcome: "PENDING", expirationDate: { lte: horizon } },
    include: { product: { select: { name: true, barcode: true } } },
    orderBy: { expirationDate: "asc" },
  });

  const board: ExpirationBoard = {
    counts: { vencido: 0, urgente: 0, atencao: 0, ok: 0 },
    vencido: [],
    urgente: [],
    atencao: [],
    thresholds,
  };

  for (const r of rows) {
    const status = expirationStatus(r.expirationDate, thresholds, now);
    const daysLeft = daysUntilExpiration(r.expirationDate, now);
    const item: ExpirationRow = {
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      barcode: r.product.barcode,
      quantity: r.quantity,
      expirationDate: r.expirationDate.toISOString(),
      lot: r.lot,
      location: r.location,
      status,
      daysLeft,
      outcome: r.outcome,
    };
    if (status === "VENCIDO") {
      board.counts.vencido++;
      if (board.vencido.length < 8) board.vencido.push(item);
    } else if (status === "URGENTE") {
      board.counts.urgente++;
      if (board.urgente.length < 8) board.urgente.push(item);
    } else if (status === "ATENCAO") {
      board.counts.atencao++;
      if (board.atencao.length < 8) board.atencao.push(item);
    } else {
      board.counts.ok++;
    }
  }

  return board;
}

/** Painel de validades da org — cacheado (tag `org:<id>:products`, revalidate 5 min). */
export function getExpirationBoard(orgId: string): Promise<ExpirationBoard> {
  return unstable_cache(() => loadBoard(orgId), ["expiration-board", orgId], {
    tags: [orgTag(orgId, "products")],
    revalidate: 300,
  })();
}

export async function listExpirations(
  orgId: string,
  filter: { outcome?: ExpirationOutcome; status?: ExpirationStatus; q?: string } = {},
): Promise<ExpirationRow[]> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { expiryWarningDays: true, expiryUrgentDays: true },
  });
  const thresholds: ExpiryThresholds = {
    warningDays: org?.expiryWarningDays ?? 30,
    urgentDays: org?.expiryUrgentDays ?? 7,
  };
  const now = new Date();

  const rows = await prisma.productExpiration.findMany({
    where: {
      organizationId: orgId,
      outcome: filter.outcome ?? undefined,
      product: filter.q ? { name: { contains: filter.q, mode: "insensitive" } } : undefined,
    },
    include: { product: { select: { name: true, barcode: true } } },
    orderBy: { expirationDate: "asc" },
    take: 200,
  });

  return rows
    .map((r): ExpirationRow => {
      const status = expirationStatus(r.expirationDate, thresholds, now);
      const daysLeft = daysUntilExpiration(r.expirationDate, now);
      return {
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        barcode: r.product.barcode,
        quantity: r.quantity,
        expirationDate: r.expirationDate.toISOString(),
        lot: r.lot,
        location: r.location,
        status,
        daysLeft,
        outcome: r.outcome,
      };
    })
    .filter((r) => (filter.status ? r.status === filter.status : true));
}
