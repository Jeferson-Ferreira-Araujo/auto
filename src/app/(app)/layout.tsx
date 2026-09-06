import { requireUser, getOptionalOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "./nav";
import { Topbar } from "./Topbar";
import { AccountSuspended, OrgSuspended } from "./Suspended";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  if (user.blockedAt) return <AccountSuspended />;

  const ctx = await getOptionalOrgContext();

  // Superadmin pode acessar o painel do sistema mesmo com a própria empresa suspensa.
  if (ctx?.org.blockedAt && !user.isSuperAdmin) {
    return <OrgSuspended orgName={ctx.org.name} />;
  }

  const instagram = ctx
    ? await prisma.instagramAccount.findUnique({
        where: { organizationId: ctx.org.id },
        select: { username: true },
      })
    : null;

  const userName = user.name?.trim() || user.email.split("@")[0];
  const userRole = ctx ? (ROLE_LABEL[ctx.membership.role] ?? "Membro") : "";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        orgName={ctx?.org.name ?? "Configurar empresa"}
        orgHandle={instagram?.username ?? null}
        paused={ctx?.org.autoPublishStatus === "PAUSED"}
        isSuperAdmin={user.isSuperAdmin}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={userName} userRole={userRole} />
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
