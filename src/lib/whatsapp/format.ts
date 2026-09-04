import type { ExecResult, OutgoingMessage } from "./types";

/** Response formatter: converte o resultado do executor numa mensagem do WhatsApp. */
export function formatResult(result: ExecResult): OutgoingMessage {
  switch (result.kind) {
    case "text":
      return { kind: "text", text: result.text };
    case "buttons":
      return { kind: "buttons", body: result.body, options: result.options, footer: result.footer };
    case "list":
      return { kind: "list", body: result.body, button: result.button, rows: result.rows };
    case "menu":
      return MENU;
  }
}

/** Menu interativo de 1 nível (lista oficial do WhatsApp). */
export const MENU: OutgoingMessage = {
  kind: "list",
  header: "AUTOMIDIA",
  body: "O que você quer fazer?",
  footer: "Ou é só me mandar uma foto/vídeo e dizer quando publicar.",
  button: "Abrir menu",
  rows: [
    { id: "menu:novo", title: "📸 Criar publicação", description: "Enviar uma foto ou vídeo para publicar" },
    { id: "menu:agenda", title: "📅 Agenda", description: "Ver o que está programado" },
    { id: "menu:automacoes", title: "⚡ Automações", description: "Status e pausar/ativar" },
    { id: "menu:desempenho", title: "📊 Desempenho", description: "Resumo dos últimos 7 dias" },
    { id: "menu:biblioteca", title: "🖼️ Biblioteca", description: "Adicionar mídia sem publicar" },
    { id: "menu:melhorar", title: "🎬 Melhorar vídeo", description: "Melhoria automática para Reels" },
  ],
};
