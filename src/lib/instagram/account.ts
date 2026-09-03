import type { InstagramAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";
import { InstagramService } from "./service";
import { isAuthError } from "./errors";

const log = childLogger({ mod: "instagram/account" });

const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000; // renova se faltar <10 dias
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // Meta exige token com >24h para renovar

/**
 * Retorna um access token válido em texto puro (SOMENTE no servidor).
 * Renova de forma transparente quando está perto de expirar.
 */
export async function getValidAccessToken(account: InstagramAccount): Promise<string> {
  let token = decrypt(account.accessTokenCipher);

  const needsRefresh =
    account.tokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS &&
    Date.now() - account.lastRefreshedAt.getTime() > MIN_AGE_MS;

  if (needsRefresh) {
    try {
      const refreshed = await InstagramService.refreshLongLivedToken(token);
      token = refreshed.accessToken;
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessTokenCipher: encrypt(refreshed.accessToken),
          tokenExpiresAt: refreshed.expiresAt,
          lastRefreshedAt: new Date(),
          status: "CONNECTED",
        },
      });
      log.info({ accountId: account.id }, "token renovado");
    } catch (err) {
      if (isAuthError(err)) {
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { status: "EXPIRED" },
        });
      }
      log.warn({ accountId: account.id, err }, "falha ao renovar token");
    }
  }

  return token;
}

/** Marca a conta como expirada (chamado quando uma publicação falha por auth). */
export async function markAccountExpired(accountId: string): Promise<void> {
  await prisma.instagramAccount.update({ where: { id: accountId }, data: { status: "EXPIRED" } });
}
