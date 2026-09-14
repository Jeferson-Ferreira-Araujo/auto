import { unstable_cache, updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { validation } from "@/lib/errors";
import { FEATURES, FEATURE_KEYS, type FeatureKey } from "@/lib/features-core";

export { FEATURES, FEATURE_KEYS, isFeatureEnabledRaw } from "@/lib/features-core";
export type { FeatureKey } from "@/lib/features-core";

const FEATURE_FLAGS_TAG = "feature-flags";

const loadFlags = unstable_cache(
  async (): Promise<Record<string, boolean>> => {
    const rows = await prisma.featureFlag.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
  },
  ["feature-flags"],
  { tags: [FEATURE_FLAGS_TAG], revalidate: 60 },
);

/** Estado de todas as chaves conhecidas (default `true` p/ chave nunca configurada). */
export async function listFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
  const stored = await loadFlags();
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, stored[k] ?? true])) as Record<FeatureKey, boolean>;
}

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const flags = await listFeatureFlags();
  return flags[key];
}

/** Igual a `isFeatureEnabled`, mas lança `AppError("VALIDATION", ...)` quando desligada. */
export async function requireFeatureEnabled(key: FeatureKey): Promise<void> {
  if (await isFeatureEnabled(key)) return;
  throw validation(`A funcionalidade "${FEATURES[key].label}" está desativada pelo administrador do sistema.`);
}

/** Invalida o cache de flags a partir de uma **Server Action** (read-your-own-writes). */
export function revalidateFeatureFlags(): void {
  updateTag(FEATURE_FLAGS_TAG);
}
