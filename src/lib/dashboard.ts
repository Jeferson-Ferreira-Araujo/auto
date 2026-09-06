import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { orgTag } from "@/lib/cache";

/**
 * Agregados do Painel Principal. Uma passada de queries, cacheada por org + dia
 * (tag `org:<id>:dashboard`). As datas da semana/horizonte vêm calculadas de fora
 * (dependem de `new Date()`); só o dia entra na chave, o `revalidate: 300` cobre
 * o resto e o efeito do cron (publish/generate roda fora do Next).
 */
async function loadDashboard(orgId: string, weekStartIso: string, weekEndIso: string, in7dIso: string) {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekEndIso);
  const in7d = new Date(in7dIso);

  const [instagram, scheduledSoon, upcoming, weekPosts, automations, categoriesCount, mediaCount, publishedCount] =
    await Promise.all([
      prisma.instagramAccount.findUnique({ where: { organizationId: orgId } }),
      prisma.scheduledPost.count({
        where: { organizationId: orgId, status: "SCHEDULED", scheduledAt: { lte: in7d } },
      }),
      prisma.scheduledPost.findMany({
        where: { organizationId: orgId, status: { in: ["SCHEDULED", "PROCESSING"] } },
        include: {
          mediaAsset: { select: { id: true, name: true, type: true } },
          automation: { select: { category: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 6,
      }),
      prisma.scheduledPost.findMany({
        where: { organizationId: orgId, scheduledAt: { gte: weekStart, lt: weekEnd } },
        include: { mediaAsset: { select: { id: true, name: true, type: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.automation.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.mediaCategory.count({ where: { organizationId: orgId } }),
      prisma.mediaAsset.count({ where: { organizationId: orgId } }),
      prisma.scheduledPost.count({ where: { organizationId: orgId, status: "PUBLISHED" } }),
    ]);

  return { instagram, scheduledSoon, upcoming, weekPosts, automations, categoriesCount, mediaCount, publishedCount };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;

export function getDashboardData(
  orgId: string,
  nowIso: string,
  weekStartIso: string,
  weekEndIso: string,
  in7dIso: string,
): Promise<DashboardData> {
  return unstable_cache(
    () => loadDashboard(orgId, weekStartIso, weekEndIso, in7dIso),
    ["dashboard", orgId, nowIso.slice(0, 10)],
    { tags: [orgTag(orgId, "dashboard")], revalidate: 300 },
  )();
}
