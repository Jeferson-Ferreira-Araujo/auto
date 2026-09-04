/**
 * InstagramInsightsService — orquestra a sincronização dos Insights da Meta para o
 * banco e monta o relatório da área "Desempenho".
 *
 * - `syncAll()`   → chamado pelo cron (`?job=sync-insights`) a cada 3h.
 * - `syncAccount()` → dias da conta + métricas das publicações de uma InstagramAccount.
 * - `getReport()` → lê SOMENTE do banco; nunca chama a Meta.
 *
 * Multi-tenant: toda query é escopada por `organizationId`.
 */
import type { InstagramAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { getValidAccessToken } from "./account";
import { isAuthError } from "./errors";
import { InstagramService } from "./service";
import {
  type BestMedia,
  type MetricDelta,
  type Report,
} from "@/lib/insights/report";

const log = childLogger({ mod: "instagram/insights" });

const ACCOUNT_METRICS = ["reach", "views", "follower_count"];
const MEDIA_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"];

const DAY = 86400_000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────── SYNC ───────────────────────────

export const InstagramInsightsService = {
  async syncAll(): Promise<{ accounts: number; synced: number; failed: number }> {
    const accounts = await prisma.instagramAccount.findMany({ where: { status: "CONNECTED" } });
    let synced = 0;
    let failed = 0;
    for (const account of accounts) {
      try {
        await this.syncAccount(account);
        synced++;
      } catch (err) {
        failed++;
        log.warn({ accountId: account.id, err }, "sync de insights falhou");
      }
    }
    return { accounts: accounts.length, synced, failed };
  },

  async syncAccount(account: InstagramAccount): Promise<void> {
    let token: string;
    try {
      token = await getValidAccessToken(account);
    } catch {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { insightsError: "reconnect" },
      });
      return;
    }

    try {
      await syncAccountDays(account, token);
      await syncMedia(account, token);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { insightsSyncedAt: new Date(), insightsError: null },
      });
    } catch (err) {
      if (isAuthError(err) || isPermissionError(err)) {
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { insightsError: "reconnect" },
        });
        return;
      }
      throw err;
    }
  },

  getReport,
};

function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("permission") ||
    msg.includes("scope") ||
    msg.includes("manage_insights") ||
    msg.includes("not authorized")
  );
}

async function syncAccountDays(account: InstagramAccount, token: string): Promise<void> {
  const now = new Date();
  const since = new Date(now.getTime() - (account.insightsSyncedAt ? 3 : 90) * DAY);

  const byMetric = await InstagramService.getAccountInsights(
    token,
    account.igUserId,
    ACCOUNT_METRICS,
    since,
    now,
  );

  const days = new Set<string>();
  for (const m of Object.values(byMetric)) for (const d of Object.keys(m)) days.add(d);

  for (const day of days) {
    const date = new Date(`${day}T00:00:00.000Z`);
    const reach = Math.round(byMetric.reach?.[day] ?? 0);
    const views = Math.round(byMetric.views?.[day] ?? 0);
    const followerDelta = Math.round(byMetric.follower_count?.[day] ?? 0);
    await prisma.accountInsightDay.upsert({
      where: { instagramAccountId_date: { instagramAccountId: account.id, date } },
      create: {
        organizationId: account.organizationId,
        instagramAccountId: account.id,
        date,
        reach,
        views,
        followerDelta,
      },
      update: { reach, views, followerDelta, syncedAt: new Date() },
    });
  }

  // total de seguidores hoje (campo do usuário)
  const followersTotal = await InstagramService.getFollowersCount(token);
  if (followersTotal != null) {
    const today = new Date(`${ymd(now)}T00:00:00.000Z`);
    await prisma.accountInsightDay.upsert({
      where: { instagramAccountId_date: { instagramAccountId: account.id, date: today } },
      create: {
        organizationId: account.organizationId,
        instagramAccountId: account.id,
        date: today,
        followersTotal,
      },
      update: { followersTotal },
    });
  }
}

