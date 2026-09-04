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
  | {
      wamid: string;
      from: string;
      timestamp: number;
      type: "video";
      video: { mediaId: string; mime: string; caption?: string };
    }
  | { wamid: string; from: string; timestamp: number; type: "interactive"; interactiveId: string; title: string }
  | { wamid: string; from: string; timestamp: number; type: "unsupported"; raw: string };

export type ListDay = "today" | "tomorrow" | "week";
export type ReportRange = "7d" | "30d";

/** Comando interpretado. Estrutura pronta para um parser de IA no futuro (mesma interface). */
export type ParsedCommand =
  | { kind: "MENU" }
  | { kind: "HELP" }
  | { kind: "CONFIRM" }
  | { kind: "DECLINE" }
  | { kind: "PAUSE_AUTOMATIONS" }
  | { kind: "RESUME_AUTOMATIONS" }
  | { kind: "PAUSE_ONE"; name: string }
  | { kind: "RESUME_ONE"; name: string }
  | { kind: "LIST_SCHEDULED"; day: ListDay }
  | { kind: "CANCEL_TODAY" }
  | { kind: "CANCEL_ONE"; day: "today" | "tomorrow"; hhmm: string | null }
  | { kind: "RESCHEDULE"; fromHhmm: string | null; day: "today" | "tomorrow"; to: Date | null }
  | { kind: "SCHEDULE_POST"; scheduledAt: Date | null; caption: string | null }
  | { kind: "PUBLISH_NOW" }
  | { kind: "SAVE_TO_LIBRARY" }
  | { kind: "SET_CATEGORY"; name: string }
  | { kind: "LIST_CATEGORIES" }
  | { kind: "TOGGLE_MEDIA"; active: boolean }
  | { kind: "ENHANCE_VIDEO" }
  | { kind: "PERFORMANCE"; range: ReportRange }
  | { kind: "BEST_POST"; range: ReportRange }
  | { kind: "ACCOUNT_STATUS" }
  | { kind: "AWAIT_MEDIA"; purpose: "publish" | "library" | "enhance" }
  | { kind: "UNKNOWN" };

export type CommandContext = {
  contact: WhatsAppContact;
  org: Organization;
};

/** Estado de conversa persistido em WhatsAppContact.pendingAction. */
export type PendingAction =
  | { type: "SCHEDULE_WITH_MEDIA"; mediaAssetId: string; caption: string | null }
  | { type: "CONFIRM_SCHEDULE"; mediaAssetId: string; scheduledAt: string; caption: string | null }
  | { type: "CONFIRM_CANCEL_TODAY"; count: number }
  | { type: "CONFIRM_CANCEL_ONE"; postId: string; label: string }
  | { type: "CONFIRM_RESCHEDULE"; postId: string; toIso: string; label: string }
  | { type: "CONFIRM_PUBLISH_NOW"; mediaAssetId: string }
  | { type: "AWAIT_MEDIA"; purpose: "publish" | "library" | "enhance" }
  | { type: "AWAIT_CATEGORY"; mediaAssetId: string };

/** Resultado estruturado do executor. O formatter converte em mensagem do WhatsApp. */
export type ExecResult =
  | { kind: "text"; text: string }
  | { kind: "menu" }
  | { kind: "buttons"; body: string; options: Array<{ id: string; title: string }>; footer?: string }
  | { kind: "list"; body: string; button: string; rows: Array<{ id: string; title: string; description?: string }> };

/** Mensagem de saída pronta para o WhatsAppService. */
export type OutgoingMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; body: string; options: Array<{ id: string; title: string }>; footer?: string }
  | { kind: "list"; body: string; button: string; header?: string; footer?: string; rows: Array<{ id: string; title: string; description?: string }> };
