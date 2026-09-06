import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";
import { AppError } from "./errors-core";

export * from "./errors-core";

/** Converte qualquer erro numa resposta JSON consistente para route handlers. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err }, "AppError 5xx");
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Dados inválidos", details: err.flatten() } },
      { status: 422 },
    );
  }
  logger.error({ err }, "Erro não tratado");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Ocorreu um erro inesperado. Tente novamente." } },
    { status: 500 },
  );
}
