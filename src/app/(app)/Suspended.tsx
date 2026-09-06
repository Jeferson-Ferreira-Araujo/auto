import { signOut } from "@/app/session-actions";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-md rounded-[var(--radius)] border bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <div className="mb-3 text-4xl">🔒</div>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{children}</p>
        <form action={signOut} className="mt-5">
          <button className="rounded-[var(--radius)] border px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg)]">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

export function AccountSuspended() {
  return (
    <Shell title="Conta suspensa">
      Seu acesso à AUTORA foi suspenso. Entre em contato com o suporte para regularizar a situação.
    </Shell>
  );
}

export function OrgSuspended({ orgName }: { orgName: string }) {
  return (
    <Shell title="Empresa suspensa">
      A empresa <strong>{orgName}</strong> está suspensa. As publicações automáticas estão pausadas e não
      é possível fazer alterações. Fale com o suporte da AUTORA.
    </Shell>
  );
}
