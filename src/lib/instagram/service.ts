import { env } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { InstagramApiError } from "./errors";

/**
 * InstagramService — ÚNICO ponto de contato com a API da Meta.
 * Fluxo: "Instagram API with Instagram Login" (OAuth em instagram.com).
 * Nenhuma outra parte do código deve chamar graph.instagram.com diretamente.
 */

const OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const API_VERSION = "v23.0";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

const log = childLogger({ mod: "InstagramService" });

export type OAuthTokenResult = {
  accessToken: string;
  igUserId: string;
  expiresAt: Date;
};

export type InstagramAccountInfo = {
  igUserId: string;
  username: string;
  accountType: string | null;
  profilePictureUrl: string | null;
};

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

async function parseMetaResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const errObj = (body as { error?: Record<string, unknown> } | null)?.error ?? {};
    throw new InstagramApiError(
      String(errObj.message ?? `Erro Meta HTTP ${res.status}`),
      {
        status: res.status,
        metaCode: typeof errObj.code === "number" ? errObj.code : undefined,
        metaSubcode: typeof errObj.error_subcode === "number" ? errObj.error_subcode : undefined,
        fbtraceId: typeof errObj.fbtrace_id === "string" ? errObj.fbtrace_id : undefined,
        raw: body,
      },
    );
  }
  return body;
}

