import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/recuperar-senha", "/nova-senha"];

/**
 * Limite de taxa por IP. Endpoints que já têm autenticação própria e são
 * chamados por terceiros (webhook da Meta com assinatura, cron com segredo)
 * ficam de fora.
 */
function checkRateLimit(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/whatsapp") || path.startsWith("/api/cron") || path.startsWith("/_next")) {
    return null;
  }

  const ip = clientIp(request.headers);
  const isAuth =
    path === "/login" ||
    path === "/signup" ||
    path === "/recuperar-senha" ||
    path === "/nova-senha" ||
    path.startsWith("/auth");
  const isApi = path.startsWith("/api");

  const rule = isAuth
    ? { key: `auth:${ip}`, limit: 20, windowMs: 5 * 60_000 }
    : isApi
      ? { key: `api:${ip}`, limit: 120, windowMs: 60_000 }
      : { key: `page:${ip}`, limit: 300, windowMs: 60_000 };

  const res = rateLimit(rule.key, rule.limit, rule.windowMs);
  if (res.ok) return null;

  return new NextResponse("Muitas requisições. Tente novamente em instantes.", {
    status: 429,
    headers: { "retry-after": String(res.retryAfter), "cache-control": "no-store" },
  });
}

/** Rotas consolidadas na reorganização modular (AUTORA). */
const MOVED: Record<string, string> = {
  "/categorias": "/biblioteca?view=categorias",
  "/instagram": "/configuracoes?view=instagram",
};

/** Renova a sessão, protege as rotas privadas e resolve a raiz "/". */
export async function updateSession(request: NextRequest) {
  const limited = checkRateLimit(request);
  if (limited) return limited;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Repassa a identidade já validada pros Server Components lerem via
  // headers() em vez de chamar getUser() de novo — evita uma 2ª ida à rede
  // pro Auth do Supabase em toda navegação (ver `requireUser()`). Setado
  // SEMPRE depois da validação acima, então nunca confia em header vindo
  // do próprio cliente (o valor dele é sobrescrito/removido aqui).
  const refreshedCookies = response.cookies.getAll();
  if (user) {
    request.headers.set("x-autora-uid", user.id);
    if (user.email) request.headers.set("x-autora-email", user.email);
    else request.headers.delete("x-autora-email");
  } else {
    request.headers.delete("x-autora-uid");
    request.headers.delete("x-autora-email");
  }
  response = NextResponse.next({ request });
  for (const cookie of refreshedCookies) response.cookies.set(cookie);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isApi = path.startsWith("/api");

  // Rotas antigas → novo lugar na estrutura modular.
  if (MOVED[path]) {
    const [pathname, query] = MOVED[path].split("?");
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    return NextResponse.redirect(url, 308);
  }

  // Raiz: manda para o painel (logado) ou login.
  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
