import { z } from "zod";
import { requireUser, type SessionUser } from "@/lib/auth";
import { actionError, actionOk, forbidden, type ActionResult } from "@/lib/errors";

/** Exige que o usuário logado seja administrador do sistema. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin || user.blockedAt) throw forbidden("Acesso restrito.");
  return user;
}

/**
 * Server Action de administração do sistema: resolve `requireSuperAdmin()`,
 * valida a entrada com Zod e devolve um `ActionResult` uniforme.
 */
export function adminAction<TInput extends z.ZodTypeAny, TOutput>(
  schema: TInput,
  handler: (input: z.infer<TInput>, admin: SessionUser) => Promise<TOutput>,
) {
  return async (raw: z.input<TInput>): Promise<ActionResult<TOutput>> => {
    try {
      const admin = await requireSuperAdmin();
      const input = schema.parse(raw);
      const data = await handler(input, admin);
      return actionOk(data);
    } catch (err) {
      return actionError(err);
    }
  };
}
