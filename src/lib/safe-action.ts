import { z } from "zod";
import { requireOrgContext, type OrgContext } from "@/lib/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/errors";

/**
 * Cria uma Server Action tipada que:
 *  - resolve o contexto da organização (auth + membership)
 *  - valida a entrada com Zod
 *  - captura erros e devolve um ActionResult uniforme
 */
export function orgAction<TInput extends z.ZodTypeAny, TOutput>(
  schema: TInput,
  handler: (input: z.infer<TInput>, ctx: OrgContext) => Promise<TOutput>,
) {
  return async (raw: z.input<TInput>): Promise<ActionResult<TOutput>> => {
    try {
      const ctx = await requireOrgContext();
      const input = schema.parse(raw);
      const data = await handler(input, ctx);
      return actionOk(data);
    } catch (err) {
      return actionError(err);
    }
  };
}
