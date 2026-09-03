import { NextResponse, type NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { toErrorResponse } from "@/lib/errors";
import { runRefreshTokens } from "@/lib/scheduler/refresh-tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  try {
    assertCronAuth(req);
    const summary = await runRefreshTokens();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export const POST = handle;
export const GET = handle;
