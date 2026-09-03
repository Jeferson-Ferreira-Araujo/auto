import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Organization, OrganizationMember } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, forbidden, unauthenticated } from "@/lib/errors";

export const ACTIVE_ORG_COOKIE = "instapub_org";

export type SessionUser = { id: string; email: string; name: string | null };

/**
 * Retorna o usuário autenticado e garante que exista uma linha em `users`
 * (espelho de auth.users). Lança se não houver sessão.
 */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) throw unauthenticated();

  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      name: (user.user_metadata?.name as string | undefined) ?? null,
    },
    update: { email: user.email },
    select: { id: true, email: true, name: true },
  });

  return dbUser;
}

/** Como requireUser, mas retorna null em vez de lançar. */
export async function getOptionalUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

export type OrgContext = {
  user: SessionUser;
  org: Organization;
  membership: OrganizationMember;
};

/**
 * Resolve a organização ativa do usuário:
 *  1. cookie `instapub_org` (validado contra membership)
 *  2. primeira organização da qual o usuário é membro
 * Lança FORBIDDEN se o usuário não pertence a nenhuma organização.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const user = await requireUser();

  const cookieStore = await cookies();
  const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    throw new AppError("FORBIDDEN", "Você ainda não tem uma empresa. Complete o cadastro.");
  }

  const chosen =
    memberships.find((m) => m.organizationId === preferredOrgId) ?? memberships[0];

  return { user, org: chosen.organization, membership: chosen };
}

/** Como requireOrgContext, mas retorna null se o usuário ainda não tem empresa. */
export async function getOptionalOrgContext(): Promise<OrgContext | null> {
  try {
    return await requireOrgContext();
  } catch (err) {
    if (err instanceof AppError && err.code === "FORBIDDEN") return null;
    throw err;
  }
}

/**
 * Para páginas internas: exige empresa; se não houver, manda para o /dashboard
 * (que mostra o fluxo de primeiros passos).
 */
export async function requireOrgOrOnboarding(): Promise<OrgContext> {
  const ctx = await getOptionalOrgContext();
  if (!ctx) redirect("/dashboard");
  return ctx;
}

/** Verifica que o usuário logado pertence à organização informada. */
export async function requireOrgAccess(organizationId: string): Promise<OrgContext> {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    include: { organization: true },
  });
  if (!membership) throw forbidden();
  return { user, org: membership.organization, membership };
}

/** True se o usuário tem alguma organização (usado no gate de onboarding). */
export async function userHasOrganization(userId: string): Promise<boolean> {
  const count = await prisma.organizationMember.count({ where: { userId } });
  return count > 0;
}
