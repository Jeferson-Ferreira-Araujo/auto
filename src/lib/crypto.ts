import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * Criptografia simétrica AES-256-GCM para tokens da Meta.
 * Formato armazenado: base64(iv).base64(authTag).base64(ciphertext)
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "base64");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Payload cifrado inválido");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
