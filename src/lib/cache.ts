import { revalidateTag, unstable_cache, updateTag } from "next/cache";

/**
 * Cache de leituras por organização.
 *
 * As páginas do app são sempre dinâmicas (dependem do cookie de sessão), então o
 * ganho aqui NÃO é servir HTML estático — é transformar as queries pesadas do
 * Prisma em cache hit, cortando o custo de CPU por request. Invalidação por tag
 * `org:<orgId>:<resource>` disparada pelas server actions que escrevem.
 *
 * `revalidate` (padrão 300s) é o piso: mesmo sem invalidação explícita (ex.: o
 * cron roda fora do Next e não chama `revalidateTag`), os dados atualizam em ≤5 min.
 */

export const orgTag = (orgId: string, resource: OrgResource) => `org:${orgId}:${resource}`;

export type OrgResource = "categories" | "insights" | "dashboard" | "products";

/**
 * Envolve um loader `(orgId, ...args) => Promise<R>` com `unstable_cache`, com
 * chave e tag por organização. Os `args` extras entram na chave via `String(...)`,
 * então passe só primitivos (ids, datas em `ymd`, flags).
 */
export function cachedByOrg<A extends (string | number | boolean)[], R>(
  resource: OrgResource,
  loader: (orgId: string, ...args: A) => Promise<R>,
  revalidateSeconds = 300,
): (orgId: string, ...args: A) => Promise<R> {
  return (orgId, ...args) =>
    unstable_cache(() => loader(orgId, ...args), ["by-org", resource, orgId, ...args.map(String)], {
      tags: [orgTag(orgId, resource)],
      revalidate: revalidateSeconds,
    })();
}

/**
 * Invalida os recursos cacheados de uma organização a partir de uma **Server Action**.
 * `updateTag` expira na hora (read-your-own-writes) — o usuário vê a própria escrita.
 */
export function revalidateOrg(orgId: string, ...resources: OrgResource[]): void {
  for (const r of resources) updateTag(orgTag(orgId, r));
}

/** Igual, mas para **Route Handlers** (onde `updateTag` não pode ser chamado). */
export function revalidateOrgFromRoute(orgId: string, ...resources: OrgResource[]): void {
  for (const r of resources) revalidateTag(orgTag(orgId, r), "max");
}
