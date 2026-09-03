import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para uso em Server Components / Route Handlers / Server Actions.
 * Lê e escreve a sessão do usuário via cookies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component — o middleware cuida da renovação do cookie.
        }
      },
    },
  });
}