async function syncMedia(account: InstagramAccount, token: string): Promise<void> {
  const cutoffPublished = new Date(Date.now() - 60 * DAY);
  const staleBefore = new Date(Date.now() - 6 * 3600_000);

  const posts = await prisma.scheduledPost.findMany({
    where: {
      organizationId: account.organizationId,
      instagramAccountId: account.id,
      status: "PUBLISHED",
      instagramMediaId: { not: null },
      publishedAt: { gte: cutoffPublished },
      OR: [{ mediaInsight: null }, { mediaInsight: { lastSyncedAt: { lt: staleBefore } } }],
    },
    select: { id: true, instagramMediaId: true, publishedAt: true },
    take: 60,
  });

  for (const post of posts) {
    const mediaId = post.instagramMediaId!;
    try {
      const [fields, ins] = await Promise.all([
        InstagramService.getMediaFields(token, mediaId),
        InstagramService.getMediaInsights(token, mediaId, MEDIA_METRICS),
      ]);
      const publishedAt = fields.timestamp
        ? new Date(fields.timestamp)
        : (post.publishedAt ?? new Date());
      const data = {
        organizationId: account.organizationId,
        instagramAccountId: account.id,
        instagramMediaId: mediaId,
        scheduledPostId: post.id,
        mediaType: fields.media_type ?? "IMAGE",
        mediaProductType: fields.media_product_type ?? "FEED",
        permalink: fields.permalink ?? null,
        thumbnailUrl: fields.thumbnail_url ?? fields.media_url ?? null,
        publishedAt,
        reach: Math.round(ins.reach ?? 0),
        views: Math.round(ins.views ?? 0),
        likes: Math.round(ins.likes ?? fields.like_count ?? 0),
        comments: Math.round(ins.comments ?? fields.comments_count ?? 0),
        shares: Math.round(ins.shares ?? 0),
        saved: Math.round(ins.saved ?? 0),
        totalInteractions: Math.round(ins.total_interactions ?? 0),
        lastSyncedAt: new Date(),
      };
      await prisma.mediaInsight.upsert({
        where: { instagramMediaId: mediaId },
        create: data,
        update: data,
      });
    } catch (err) {
      if (isAuthError(err) || isPermissionError(err)) throw err;
      log.warn({ mediaId, err }, "sync de mídia falhou (ignorado)");
    }
  }
}

// ─────────────────────────── RELATÓRIO ───────────────────────────

type RangeInput = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string };

type MediaRow = Awaited<ReturnType<typeof loadMedia>>[number];

async function loadMedia(orgId: string, from: Date, to: Date) {
  return prisma.mediaInsight.findMany({
    where: { organizationId: orgId, publishedAt: { gte: from, lte: to } },
    include: {
      scheduledPost: { include: { mediaAsset: { include: { category: true } } } },
    },
    orderBy: { publishedAt: "desc" },
  });
}

function sum(rows: MediaRow[], key: keyof MediaRow): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

function pct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return (cur - prev) / prev;
}

function categoryName(r: MediaRow): string | null {
  return r.scheduledPost?.mediaAsset?.category?.name ?? null;
}

function toBest(r: MediaRow): BestMedia {
  return {
    instagramMediaId: r.instagramMediaId,
    mediaProductType: r.mediaProductType,
    mediaType: r.mediaType,
    permalink: r.permalink,
    thumbnailUrl: r.thumbnailUrl,
    publishedAt: r.publishedAt.toISOString(),
    views: r.views,
    reach: r.reach,
    likes: r.likes,
    comments: r.comments,
    categoryName: categoryName(r),
  };
}

function bestBy(rows: MediaRow[]): MediaRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.views - a.views || b.reach - a.reach)[0];
}

