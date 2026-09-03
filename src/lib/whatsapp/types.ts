import type { Organization, WhatsAppContact } from "@prisma/client";

/** Mensagem de entrada já normalizada (statuses de entrega são descartados). */
export type IncomingMessage =
  | { wamid: string; from: string; timestamp: number; type: "text"; text: string }
  | {
      wamid: string;
      from: string;
      timestamp: number;
      type: "image";
      image: { mediaId: string; mime: string; caption?: string };
    }
  | { wamid: string; from: string; timestamp: number; type: "unsupported"; raw: string };

/** Comando interpretado a partir do texto. Estrutura pronta para um parser de IA no futuro. */
export type ParsedCommand =
  | { kind: "PAUSE_AUTOMATIONS" }
  | { kind: "RESUME_AUTOMATIONS" }
  | { kind: "LIST_SCHEDULED"; day: "today" | "tomorrow" }
  | { kind: "CANCEL_TODAY" }
  | { kind: "SCHEDULE_POST"; scheduledAt: Date | null; caption: string | null }
  | { kind: "CONFIRM" }
  | { kind: "DECLINE" }
  | { kind: "HELP" }
  | { kind: "UNKNOWN" };

export type CommandContext = {
  contact: WhatsAppContact;
  org: Organization;
  /** presente quando a mensagem trouxe uma imagem */
  incomingImage?: { mediaId: string; mime: string; caption?: string };
};

export type CommandResult = { reply: string; parsed?: unknown };

/** Estado de conversa persistido em WhatsAppContact.pendingAction. */
export type PendingAction =
  | { type: "SCHEDULE_WITH_MEDIA"; mediaAssetId: string; caption: string | null }
  | { type: "CONFIRM_CANCEL_TODAY"; count: number }
  | { type: "CONFIRM_SCHEDULE"; mediaAssetId: string; scheduledAt: string; caption: string | null };
