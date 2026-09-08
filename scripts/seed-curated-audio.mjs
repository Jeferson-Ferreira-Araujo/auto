/**
 * Sobe faixas de áudio "curadas" (compartilhadas, organizationId NULL) para o R2
 * e insere as linhas em audio_tracks.
 *
 * Uso:  node scripts/seed-curated-audio.mjs <dir-com-mp3s>
 * O nome exibido vem do nome do arquivo (sem extensão, com espaços).
 * Lê R2_* e DATABASE_URL do .env.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { ulid } from "ulid";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
);
for (const k of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "DATABASE_URL"]) {
  if (!env[k]) throw new Error(`Faltou ${k} no .env`);
}
process.env.DATABASE_URL = env.DATABASE_URL;

const dir = process.argv[2];
if (!dir) throw new Error("uso: node scripts/seed-curated-audio.mjs <dir>");

const s3 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const prisma = new PrismaClient();

const MIME = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav" };

const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]);
if (!files.length) throw new Error("nenhum arquivo de áudio na pasta");

for (const file of files) {
  const path = join(dir, file);
  const ext = extname(file).toLowerCase();
  const name = basename(file, ext).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);

  let durationSec = null;
  try {
    durationSec = Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
        encoding: "utf8",
      }).trim(),
    );
  } catch {
    /* sem ffprobe: segue sem duração */
  }

  const key = `curated/audio/${ulid()}${ext}`;
  await s3.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: readFileSync(path), ContentType: MIME[ext] }),
  );

  const existing = await prisma.audioTrack.findFirst({ where: { organizationId: null, name } });
  if (existing) {
    console.log(`SKIP  ${name} (já existe)`);
    continue;
  }
  await prisma.audioTrack.create({
    data: { organizationId: null, name, storageKey: key, mimeType: MIME[ext], durationSec: durationSec || null },
  });
  console.log(`OK    ${name}  (${durationSec ? durationSec.toFixed(0) + "s" : "?"})  ${key}`);
}

await prisma.$disconnect();
console.log("\npronto.");
