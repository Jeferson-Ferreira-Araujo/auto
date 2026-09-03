import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Troca o `code` do e-mail de confirmação / magic link por uma sessão. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${publicEnv.appUrl}${next}`);
  }
  return NextResponse.redirect(`${publicEnv.appUrl}/login?erro=auth`);
}