export const InstagramService = {
  /** URL para iniciar o OAuth. `state` protege contra CSRF. */
  getAuthUrl(state: string): string {
    const e = env();
    const params = new URLSearchParams({
      client_id: e.INSTAGRAM_APP_ID,
      redirect_uri: e.INSTAGRAM_REDIRECT_URI,
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  /** Troca o `code` do callback por um token de longa duração (60 dias). */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
    const e = env();
    const form = new URLSearchParams({
      client_id: e.INSTAGRAM_APP_ID,
      client_secret: e.INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: e.INSTAGRAM_REDIRECT_URI,
      code,
    });
    const shortRes = (await parseMetaResponse(
      await fetch(OAUTH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }),
    )) as { access_token: string; user_id: number | string };

    const longUrl = new URL(`${GRAPH}/access_token`);
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", e.INSTAGRAM_APP_SECRET);
    longUrl.searchParams.set("access_token", shortRes.access_token);
    const longRes = (await parseMetaResponse(await fetch(longUrl))) as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: longRes.access_token,
      igUserId: String(shortRes.user_id),
      expiresAt: new Date(Date.now() + longRes.expires_in * 1000),
    };
  },

  /** Renova um token de longa duração. Só funciona se ele tiver >24h e <60 dias. */
  async refreshLongLivedToken(currentToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const url = new URL(`${GRAPH}/refresh_access_token`);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", currentToken);
    const res = (await parseMetaResponse(await fetch(url))) as {
      access_token: string;
      expires_in: number;
    };
    return {
      accessToken: res.access_token,
      expiresAt: new Date(Date.now() + res.expires_in * 1000),
    };
  },

  async getAccountInfo(accessToken: string): Promise<InstagramAccountInfo> {
    const url = new URL(`${GRAPH}/${API_VERSION}/me`);
    url.searchParams.set("fields", "user_id,username,account_type,profile_picture_url");
    url.searchParams.set("access_token", accessToken);
    const res = (await parseMetaResponse(await fetch(url))) as {
      user_id: string;
      username: string;
      account_type?: string;
      profile_picture_url?: string;
    };
    return {
      igUserId: res.user_id,
      username: res.username,
      accountType: res.account_type ?? null,
      profilePictureUrl: res.profile_picture_url ?? null,
    };
  },

  /** Cria um container de imagem (feed). Retorna o creation_id. */
  async createImageContainer(input: {
    accessToken: string;
    igUserId: string;
    imageUrl: string;
    caption?: string;
  }): Promise<string> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${input.igUserId}/media`);
    const body = new URLSearchParams({
      image_url: input.imageUrl,
      access_token: input.accessToken,
    });
    if (input.caption) body.set("caption", input.caption);
    const res = (await parseMetaResponse(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as { id: string };
    log.info({ containerId: res.id }, "container de imagem criado");
    return res.id;
  },

  /** Cria um container de Reel. Retorna o creation_id. */
  async createReelContainer(input: {
    accessToken: string;
    igUserId: string;
    videoUrl: string;
    caption?: string;
  }): Promise<string> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${input.igUserId}/media`);
    const body = new URLSearchParams({
      media_type: "REELS",
      video_url: input.videoUrl,
      access_token: input.accessToken,
    });
    if (input.caption) body.set("caption", input.caption);
    const res = (await parseMetaResponse(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as { id: string };
    log.info({ containerId: res.id }, "container de reel criado");
    return res.id;
  },

  async getContainerStatus(
    accessToken: string,
    containerId: string,
  ): Promise<{ status: ContainerStatus; detail?: string }> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${containerId}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", accessToken);
    const res = (await parseMetaResponse(await fetch(url))) as {
      status_code: ContainerStatus;
      status?: string;
    };
    return { status: res.status_code, detail: res.status };
  },

  /** Publica um container pronto. Retorna o instagramMediaId. */
  async publishContainer(accessToken: string, igUserId: string, creationId: string): Promise<string> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${igUserId}/media_publish`);
    const body = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
    const res = (await parseMetaResponse(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as { id: string };
    log.info({ mediaId: res.id }, "publicado");
    return res.id;
  },

  async getPublishingLimit(
    accessToken: string,
    igUserId: string,
  ): Promise<{ quotaUsage: number; quotaTotal: number }> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${igUserId}/content_publishing_limit`);
    url.searchParams.set("fields", "quota_usage,config");
    url.searchParams.set("access_token", accessToken);
    const res = (await parseMetaResponse(await fetch(url))) as {
      data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>;
    };
    const row = res.data?.[0];
    return { quotaUsage: row?.quota_usage ?? 0, quotaTotal: row?.config?.quota_total ?? 100 };
  },

  // ─────────────── Insights (área Desempenho) ───────────────

  /** Campos básicos de uma mídia (não exige escopo de insights). */
  async getMediaFields(accessToken: string, mediaId: string) {
    const url = new URL(`${GRAPH}/${API_VERSION}/${mediaId}`);
    url.searchParams.set(
      "fields",
      "id,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count,caption",
    );
    url.searchParams.set("access_token", accessToken);
    return (await parseMetaResponse(await fetch(url))) as {
      id: string;
      media_type: string;
      media_product_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    };
  },

  /** Insights de uma mídia. Métricas indisponíveis para o tipo são simplesmente omitidas. */
  async getMediaInsights(
    accessToken: string,
    mediaId: string,
    metrics: string[],
  ): Promise<Record<string, number>> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${mediaId}/insights`);
    url.searchParams.set("metric", metrics.join(","));
    url.searchParams.set("access_token", accessToken);
    try {
      const res = (await parseMetaResponse(await fetch(url))) as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
      };
      const out: Record<string, number> = {};
      for (const d of res.data ?? []) out[d.name] = d.values?.[0]?.value ?? 0;
      return out;
    } catch {
      // Alguns tipos de mídia recusam certas métricas — tenta uma por uma.
      const out: Record<string, number> = {};
      for (const m of metrics) {
        try {
          const u = new URL(`${GRAPH}/${API_VERSION}/${mediaId}/insights`);
          u.searchParams.set("metric", m);
          u.searchParams.set("access_token", accessToken);
          const r = (await parseMetaResponse(await fetch(u))) as {
            data?: Array<{ name: string; values?: Array<{ value: number }> }>;
          };
          if (r.data?.[0]) out[m] = r.data[0].values?.[0]?.value ?? 0;
        } catch {
          /* métrica indisponível — ignora */
        }
      }
      return out;
    }
  },

  /**
   * Insights diários da conta para [since, until] (Date). Retorna um mapa
   * metric -> (yyyy-mm-dd -> valor).
   */
  async getAccountInsights(
    accessToken: string,
    igUserId: string,
    metrics: string[],
    since: Date,
    until: Date,
  ): Promise<Record<string, Record<string, number>>> {
    const url = new URL(`${GRAPH}/${API_VERSION}/${igUserId}/insights`);
    url.searchParams.set("metric", metrics.join(","));
    url.searchParams.set("period", "day");
    url.searchParams.set("metric_type", "total_value");
    url.searchParams.set("since", String(Math.floor(since.getTime() / 1000)));
    url.searchParams.set("until", String(Math.floor(until.getTime() / 1000)));
    url.searchParams.set("access_token", accessToken);
    const res = (await parseMetaResponse(await fetch(url))) as {
      data?: Array<{
        name: string;
        values?: Array<{ value: number; end_time?: string }>;
        total_value?: { value: number };
      }>;
    };
    const untilDay = until.toISOString().slice(0, 10);
    const out: Record<string, Record<string, number>> = {};
    for (const d of res.data ?? []) {
      out[d.name] = {};
      const vals = d.values ?? [];
      if (vals.length > 0) {
        for (const v of vals) {
          const day = (v.end_time ?? "").slice(0, 10);
          if (day) out[d.name][day] = v.value ?? 0;
        }
      } else if (d.total_value) {
        // API retornou só o agregado do período — atribui ao último dia.
        out[d.name][untilDay] = d.total_value.value ?? 0;
      }
    }
    return out;
  },

  /** followers_count atual (campo do usuário). */
  async getFollowersCount(accessToken: string): Promise<number | null> {
    const url = new URL(`${GRAPH}/${API_VERSION}/me`);
    url.searchParams.set("fields", "followers_count");
    url.searchParams.set("access_token", accessToken);
    try {
      const res = (await parseMetaResponse(await fetch(url))) as { followers_count?: number };
      return res.followers_count ?? null;
    } catch {
      return null;
    }
  },
};
