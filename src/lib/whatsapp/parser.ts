import type { ParsedCommand, ReportRange } from "./types";
import { parsePtBrDateTime, extractTimeChange, parseHhmm } from "./dates";

/**
 * Interface do parser de comandos. A v1 é determinística (regras + linguagem natural
 * simples, sem IA). Para plugar IA no futuro, basta outra implementação desta interface —
 * o webhook/executor não mudam.
 */
export interface CommandParser {
  parse(input: {
    text: string;
    hasImage: boolean;
    hasVideo: boolean;
    interactiveId?: string | null;
    timezone: string;
    now?: Date;
  }): Promise<ParsedCommand>;
}

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

function extractCaption(rawText: string): string | null {
  const m = rawText.match(/(?:^|\n)\s*(?:legenda|caption|texto)\s*:\s*([\s\S]+)$/i);
  return m ? m[1].trim() : null;
}

/** Divide "pizza de frango" / "Produtos › Pizzas › Frango" em termos. */
function splitTerms(s: string): string[] {
  return norm(s)
    .split(/\s*(?:›|>|\/|\bde\b|\bda\b|\bdo\b|\be\b|,)\s*|\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !/^(a|o|os|as|um|uma)$/.test(x));
}

/** Extrai os termos de "conteúdo" de um pedido de publicação (remove verbos, data/hora, stopwords). */
function extractContentTerms(raw: string): string[] {
  let s = norm(raw).replace(/(?:^|\n)\s*(?:legenda|caption|texto)\s*:[\s\S]+$/i, " ");
  const drop = [
    /\b(poste|postar|publique|publicar|publica|agende|agendar|agenda|crie|criar|cria|faca|fazer|faz|monte|montar|prepare|preparar|marque|marcar|programe|programar|quero|gostaria)\b/g,
    /\b(um|uma|o|a|os|as|de|da|do|dos|das|e|com|pra|para|pro|no|na|nos|nas|em|nesse|nessa|esse|essa|isso|meu|minha)\b/g,
    /\b(post|postagem|postagens|publicacao|publicacoes|conteudo|nova|novo|foto|imagem|video|reels?)\b/g,
    /\b(hoje|amanha|depois de amanha|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|feira)\b/g,
    /\b(?:as|às)\s*\d{1,2}(?:[:h]\d{0,2})?\b/g,
    /\b\d{1,2}\s*[:h]\s*\d{0,2}\b/g,
    /\bdia\s+\d{1,2}\b/g,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\bmeio[\s-]?dia\b|\bmeia[\s-]?noite\b/g,
  ];
  for (const r of drop) s = s.replace(r, " ");
  return s
    .split(/[^a-z0-9]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

/** Nome de automação após "automação X", "a X", "pause X", etc. */
function extractName(raw: string): string {
  return raw
    .replace(/^\s*(pause|pausar|desative|desativar|ative|ativar|reative|reativar|ativa|liga|ligar|retoma|retomar)\s+/i, "")
    .replace(/\b(a|as|o|os|novamente|de novo|automacao|automa[çc][ãa]o|automa[çc][õo]es)\b/gi, "")
    .replace(/[."!?]+$/g, "")
    .trim();
}

const YES = /^(s|sim|ss|ok|okay|confirmo|confirmar|pode|isso|claro|positivo|👍|✅)[.!]?$/;
const NO = /^(n|nao|negativo|deixa pra la|deixa|cancela|👎|❌)[.!]?$/;

function rangeFrom(t: string): ReportRange {
  if (/\b(mes|mês|30 dias|ultimo mes|mensal)\b/.test(t)) return "30d";
  return "7d";
}

export class DeterministicParser implements CommandParser {
  async parse(input: {
    text: string;
    hasImage: boolean;
    hasVideo: boolean;
    interactiveId?: string | null;
    timezone: string;
    now?: Date;
  }): Promise<ParsedCommand> {
    const raw = input.text ?? "";
    const t = norm(raw);
    const now = input.now ?? new Date();
    const hasMedia = input.hasImage || input.hasVideo;

    // ── Respostas de menu / botões interativos ──
    const id = input.interactiveId ?? null;
    if (id) {
      if (id === "menu:novo") return { kind: "AWAIT_MEDIA", purpose: "publish" };
      if (id === "menu:melhorar") return { kind: "AWAIT_MEDIA", purpose: "enhance" };
      if (id === "menu:biblioteca") return { kind: "AWAIT_MEDIA", purpose: "library" };
      if (id === "menu:agenda" || id === "agenda:hoje") return { kind: "LIST_SCHEDULED", day: "today" };
      if (id === "agenda:amanha") return { kind: "LIST_SCHEDULED", day: "tomorrow" };
      if (id === "agenda:semana") return { kind: "LIST_SCHEDULED", day: "week" };
      if (id === "menu:automacoes") return { kind: "ACCOUNT_STATUS" };
      if (id === "menu:desempenho" || id === "range:7d") return { kind: "PERFORMANCE", range: "7d" };
      if (id === "range:30d") return { kind: "PERFORMANCE", range: "30d" };
      if (id === "auto:pause") return { kind: "PAUSE_AUTOMATIONS" };
      if (id === "auto:resume") return { kind: "RESUME_AUTOMATIONS" };
      if (id === "confirm:yes") return { kind: "CONFIRM" };
      if (id === "confirm:no") return { kind: "DECLINE" };
      return { kind: "UNKNOWN" };
    }

    if (YES.test(t)) return { kind: "CONFIRM" };
    if (NO.test(t)) return { kind: "DECLINE" };

    // ── Menu / ajuda ──
    if (/^(oi|ola|ol[áa]|opa|bom dia|boa tarde|boa noite|e ai|eai|menu|inicio|come[çc]ar|start)\b/.test(t) ||
        /\b(ajuda|comandos|help|o que voce faz|op[çc][õo]es)\b/.test(t)) {
      return { kind: "MENU" };
    }

    // ── Automação específica (antes das globais) ──
    const oneAuto = /\b(automa[çc][ãa]o|promo[çc][õo]es|campanha)\b/.test(t) || /\bnovamente\b/.test(t);
    if (/\b(pausar|pause|desativar|desative|suspender|parar)\b/.test(t) && oneAuto && !/\btodas?\b/.test(t)) {
      const name = extractName(raw);
      if (name) return { kind: "PAUSE_ONE", name };
    }
    if (/\b(ativar|ative|reativar|reative|retomar|religar|liga)\b/.test(t) && oneAuto && !/\btodas?\b/.test(t)) {
      const name = extractName(raw);
      if (name) return { kind: "RESUME_ONE", name };
    }

    // ── Automações (todas) ──
    if (/\b(pausar|pause|parar|desativar|suspender)\b/.test(t) && /\b(automa|publica)/.test(t)) {
      return { kind: "PAUSE_AUTOMATIONS" };
    }
    if (/\b(ativar|ativa|retomar|religar|voltar|reativar|liga)\b/.test(t) && /\b(automa|publica)/.test(t)) {
      return { kind: "RESUME_AUTOMATIONS" };
    }

    // ── Desempenho / melhor publicação / status ──
    if (/\b(melhor (publica|post|conteudo|reel|imagem)|qual foi (meu|minha) melhor)\b/.test(t)) {
      return { kind: "BEST_POST", range: rangeFrom(t) };
    }
    if (/\b(desempenho|relatorio|como (foi|esta|estao|estao indo)|resultados|metricas|numeros)\b/.test(t)) {
      return { kind: "PERFORMANCE", range: rangeFrom(t) };
    }
    if (/\b(status|situacao|como esta (a conta|tudo)|resumo (da conta|geral)|panorama)\b/.test(t)) {
      return { kind: "ACCOUNT_STATUS" };
    }

    // ── Categorias ──
    if (/\b(list(e|ar)?|quais|ver)\b/.test(t) && /\bcategorias?\b/.test(t)) {
      return { kind: "LIST_CATEGORIES" };
    }
    const catMatch = raw.match(/\bcategoria\s+([^\n.!?]+)/i) || raw.match(/\bna\s+([^\n.!?]+?)\s*$/i);
    if (catMatch && /\b(salve|salvar|guarde|guardar|categoria|mova|mover|classific|adicione? (a|na))\b/.test(t)) {
      const rawName = catMatch[1].trim();
      if (rawName && !/biblioteca/i.test(rawName)) {
        const terms = splitTerms(rawName);
        if (terms.length) return { kind: "SET_CATEGORY", terms };
      }
    }

    // ── Ativar/desativar mídia ──
    if (/\b(ative|ativar|habilite)\b/.test(t) && /\b(essa|esta|a)?\s*(midia|foto|imagem|video)\b/.test(t)) {
      return { kind: "TOGGLE_MEDIA", active: true };
    }
    if (/\b(desative|desativar|desabilite|pause)\b/.test(t) && /\b(essa|esta|a)?\s*(midia|foto|imagem|video)\b/.test(t)) {
      return { kind: "TOGGLE_MEDIA", active: false };
    }

    // ── Melhorar vídeo ──
    if (/\b(melhor(e|ar|a)|otimiz|ajust|editar?)\b/.test(t) && /\bvideo\b/.test(t)) {
      return { kind: "ENHANCE_VIDEO" };
    }

    // ── Salvar na biblioteca (sem agendar) ──
    if (/\b(salve|salvar|guarde|guardar|adicione? (a|na|para)|manda? pra)\b/.test(t) && /\bbiblioteca\b/.test(t)) {
      return { kind: "SAVE_TO_LIBRARY" };
    }

    // ── Remarcar ──
    const change = extractTimeChange(raw);
    if (change && /\b(mude|mudar|altere?|alterar|troque?|trocar|adie?|adiar|remarque?|remarcar|passe|passa)\b/.test(t)) {
      const day: "today" | "tomorrow" = /\bamanha\b/.test(t) ? "tomorrow" : "today";
      const to = parsePtBrDateTime(
        `${day === "tomorrow" ? "amanha" : "hoje"} ${change.toHhmm}`,
        input.timezone,
        now,
      );
      return { kind: "RESCHEDULE", fromHhmm: change.fromHhmm, day, to };
    }

    // ── Cancelar ──
    if (/\bcancel/.test(t)) {
      const day: "today" | "tomorrow" = /\bamanha\b/.test(t) ? "tomorrow" : "today";
      const hhmm = parseHhmm(raw);
      if (hhmm) return { kind: "CANCEL_ONE", day, hhmm };
      if (day === "today" && /\b(hoje|do dia|de hoje)\b/.test(t)) return { kind: "CANCEL_TODAY" };
      return { kind: "CANCEL_ONE", day, hhmm: null };
    }

    // ── Consultar agenda ──
    const agendaIntent =
      /\b(programad|agendad|marcad)/.test(t) ||
      /\btem (?:pra|para|hoje|amanha|essa|nessa|de)\b/.test(t) ||
      /\bo que (?:vai|tem|ta|esta|foi)\b/.test(t) ||
      /\bagenda\b/.test(t) ||
      /\blist(a|ar|e)\b/.test(t);
    if (agendaIntent && !/\bcategorias?\b/.test(t)) {
      if (/\bsemana\b/.test(t)) return { kind: "LIST_SCHEDULED", day: "week" };
      if (/\bamanha\b/.test(t)) return { kind: "LIST_SCHEDULED", day: "tomorrow" };
      return { kind: "LIST_SCHEDULED", day: "today" };
    }

    // ── Publicar / agendar ──
    const publishIntent =
      hasMedia ||
      /\b(poste|postar|publique?|publicar|agende?|agendar|marca[r]?|programa[r]?|crie?|criar|faca|fazer|monte|montar)\b/.test(t);
    if (publishIntent) {
      if (hasMedia && /\b(agora|imediatamente|ja|neste momento|agora mesmo)\b/.test(t)) {
        return { kind: "PUBLISH_NOW" };
      }
      const when = parsePtBrDateTime(raw, input.timezone, now);
      const caption = extractCaption(raw);
      if (!hasMedia) {
        const terms = extractContentTerms(raw);
        if (terms.length > 0) return { kind: "SCHEDULE_FROM_CATEGORY", terms, scheduledAt: when, caption };
        if (/\b(agora|imediatamente|ja)\b/.test(t)) return { kind: "PUBLISH_NOW" };
      }
      return { kind: "SCHEDULE_POST", scheduledAt: when, caption };
    }

    return { kind: "UNKNOWN" };
  }
}

export const defaultParser: CommandParser = new DeterministicParser();
