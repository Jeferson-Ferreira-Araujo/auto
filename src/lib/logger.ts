import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { app: "instapub" },
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,app" },
        },
      }),
});

/** Cria um logger com contexto fixo (ex.: organizationId, scheduledPostId). */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
