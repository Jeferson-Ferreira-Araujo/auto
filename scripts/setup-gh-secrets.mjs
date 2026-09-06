/**
 * Grava os secrets do worker de vídeo no repositório do GitHub (Actions secrets).
 * Lê os valores do .env local. O token do GitHub vem do arquivo .gh-token (gitignored)
 * ou da env GH_TOKEN. Uso: node scripts/setup-gh-secrets.mjs
 */
import { readFileSync } from "node:fs";
import _sodium from "libsodium-wrappers";

const REPO = process.env.GH_REPO || "Jeferson-Ferreira-Araujo/auto";
let token = process.env.GH_TOKEN;
try {
  if (!token) token = readFileSync(".gh-token", "utf8").trim();
} catch {
  /* ignore */
}
if (!token) {
  console.error("Faltou o token: crie .gh-token ou defina GH_TOKEN.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
);

const SECRETS = {
  // Worker de vídeo (.github/workflows/video-enhance.yml)
  WORKER_DB_URL: env.DIRECT_URL,
  R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: env.R2_BUCKET,
  R2_ENDPOINT: env.R2_ENDPOINT,
  // Cron worker (.github/workflows/cron.yml) — precisa do schema inteiro de src/lib/env.ts
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ENCRYPTION_KEY: env.ENCRYPTION_KEY,
  CRON_SECRET: env.CRON_SECRET,
  INSTAGRAM_APP_ID: env.INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET: env.INSTAGRAM_APP_SECRET,
  INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
  // GitHub não permite secrets com prefixo GITHUB_ — mapeados no workflow p/ GITHUB_REPO/TOKEN
  GH_WORKER_REPO: env.GITHUB_REPO,
  GH_DISPATCH_TOKEN: env.GITHUB_DISPATCH_TOKEN,
};

const gh = (path, init) =>
  fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });

await _sodium.ready;
const sodium = _sodium;

const pkRes = await gh("/actions/secrets/public-key");
if (!pkRes.ok) {
  console.error("Não consegui ler a chave pública:", pkRes.status, await pkRes.text());
  process.exit(1);
}
const pk = await pkRes.json();
const keyBytes = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);

for (const [name, value] of Object.entries(SECRETS)) {
  if (!value) {
    console.log(`SKIP ${name} (não encontrado no .env)`);
    continue;
  }
  const enc = sodium.crypto_box_seal(sodium.from_string(value), keyBytes);
  const res = await gh(`/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(enc, sodium.base64_variants.ORIGINAL),
      key_id: pk.key_id,
    }),
  });
  console.log(`${res.ok ? "OK " : "ERR"} ${name} (${res.status})`);
}

const list = await (await gh("/actions/secrets")).json();
console.log("\nSecrets no repo:", (list.secrets ?? []).map((s) => s.name).join(", "));
