import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${publicEnv.appUrl}/login`, { status: 303 });
}
