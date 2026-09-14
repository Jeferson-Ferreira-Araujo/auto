/**
 * Núcleo (sem `next/*`) dos interruptores globais de funcionalidade — importável por qualquer
 * lib que o cron-worker/video-worker do GitHub Actions também usa (roda com `tsx`, fora do
 * runtime do Next): `video/service.ts`, `whatsapp/promo.ts`. Ver `features.ts` para as versões
 * cacheadas (`unstable_cache`/`updateTag`), usadas pelas páginas e Server Actions do app.
 */
import { prisma } from "@/lib/db";
import { validation } from "@/lib/errors-core";

/**
 * Controlados só pelo SuperAdmin em "Administração do sistema". Desligar uma chave desliga a
 * funcionalidade para TODAS as empresas ao mesmo tempo (não é por organização). Ausente no banco
 * = habilitado (o default é sempre `true`).
 *
 * `parent` agrupa uma sub-funcionalidade dentro de uma categoria de ferramenta: desligar o pai
 * desliga os filhos junto (mesmo que o filho esteja marcado como ligado no banco); desligar só um
 * filho não afeta os irmãos nem o pai. `group` é só de exibição no painel (Produtos/Marketing).
 */
export const FEATURES = {
  products_expiration: {
    label: "Validades",
    description: "Registro e painel de validade de produtos (Produtos → Validades).",
    group: "Produtos",
  },
  products_coupons: {
    label: "Cupons de desconto",
    description: "Criação e uso de cupons de desconto (Produtos → Cupons).",
    group: "Produtos",
  },

  marketing_video: {
    label: "Ferramentas de vídeo",
    description: "Categoria com as ferramentas de vídeo da Biblioteca — desligar aqui desliga todas de uma vez.",
    group: "Marketing",
  },
  marketing_video_enhance: {
    label: "Melhorar vídeo",
    description: "Presets automáticos de cor/nitidez/corte no vídeo (Biblioteca).",
    group: "Marketing",
    parent: "marketing_video",
  },
  marketing_video_merge: {
    label: "Juntar vídeos",
    description: "Juntar vários vídeos num só Reel, com transição de fade (Biblioteca).",
    group: "Marketing",
    parent: "marketing_video",
  },
  marketing_video_watermark: {
    label: "Marca d'água",
    description: "Aplicar a marca d'água da empresa nas mídias (Biblioteca).",
    group: "Marketing",
    parent: "marketing_video",
  },
  marketing_video_music: {
    label: "Trilha sonora",
    description: "Escolher música ao agendar uma publicação em vídeo (Calendário).",
    group: "Marketing",
    parent: "marketing_video",
  },

  marketing_whatsapp: {
    label: "WhatsApp",
    description: "Categoria do WhatsApp — desligar aqui para de responder mensagens e some do menu.",
    group: "Marketing",
  },
  marketing_whatsapp_commands: {
    label: "Comandos automáticos",
    description:
      "Agendar, listar, cancelar, pausar etc. por mensagem de texto (operador verificado) — inclui o comando \"pedido <telefone>\". Desligar aqui também impede registrar pedidos pelo WhatsApp.",
    group: "Marketing",
    parent: "marketing_whatsapp",
  },
  marketing_whatsapp_promo: {
    label: "Divulgação pós-pedido",
    description:
      "Consentimento do cliente e envio da promoção no dia seguinte a um pedido registrado. Precisa de \"Comandos automáticos\" ligado para registrar o pedido pelo WhatsApp.",
    group: "Marketing",
    parent: "marketing_whatsapp",
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function featureParent(key: FeatureKey): FeatureKey | null {
  const p = (FEATURES[key] as { parent?: FeatureKey }).parent;
  return p ?? null;
}

/** A própria chave + todos os ancestrais, da mais específica à mais geral. */
export function featureChain(key: FeatureKey): FeatureKey[] {
  const chain: FeatureKey[] = [key];
  let cur = featureParent(key);
  while (cur) {
    chain.push(cur);
    cur = featureParent(cur);
  }
  return chain;
}

/**
 * Consulta direto o banco, sem cache — seguro para código também usado fora do runtime do Next
 * (cron-worker/video-worker). Um pai desligado desliga o filho mesmo que o filho esteja `true`.
 */
export async function isFeatureEnabledRaw(key: FeatureKey): Promise<boolean> {
  const chain = featureChain(key);
  const rows = await prisma.featureFlag.findMany({ where: { key: { in: chain } } });
  const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
  return chain.every((k) => byKey.get(k) ?? true);
}

/** Igual a `isFeatureEnabledRaw`, mas lança quando desligada. Para código sem `next/*`. */
export async function requireFeatureEnabledRaw(key: FeatureKey): Promise<void> {
  if (await isFeatureEnabledRaw(key)) return;
  throw validation(`A funcionalidade "${FEATURES[key].label}" está desativada pelo administrador do sistema.`);
}
