/**
 * Cron worker — roda a lógica dos jobs agendados FORA da Vercel (GitHub Actions),
 * falando direto com Postgres / Meta / R2. Substitui o pg_cron que chamava
 * `POST /api/cron?job=...` na Vercel (que consumia Fluid Active CPU do plano Hobby).
 *
 * Uso:  npx tsx scripts/cron-worker/index.ts "<job[,job...]>"
 *   jobs: generate | publish | refresh-tokens | video-recover | sync-insights
 *
 * Em produção é disparado por `.github/workflows/cron.yml`.
 * Em dev, via `npm run cron:*` (ver package.json).
 */
import { prisma } from "@/lib/db";
import { runGenerate } from "@/lib/scheduler/generate";
import { runPublish } from "@/lib/scheduler/publish";
import { runRefreshTokens } from "@/lib/scheduler/refresh-tokens";
import { VideoProcessingService } from "@/lib/video/service";
import { InstagramInsightsService } from "@/lib/instagram/insights";
import { runExpirationDetection } from "@/lib/products/detect";
import { processDomainEvents } from "@/lib/events/process";

const JOBS: Record<string, () => Promise<unknown>> = {
  generate: () => runGenerate(),
  publish: () => runPublish(),
  "refresh-tokens": () => runRefreshTokens(),
  "video-recover": () => VideoProcessingService.retryStuck(),
  "sync-insights": () => InstagramInsightsService.syncAll(),
  "detect-expirations": () => runExpirationDetection(),
  "process-events": () => processDomainEvents(),
};

async function main(): Promise<number> {
  const names = (process.argv[2] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.length === 0 || names.some((n) => !JOBS[n])) {
    console.error(`uso: tsx index.ts "<job[,job...]>"  jobs: ${Object.keys(JOBS).join(" | ")}`);
    return 1;
  }

  let failed = false;
  for (const name of names) {
    const startedAt = Date.now();
    try {
      const result = await JOBS[name]();
      console.log(`[${name}] ok (${Date.now() - startedAt}ms)`, JSON.stringify(result));
    } catch (err) {
      failed = true;
      console.error(`[${name}] ERRO (${Date.now() - startedAt}ms)`, err);
    }
  }
  return failed ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("erro fatal no cron worker", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
