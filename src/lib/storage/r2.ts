import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";
import { env } from "@/lib/env";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const e = env();
  _client = new S3Client({
    region: "auto",
    endpoint: e.R2_ENDPOINT,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function bucket(): string {
  return env().R2_BUCKET;
}

export type MediaKind = "media" | "processed" | "thumb" | "enhanced" | "logo";

/** Gera uma chave segura e opaca, isolada por organização. O nome original nunca vira chave. */
export function buildKey(organizationId: string, kind: MediaKind, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `org/${organizationId}/${kind}/${ulid()}.${clean}`;
}

/** URL pré-assinada para o browser enviar (PUT) diretamente ao R2. */
export async function presignPut(key: string, contentType: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

/**
 * URL pré-assinada de leitura (GET). Usada para entregar a mídia à Meta no momento
 * da publicação — a Meta faz cURL da URL, então ela precisa continuar válida durante
 * todo o processamento do container (usamos 2h por padrão).
 */
export async function presignGet(key: string, expiresIn = 7200): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Objeto vazio no R2: ${key}`);
  return Buffer.from(bytes);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function headExists(key: string): Promise<boolean> {
  try {
    await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: "bytes=0-0" }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => {});
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return map[mime] ?? "bin";
}
