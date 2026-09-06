import type { Organization, WhatsAppContact } from "@prisma/client";
import { defaultParser } from "@/lib/whatsapp/parser";
import { executeCommand, type ExecOutcome } from "@/lib/whatsapp/executor";
import { resolveAgent } from "./route";
import type { AgentType } from "./types";

/**
 * AgentService — ponto único de entrada dos agentes, independente de canal.
 *
 * Hoje o BUSINESS_ASSISTANT reaproveita 100% o pipeline determinístico do WhatsApp
 * (`parser` → `executor`). O CUSTOMER_SERVICE ainda é só um stub. `src/lib/whatsapp/inbound.ts`
 * segue orquestrando idempotência/vínculo/pendências e pode passar a rotear por aqui
 * sem mudar o comportamento do assistente.
 */
export const AgentService = {
  resolve: resolveAgent,

  /** Interpreta e executa um comando do dono/equipe. Espelha o caminho atual do inbound. */
  async businessAssistant(input: {
    org: Organization;
    contact: WhatsAppContact;
    text: string;
    hasImage: boolean;
    hasVideo: boolean;
    interactiveId?: string | null;
  }): Promise<ExecOutcome> {
    const parsed = await defaultParser.parse({
      text: input.text,
      hasImage: input.hasImage,
      hasVideo: input.hasVideo,
      interactiveId: input.interactiveId,
      timezone: input.org.timezone,
    });
    return executeCommand({ org: input.org, contact: input.contact }, parsed);
  },

  /** Stub do atendimento ao cliente — sem IA/base de conhecimento nesta fase. */
  customerServiceReply(): string {
    return "Recebi sua mensagem e um atendente vai responder em breve. 🙏";
  },
};

export type { AgentType };
