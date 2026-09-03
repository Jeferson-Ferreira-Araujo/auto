import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";
import { publicEnv } from "@/lib/env";
import { InstagramService } from "@/lib/instagram/service";
import { IG_STATE_COOKIE as STATE_COOKIE } from "@/app/(app)/instagram/constants";

export const dynamic = "force-dynamic";

const log = childLogger({ mod: "instagram/callback" });

function redirectTo(path: string) {
  return NextResponse.redirect(`${publicEnv.appUrl}${path}`);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const savedState = req.cookies.get(STATE_COOKIE)?.value;

  if (error) {
    log.warn({ error, desc: url.searchParams.get("error_description") }, "usuário negou ou erro no OAuth");
    return redirectTo("/instagram?erro=negado");
  }
  if (!code || !state || !savedState || state !== savedState) {
    return redirectTo("/instagram?erro=state");
  }

  try {
    const { org, user } = await requireOrgContext();
    const token = await InstagramService.exchangeCodeForToken(code);
    const info = await InstagramService.getAccountInfo(token.accessToken);

    await prisma.instagramAccount.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        igUserId: info.igUserId,
        username: info.username,
        accountType: info.accountType,
        profilePictureUrl: info.profilePictureUrl,
        accessTokenCipher: encrypt(token.accessToken),
        tokenExpiresAt: token.expiresAt,
        lastRefreshedAt: new Date(),
        status: "CONNECTED",
        connectedByUserId: user.id,
      },
      update: {
        igUserId: info.igUserId,
        username: info.username,
        accountType: info.accountType,
        profilePictureUrl: info.profilePictureUrl,
        accessTokenCipher: encrypt(token.accessToken),
        tokenExpiresAt: token.expiresAt,
        lastRefreshedAt: new Date(),
        status: "CONNECTED",
        connectedByUserId: user.id,
      },
    });

    const res = redirectTo("/instagram?conectado=1");
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    log.error({ err }, "falha ao conectar Instagram");
    return redirectTo("/instagram?erro=falha");
  }
}
