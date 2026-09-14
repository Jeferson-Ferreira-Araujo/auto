/**
 * Núcleo (sem `next/*`) dos interruptores globais de funcionalidade — importável pelo
 * cron-worker do GitHub Actions (roda com `tsx`, fora do runtime do Next). Ver `features.ts`
 * para as versões cacheadas (`unstable_cache`/`updateTag`), usadas pelo app.
 */
import { prisma } from "@/lib/db";

/**
 * Controlados só pelo SuperAdmin em "Administração do sistema". Desligar uma chave aqui
 * desliga a funcionalidade para TODAS as empresas ao mesmo tempo (não é por organização).
 * Ausente no banco = habilitado (o default é sempre `true`).
 */
export const FEATURES = {
  products_expiration: {
    label: "Validades",
    description: "Registro e painel de validade de produtos (Produtos → Validades).",
  },
  products_coupons: {
    label: "Cupons de desconto",
    description: "Criação e uso de cupons de desconto (Produtos → Cupons).",
  },
  marketing_whatsapp: {
    label: "WhatsApp",
    description:
      "Comandos por WhatsApp, divulgação pós-pedido e a aba Marketing → WhatsApp. Desligar para de responder mensagens novas.",
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** Consulta direto o banco, sem cache — seguro para o cron-worker (fora do runtime do Next). */
export async function isFeatureEnabledRaw(key: FeatureKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  return row?.enabled ?? true;
}
