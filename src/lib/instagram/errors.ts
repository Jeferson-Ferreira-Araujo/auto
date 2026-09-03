/** Erro vindo da API da Meta, com dados úteis para log e retry. */
export class InstagramApiError extends Error {
  status: number;
  metaCode?: number;
  metaSubcode?: number;
  fbtraceId?: string;
  raw: unknown;
  /** true = provavelmente adianta tentar de novo mais tarde. */
  retryable: boolean;

  constructor(message: string, opts: {
    status: number;
    metaCode?: number;
    metaSubcode?: number;
    fbtraceId?: string;
    raw?: unknown;
    retryable?: boolean;
  }) {
    super(message);
    this.name = "InstagramApiError";
    this.status = opts.status;
    this.metaCode = opts.metaCode;
    this.metaSubcode = opts.metaSubcode;
    this.fbtraceId = opts.fbtraceId;
    this.raw = opts.raw ?? null;
    this.retryable = opts.retryable ?? (opts.status >= 500 || opts.status === 429);
  }
}

/** Códigos que indicam token expirado / inválido (exige reconectar). */
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof InstagramApiError)) return false;
  return err.status === 401 || err.metaCode === 190 || err.metaCode === 10 || err.metaCode === 200;
}
