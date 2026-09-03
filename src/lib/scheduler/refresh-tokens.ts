import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";
import { InstagramService } from "@/lib/instagram/service";
import { isAuthError } from "@/lib/instagram/errors";

const log = childLogger({ mod: "scheduler/refresh-tokens" });

const REFRESH_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000; // faltando <15 dias
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

export async function runRefreshTokens(now = new Date()): Promise<{ checked: number; refreshed: number; expired: number }> {
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      status: "CONNECTED",
      tokenExpiresAt: { lt: new Date(now.getTime() + REFRESH_WHEN_LEFT_MS) },
      lastRefreshedAt: { lt: new Date(now.getTime() - MIN_AGE_MS) },
    },
  });

  let refreshed = 0;
  let expired = 0;

  for (const account of accounts) {
    try {
      const { accessToken, expiresAt } = await InstagramService.refreshLongLivedToken(
        decrypt(account.accessTokenCipher),
      );
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessTokenCipher: encrypt(accessToken),
          tokenExpiresAt: expiresAt,
          lastRefreshedAt: new Date(),
        },
      });
      refreshed++;
    } catch (err) {
      if (isAuthError(err)) {
        await prisma.instagramAccount.update({ where: { id: account.id }, data: { status: "EXPIRED" } });
        expired++;
      }
      log.warn({ accountId: account.id, err }, "falha ao renovar token");
    }
  }

  const result = { checked: accounts.length, refreshed, expired };
  log.info(result, "refresh de tokens concluído");
  return result;
}
