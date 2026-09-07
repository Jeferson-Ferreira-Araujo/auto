import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { AppError } from "./errors";

/** Comparação de segredos resistente a timing attack. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Valida o segredo compartilhado das rotas /api/cron/*. */
export function assertCronAuth(req: NextRequest): void {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("secret") ?? "";
  if (!token || !safeEqual(token, env().CRON_SECRET)) {
    throw new AppError("UNAUTHENTICATED", "cron secret inválido");
  }
}
