// Dispara manualmente as rotas de cron em desenvolvimento.
// Uso: node scripts/cron.mjs generate|publish|refresh-tokens
import { readFileSync } from "node:fs";

const job = process.argv[2];
if (!["generate", "publish", "refresh-tokens"].includes(job)) {
  console.error("Uso: node scripts/cron.mjs generate|publish|refresh-tokens");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

// Em dev o servidor roda em localhost; passe APP_URL=... para apontar para outro lugar.
const base = process.env.APP_URL ?? "http://localhost:3000";
void env.NEXT_PUBLIC_APP_URL;
const res = await fetch(`${base}/api/cron?job=${job}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
});
console.log(res.status, await res.text());