async function getReport(orgId: string, range: RangeInput): Promise<Report> {
  const account = await prisma.instagramAccount.findUnique({ where: { organizationId: orgId } });

  const empty: Report = {
    status: "not_connected",
    label: range.label,
    posts: 0,
    metrics: [],
    followers: null,
    followersComparable: false,
    best: null,
    bestReel: null,
    bestImage: null,
    bestCategory: null,
    reelsVsImages: null,
    reachSeries: [],
    sentences: [],
  };

  if (!account || !account.insightsSyncedAt || account.insightsError === "reconnect") {
    return empty;
  }

  const [cur, prev, days] = await Promise.all([
    loadMedia(orgId, range.from, range.to),
    loadMedia(orgId, range.prevFrom, range.prevTo),
    prisma.accountInsightDay.findMany({
      where: { organizationId: orgId, date: { gte: range.from, lte: range.to } },
      orderBy: { date: "asc" },
    }),
  ]);
  const prevDays = await prisma.accountInsightDay.findMany({
    where: { organizationId: orgId, date: { gte: range.prevFrom, lte: range.prevTo } },
  });

  if (cur.length === 0 && days.length === 0) {
    return { ...empty, status: "no_data" };
  }

  const comparable = cur.length > 0 && prev.length > 0;
  const followerRows = days.filter((d) => d.followerDelta !== 0 || d.followersTotal != null);
  const followers = followerRows.length > 0 ? days.reduce((a, d) => a + d.followerDelta, 0) : null;
  const prevFollowers = prevDays.length > 0 ? prevDays.reduce((a, d) => a + d.followerDelta, 0) : null;

  const metricDefs: { key: keyof MediaRow; label: string }[] = [
    { key: "views", label: "Visualizações" },
    { key: "reach", label: "Alcance" },
    { key: "likes", label: "Curtidas" },
    { key: "comments", label: "Comentários" },
    { key: "shares", label: "Compart." },
    { key: "saved", label: "Salvos" },
  ];

  const metrics: MetricDelta[] = [
    {
      key: "posts",
      label: "Publicações",
      value: cur.length,
      deltaPct: comparable ? pct(cur.length, prev.length) : null,
    },
    ...metricDefs.map((m) => ({
      key: String(m.key),
      label: m.label,
      value: sum(cur, m.key),
      deltaPct: comparable ? pct(sum(cur, m.key), sum(prev, m.key)) : null,
    })),
    {
      key: "followers",
      label: "Novos seguidores",
      value: followers ?? 0,
      deltaPct:
        followers != null && prevFollowers != null ? pct(followers, prevFollowers) : null,
    },
  ];

  const reels = cur.filter((r) => r.mediaProductType === "REELS");
  const images = cur.filter((r) => r.mediaProductType !== "REELS" && r.mediaType === "IMAGE");

  const bestReelRow = reels.length >= 2 ? bestBy(reels) : null;
  const bestImageRow = images.length >= 2 ? bestBy(images) : null;

  // melhor categoria: média de views, precisa de ≥2 categorias com ≥2 posts
  const byCat = new Map<string, { views: number; n: number }>();
  for (const r of cur) {
    const c = categoryName(r);
    if (!c) continue;
    const e = byCat.get(c) ?? { views: 0, n: 0 };
    e.views += r.views;
    e.n += 1;
    byCat.set(c, e);
  }
  const catRanked = [...byCat.entries()]
    .filter(([, e]) => e.n >= 2)
    .map(([name, e]) => ({ name, avgViews: e.views / e.n, posts: e.n }))
    .sort((a, b) => b.avgViews - a.avgViews);
  const bestCategory = catRanked.length >= 2 ? catRanked[0] : null;

  const reelsVsImages =
    reels.length >= 2 && images.length >= 2
      ? {
          reelsAvgReach: reels.reduce((a, r) => a + r.reach, 0) / reels.length,
          imagesAvgReach: images.reduce((a, r) => a + r.reach, 0) / images.length,
        }
      : null;

  // série de alcance por dia (preenche zeros)
  const reachMap = new Map(days.map((d) => [ymd(d.date), d.reach]));
  const reachSeries: { date: string; reach: number }[] = [];
  for (let t = range.from.getTime(); t <= range.to.getTime(); t += DAY) {
    const key = ymd(new Date(t));
    reachSeries.push({ date: key, reach: reachMap.get(key) ?? 0 });
  }

  const sentences: string[] = [];
  if (comparable) {
    const reachDelta = pct(sum(cur, "reach"), sum(prev, "reach"));
    if (reachDelta != null && Math.abs(reachDelta) >= 0.05) {
      sentences.push(
        `Seu alcance ${reachDelta > 0 ? "subiu" : "caiu"} ${Math.abs(Math.round(reachDelta * 100))}% em relação ao período anterior.`,
      );
    }
  }
  if (reelsVsImages) {
    const { reelsAvgReach, imagesAvgReach } = reelsVsImages;
    if (reelsAvgReach > imagesAvgReach * 1.15) {
      sentences.push("Seus Reels tiveram mais alcance médio que suas imagens.");
    } else if (imagesAvgReach > reelsAvgReach * 1.15) {
      sentences.push("Suas imagens tiveram mais alcance médio que seus Reels.");
    }
  }
  if (bestCategory) {
    sentences.push(`A categoria "${bestCategory.name}" foi a que mais gerou visualizações.`);
  }

  return {
    status: "ok",
    label: range.label,
    posts: cur.length,
    metrics,
    followers,
    followersComparable: followers != null,
    best: bestBy(cur) ? toBest(bestBy(cur)!) : null,
    bestReel: bestReelRow ? toBest(bestReelRow) : null,
    bestImage: bestImageRow ? toBest(bestImageRow) : null,
    bestCategory,
    reelsVsImages,
    reachSeries,
    sentences,
  };
}
