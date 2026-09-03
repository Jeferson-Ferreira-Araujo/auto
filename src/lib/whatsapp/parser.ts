import type { ParsedCommand } from "./types";
import { parsePtBrDateTime } from "./dates";

/**
 * Interface do parser de comandos. A v1 é determinística; no futuro dá para plugar
 * um parser de IA (implementando a mesma interface) sem tocar no webhook/executor.
 */
export interface CommandParser {
  parse(input: { text: string; hasImage: boolean; timezone: string; now?: Date }): Promise<ParsedCommand>;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

/** Extrai a legenda de "Legenda: ..." (ou "caption:"), pegando o resto da mensagem. */
function extractCaption(rawText: string): string | null {
  const m = rawText.match(/(?:^|\n)\s*(?:legenda|caption|texto)\s*:\s*([\s\S]+)$/i);
  if (m) return m[1].trim();
  return null;
}

// Só considera confirmação/recusa quando a mensagem é curta e "isolada".
const YES = /^(s|sim|ss|ok|okay|confirmo|confirmar|pode|isso|claro|positivo|👍|✅)[.!]?$/;
const NO = /^(n|nao|não|negativo|deixa pra la|deixa|👎|❌)[.!]?$/;

export class DeterministicParser implements CommandParser {
  async parse(input: { text: string; hasImage: boolean; timezone: string; now?: Date }): Promise<ParsedCommand> {
    const raw = input.text ?? "";
    const t = norm(raw);
    const now = input.now ?? new Date();

    if (!t && input.hasImage) {
      return { kind: "SCHEDULE_POST", scheduledAt: null, caption: null };
    }

    if (YES.test(t)) return { kind: "CONFIRM" };
    if (NO.test(t)) return { kind: "DECLINE" };

    if (/\b(ajuda|comandos|help|menu|o que voce faz|opcoes)\b/.test(t)) return { kind: "HELP" };

    // pausar / ativar automações
    if (/\b(pausar|pause|parar|desativar|suspender)\b/.test(t) && /\b(automa|publica)/.test(t)) {
      return { kind: "PAUSE_AUTOMATIONS" };
    }
    if (/\b(ativar|ativa|retomar|religar|voltar|reativar|liga)\b/.test(t) && /\b(automa|publica)/.test(t)) {
      return { kind: "RESUME_AUTOMATIONS" };
    }

    // cancelar publicações de hoje  (antes do "list", pois "cancelar ... agendad" casaria nos dois)
    if (/\bcancela/.test(t) && /\b(hoje|do dia)\b/.test(t)) {
      return { kind: "CANCEL_TODAY" };
    }

    // o que está programado / agendado para hoje|amanhã
    if (/\b(programad|agendad|marcad|tem (?:pra|para)|o que (?:vai|tem)|lista|listar)/.test(t)) {
      if (/\bamanha\b/.test(t)) return { kind: "LIST_SCHEDULED", day: "tomorrow" };
      return { kind: "LIST_SCHEDULED", day: "today" };
    }

    // agendar publicação
    const scheduleIntent =
      input.hasImage ||
      /\b(poste|postar|publique?|publicar|agende?|agendar|marca[r]?|programa[r]?)\b/.test(t);
    if (scheduleIntent) {
      const when = parsePtBrDateTime(raw, input.timezone, now);
      const caption = extractCaption(raw);
      return { kind: "SCHEDULE_POST", scheduledAt: when, caption };
    }

    return { kind: "UNKNOWN" };
  }
}

export const defaultParser: CommandParser = new DeterministicParser();
