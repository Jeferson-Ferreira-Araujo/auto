/**
 * Limitador de taxa em memória (janela fixa por chave).
 *
 * Simples de propósito: sem Redis, sem dependência. Roda no isolate do middleware
 * — o contador é por instância e zera em cold start, então NÃO é um limite
 * rígido distribuído. Serve como "quebra-molas" contra brute-force e flood de
 * requisições no MVP. Para limite forte e global, trocar por Upstash/Redis.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, b] of store) {
    if (b.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * @param key    identificador (ex.: `login:<ip>`)
 * @param limit  máximo de requisições na janela
 * @param windowMs  tamanho da janela em ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (store.size > 5000 || Math.random() < 0.02) sweep(now);

  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Melhor esforço para o IP do cliente atrás do proxy da Vercel. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
