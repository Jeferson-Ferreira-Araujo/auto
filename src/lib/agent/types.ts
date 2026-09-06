/**
 * Núcleo de agentes — reutilizável pelo painel web no futuro, NÃO preso ao WhatsApp.
 *
 * - BUSINESS_ASSISTANT: usado pelo dono/equipe (número autorizado e verificado).
 *   Identidade SEMPRE pelo telefone remetente, nunca pelo conteúdo da mensagem.
 * - CUSTOMER_SERVICE: atende clientes da empresa. Responde só com informações
 *   fornecidas pela empresa; quando não sabe, encaminha para humano. (Só a costura
 *   nesta fase — sem IA, sem KnowledgeBase.)
 */
export type AgentType = "CUSTOMER_SERVICE" | "BUSINESS_ASSISTANT";

export type AgentChannel = "WHATSAPP";
