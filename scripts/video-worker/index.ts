/**
 * Worker de melhoria de vídeo — roda no GitHub Actions (FFmpeg já instalado no runner).
 *
 * Fluxo: claim de VideoJob(PENDING) -> baixa original do R2 -> ffprobe -> ffmpeg (preset) ->
 *        thumbnail -> sobe resultado no R2 -> atualiza video_jobs + media_assets.
 *
 * Env: WORKER_DB_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT
 *      FFMPEG_FONT (opcional; default = DejaVuSans-Bold do runner)
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ulid } from "ulid";
import { PRESETS, type PresetName, type VideoProbe } from "../../src/lib/video/presets";
import { buildFfmpegArgs, buildThumbArgs } from "../../src/lib/video/filtergraph";

const exec = promisify(execFile);
const FONT = process.env.FFMPEG_FONT || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const MAX_JOBS = Number(process.env.MAX_JOBS || 5);

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.R2_BUCKET!;

async function download(key: string, dest: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  await writeFile(dest, Buffer.from(bytes));
}
async function upload(key: string, path: string, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: await readFile(path), ContentType: contentType }));
}
function buildKey(orgId: string, kind: string, ext: string) {
  return `org/${orgId}/${kind}/${ulid()}.${ext}`;
}

async function ffprobe(path: string): Promise<VideoProbe> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path,
  ]);
  const j = JSON.parse(stdout);
  const v = (j.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === "video");
  const a = (j.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === "audio");
  return {
    durationSec: Number(j.format?.duration ?? 0),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    hasAudio: Boolean(a),
  };
}

type Job = {
  id: string;
  organizationId: string;
  mediaAssetId: string;
  preset: PresetName;
  titleText: string | null;
  includeLogo: boolean;
  stripAudio: boolean;
};

async function processJob(db: Client, job: Job) {
  const work = await mkdtemp(join(tmpdir(), "vid-"));
  const inPath = join(work, "in.mp4");
  const outPath = join(work, "out.mp4");
  const thumbPath = join(work, "thumb.jpg");
  const logoPath = join(work, "logo.png");
  try {
    const media = (
      await db.query(
        `SELECT ma."storageKey", o."logoStorageKey"
         FROM media_assets ma JOIN organizations o ON o.id = ma."organizationId"
         WHERE ma.id = $1`,
        [job.mediaAssetId],
      )
    ).rows[0];
    if (!media) throw new Error("mídia não encontrada");

    await db.query(`UPDATE video_jobs SET progress = 10, "updatedAt" = now() WHERE id = $1`, [job.id]);
    await download(media.storageKey, inPath);

    const probe = await ffprobe(inPath);
    let logoArg: string | null = null;
    if (job.includeLogo && media.logoStorageKey) {
      await download(media.logoStorageKey, logoPath);
      logoArg = logoPath;
    }

    await db.query(`UPDATE video_jobs SET progress = 35, "updatedAt" = now() WHERE id = $1`, [job.id]);

    const args = buildFfmpegArgs(PRESETS[job.preset], probe, {
      inputPath: inPath,
      outputPath: outPath,
      fontFile: FONT,
      titleText: job.titleText,
      logoPath: logoArg,
      stripAudio: job.stripAudio,
    });
    let stderr = "";
    try {
      ({ stderr } = await exec("ffmpeg", args, { maxBuffer: 1024 * 1024 * 32 }));
    } catch (e) {
      const se = (e as { stderr?: string }).stderr ?? "";
      throw new Error(`ffmpeg: ${se.split("\n").slice(-6).join(" | ").slice(0, 600)}`);
    }

    await db.query(`UPDATE video_jobs SET progress = 80, "updatedAt" = now() WHERE id = $1`, [job.id]);
    await exec("ffmpeg", buildThumbArgs(outPath, thumbPath));

    const outProbe = await ffprobe(outPath);
    const resultKey = buildKey(job.organizationId, "enhanced", "mp4");
    const thumbKey = buildKey(job.organizationId, "enhanced", "jpg");
    await upload(resultKey, outPath, "video/mp4");
    await upload(thumbKey, thumbPath, "image/jpeg");

    await db.query(
      `UPDATE video_jobs SET status='COMPLETED', progress=100, "completedAt"=now(), "updatedAt"=now(),
         "resultStorageKey"=$2, "resultThumbnailKey"=$3, "resultDurationSec"=$4, "resultWidth"=$5, "resultHeight"=$6,
         "ffmpegSummary"=$7
       WHERE id=$1`,
      [job.id, resultKey, thumbKey, outProbe.durationSec, outProbe.width, outProbe.height, stderr.slice(-1500)],
    );
    await db.query(
      `UPDATE media_assets SET "enhancedStorageKey"=$2, "enhancedThumbnailKey"=$3, "enhancedDurationSec"=$4,
         "activeVideoJobId"=$1, "updatedAt"=now()
       WHERE id = (SELECT "mediaAssetId" FROM video_jobs WHERE id = $1)`,
      [job.id, resultKey, thumbKey, outProbe.durationSec],
    );
    console.log(`✓ job ${job.id} concluído (${outProbe.width}x${outProbe.height}, ${outProbe.durationSec.toFixed(1)}s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ job ${job.id} falhou:`, msg.slice(0, 500));
    await db.query(
      `UPDATE video_jobs
         SET status = (CASE WHEN attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END)::"VideoJobStatus",
             "errorMessage" = $2, "updatedAt" = now()
       WHERE id = $1`,
      [job.id, msg.slice(0, 800)],
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const db = new Client({ connectionString: process.env.WORKER_DB_URL });
  await db.connect();
  try {
    let processed = 0;
    for (let i = 0; i < MAX_JOBS; i++) {
      const claimed = await db.query<Job>(
        `UPDATE video_jobs SET status='PROCESSING', "startedAt"=now(), attempts=attempts+1, "updatedAt"=now()
         WHERE id = (
           SELECT id FROM video_jobs WHERE status='PENDING'
           ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
         )
         RETURNING id, "organizationId", "mediaAssetId", preset, "titleText", "includeLogo", "stripAudio"`,
      );
      if (claimed.rows.length === 0) break;
      await processJob(db, claimed.rows[0]);
      processed++;
    }
    console.log(`Worker finalizado. ${processed} job(s) processado(s).`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
