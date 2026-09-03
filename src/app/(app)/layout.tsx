import { requireUser, getOptionalOrgContext } from "@/lib/auth";
import { Sidebar } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const ctx = await getOptionalOrgContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        orgName={ctx?.org.name ?? "Configurar empresa"}
        paused={ctx?.org.autoPublishStatus === "PAUSED"}
      />
      <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
