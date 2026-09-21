import { requireOrgOrOnboarding } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody } from "@/components/ui/primitives";
import { AutoPublishToggle } from "@/components/AutoPublishToggle";
import { whatsappConfigured, whatsappTestNumber } from "@/lib/whatsapp/service";
import { SettingsForm } from "./SettingsForm";
import { WhatsAppCard, type WhatsAppState } from "./WhatsAppCard";
import { LogoUpload } from "./LogoUpload";
import { WatermarkUpload } from "./WatermarkUpload";
import { AutoMusicCard } from "./AutoMusicCard";
import { InstagramPanel } from "./InstagramPanel";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { isFeatureEnabled } from "@/lib/features";

const ROLE_LABEL: Record<string, string> = { OWNER: "Dono", ADMIN: "Administrador", MEMBER: "Membro" };

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; conectado?: string; erro?: string }>;
}) {
  const { org, user } = await requireOrgOrOnboarding();
  const sp = await searchParams;

  const [members, mediaCount, whatsappEnabled, musicEnabled, waContactRow, instagramAccount] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mediaAsset.count({ where: { organizationId: org.id } }),
    isFeatureEnabled("marketing_whatsapp"),
    isFeatureEnabled("marketing_video_music"),
    // Sempre busca (é barato) — decide se usa depois de saber se a funcionalidade está ligada.
    // Assim não precisa esperar `whatsappEnabled` resolver antes de disparar esta query.
    prisma.whatsAppContact.findFirst({ where: { organizationId: org.id } }),
    prisma.instagramAccount.findUnique({ where: { organizationId: org.id } }),
  ]);

  const configured = whatsappEnabled && whatsappConfigured();
  const waContact = configured ? waContactRow : null;
  const whatsappState: WhatsAppState = {
    configured,
    testNumber: configured ? whatsappTestNumber() : null,
    contact: waContact
      ? {
          phoneE164: waContact.phoneE164,
          verified: Boolean(waContact.verifiedAt),
          verifiedAt: waContact.verifiedAt?.toISOString() ?? null,
          code:
            !waContact.verifiedAt &&
            waContact.verificationExpiresAt &&
            waContact.verificationExpiresAt > new Date()
              ? waContact.verificationCode
              : null,
        }
      : null,
  };

  return (
    <>
      <PageHeader title="Configurações" description="Preferências da empresa." />

      <div className="space-y-6">
        <div id="instagram" className="scroll-mt-20">
          <InstagramPanel account={instagramAccount} sp={sp} />
        </div>

        <AutoPublishToggle status={org.autoPublishStatus} />

        <SettingsForm name={org.name} uploadLimitMb={org.uploadLimitMb} />

        <LogoUpload hasLogo={Boolean(org.logoStorageKey)} />

        <WatermarkUpload hasWatermark={Boolean(org.watermarkStorageKey)} />

        {musicEnabled && <AutoMusicCard currentTrackId={org.autoMusicTrackId} />}

        {whatsappEnabled && <WhatsAppCard state={whatsappState} />}

        <Card>
          <CardBody>
            <h3 className="mb-1 font-medium">Uso</h3>
            <p className="text-sm text-[var(--color-muted)]">
              {mediaCount} de {org.mediaLimit} mídias · Fuso horário {org.timezone}
            </p>
          </CardBody>
        </Card>

        <ChangePasswordCard userEmail={user.email} />

        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium">Membros</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span>
                    {m.user.name ?? m.user.email}
                    {m.userId === user.id && <span className="text-[var(--color-muted)]"> (você)</span>}
                  </span>
                  <Badge>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Convidar mais usuários para a mesma empresa estará disponível em breve.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
