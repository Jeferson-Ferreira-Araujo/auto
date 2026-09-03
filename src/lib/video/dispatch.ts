import { childLogger } from "@/lib/logger";

const log = childLogger({ mod: "video/dispatch" });

export function videoWorkerConfigured(): boolean {
  return Boolean(process.env.GITHUB_REPO && process.env.GITHUB_DISPATCH_TOKEN);
}

/**
 * Acorda o worker do GitHub Actions (repository_dispatch). É best-effort:
 * se falhar, o cron agendado do workflow pega o job alguns minutos depois.
 */
export async function dispatchWorker(): Promise<boolean> {
  if (!videoWorkerConfigured()) {
    log.warn("worker de vídeo não configurado (GITHUB_REPO/GITHUB_DISPATCH_TOKEN)");
    return false;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "video-enhance" }),
    });
    if (!res.ok) {
      log.error({ status: res.status, body: await res.text() }, "repository_dispatch falhou");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, "erro ao chamar repository_dispatch");
    return false;
  }
}
