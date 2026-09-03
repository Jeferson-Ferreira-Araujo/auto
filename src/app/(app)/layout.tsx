import { redirect } from "next/navigation";
import { requireUser, requireOrgContext, userHasOrganization } from "@/lib/auth";
import { Sidebar } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!(await userHasOrganization(user.id))) redirect("/onboarding");

  const { org } = await requireOrgContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar orgName={org.name} paused={org.autoPublishStatus === "PAUSED"} />
      <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
