import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { InstagramService } from "@/lib/instagram/service";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "instapub_ig_oauth";

export async function GET(_req: NextRequest) {
  try {
    await requireOrgContext(); // garante sessão + empresa
    const state = randomBytes(16).toString("hex");
    const authUrl = InstagramService.getAuthUrl(state);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
