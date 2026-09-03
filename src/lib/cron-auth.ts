import type { NextRequest } from "next/server";
import { env } from "./env";
import { AppError } from "./errors";

/** Valida o segredo compartilhado das rotas /api/cron/*. */
export function assertCronAuth(req: NextRequest): void {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("secret") ?? "";
  if (!token || token !== env().CRON_SECRET) {
    throw new AppError("UNAUTHENTICATED", "cron secret inválido");
  }
}
