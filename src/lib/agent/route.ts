import type { Organization, WhatsAppContact } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AgentType } from "./types";

export type AgentResolution =
  | { type: "BUSINESS_ASSISTANT"; contact: WhatsAppContact & { organization: Organization } }
  | { type: "CUSTOMER_SERVICE"; contact: (WhatsAppContact & { organization: Organization }) | null };

/**
 * Decide qual agente atende um telefone. Um número verificado e ativo, vinculado
 * a uma organização, fala com o BUSINESS_ASSISTANT. Qualquer outro número cai no
 * CUSTOMER_SERVICE. A decisão nunca olha o conteúdo da mensagem.
 */
export async function resolveAgent(phoneE164: string): Promise<AgentResolution> {
  const contact = await prisma.whatsAppContact.findUnique({
    where: { phoneE164 },
    include: { organization: true },
  });

  if (contact && contact.verifiedAt && contact.active && !contact.organization.blockedAt) {
    return { type: "BUSINESS_ASSISTANT", contact };
  }
  return { type: "CUSTOMER_SERVICE", contact: contact ?? null };
}

export type { AgentType };
