-- Interruptor de divulgação por WhatsApp (por organização).
ALTER TABLE "organizations" ADD COLUMN "whatsappOutreachEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Saúde do número do WhatsApp (nota de qualidade + limite de mensagens). Singleton.
CREATE TABLE "whatsapp_health" (
  "id" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "qualityRating" TEXT,
  "messagingLimitTier" TEXT,
  "nameStatus" TEXT,
  "lastEvent" TEXT,
  "lastEventAt" TIMESTAMP(3),
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_health_pkey" PRIMARY KEY ("id")
);

-- Defense-in-depth: fora do alcance de anon/authenticated via PostgREST.
ALTER TABLE "whatsapp_health" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "whatsapp_health" FROM anon, authenticated;
