import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { formatDateTime, daysUntil } from "@/lib/display";
import { DisconnectButton } from "./DisconnectButton";
import { startInstagramConnect } from "./actions";

function ConnectButton({ label }: { label: string }) {
  return (
    <form action={startInstagramConnect}>
      <button className="inline-flex h-10 items-center rounded-[var(--radius)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
        {label}
      </button>
    </form>
  );
}

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  negado: "Você cancelou a conexão com o Instagram.",
  state: "A sessão de conexão expirou. Tente novamente.",
  falha: "Não foi possível concluir a conexão. Verifique se a conta é profissional (Comercial ou Criador de Conteúdo).",
};

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string }>;
}) {
  const { org } = await requireOrgOrOnboarding();
  const sp = await searchParams;
  const account = await prisma.instagramAccount.findUnique({ where: { organizationId: org.id } });

  const daysLeft = account ? daysUntil(account.tokenExpiresAt) : 0;

  return (
    <>
      <PageHeader title="Instagram" description="Conecte a conta profissional que vai receber as publicações." />

      {sp.conectado && (
        <div className="mb-4 rounded-[var(--radius)] border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Instagram conectado com sucesso.
        </div>
      )}
      {sp.erro && (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {ERROS[sp.erro] ?? "Ocorreu um erro."}
        </div>
      )}

      {!account ? (
        <EmptyState
          title="Nenhuma conta conectada"
          description="Você precisa de uma conta profissional do Instagram (Comercial ou Criador de Conteúdo)."
          action={<ConnectButton label="Conectar Instagram" />}
        />
      ) : (
        <Card>
          <CardBody>
            <div className="flex items-start gap-4">
              {account.profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.profilePictureUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg)]">◎</div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">@{account.username}</span>
                  {account.status === "CONNECTED" ? (
                    <Badge tone="success">Conectada</Badge>
                  ) : (
                    <Badge tone="danger">Reconexão necessária</Badge>
                  )}
                </div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">
                  {account.accountType ?? "Conta profissional"} · ID {account.igUserId}
                </div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">
                  Acesso válido até {formatDateTime(account.tokenExpiresAt)}{" "}
                  {account.status === "CONNECTED" && daysLeft <= 15 && (
                    <span className="text-amber-700">({daysLeft} dias — renovaremos automaticamente)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <ConnectButton label={account.status === "CONNECTED" ? "Reconectar" : "Reconectar agora"} />
              <DisconnectButton />
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
