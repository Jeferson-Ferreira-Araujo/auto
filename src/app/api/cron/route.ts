import { NextResponse, type NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { toErrorResponse, validation } from "@/lib/errors";
import { runGenerate } from "@/lib/scheduler/generate";
import { runPublish } from "@/lib/scheduler/publish";
import { runRefreshTokens } from "@/lib/scheduler/refresh-tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rota única dos jobs de cron. O pg_cron chama com ?job=generate|publish|refresh-tokens.
 * (Consolidado numa rota só por causa do limite de 12 Serverless Functions no plano Hobby.)
 */
async function handle(req: NextRequest) {
  try {
    assertCronAuth(req);
    const job = req.nextUrl.searchParams.get("job");
    switch (job) {
      case "generate":
        return NextResponse.json({ ok: true, job, ...(await runGenerate()) });
      case "publish":
        return NextResponse.json({ ok: true, job, ...(await runPublish()) });
      case "refresh-tokens":
        return NextResponse.json({ ok: true, job, ...(await runRefreshTokens()) });
      default:
        throw validation("Parâmetro ?job inválido (use generate | publish | refresh-tokens).");
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export const POST = handle;
export const GET = handle;
