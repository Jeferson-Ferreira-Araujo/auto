import { ZodError } from "zod";
import { logger } from "./logger";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "INTERNAL";

export const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
};

/** Erro de aplicação com mensagem segura para exibir ao usuário. */
export class AppError extends Error {
  code: AppErrorCode;
  status: number;
  details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (m = "Recurso não encontrado") => new AppError("NOT_FOUND", m);
export const forbidden = (m = "Você não tem acesso a este recurso") => new AppError("FORBIDDEN", m);
export const unauthenticated = (m = "Faça login para continuar") => new AppError("UNAUTHENTICATED", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);
export const validation = (m: string, details?: unknown) => new AppError("VALIDATION", m, details);

/** Resultado padronizado para Server Actions. */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: unknown } };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(err: unknown): ActionResult<never> {
  if (err instanceof AppError) {
    return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
  }
  if (err instanceof ZodError) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Dados inválidos", details: err.flatten() },
    };
  }
  logger.error({ err }, "Erro não tratado em action");
  return { ok: false, error: { code: "INTERNAL", message: "Ocorreu um erro inesperado. Tente novamente." } };
}
