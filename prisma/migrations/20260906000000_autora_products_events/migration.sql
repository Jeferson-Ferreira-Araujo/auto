-- AUTORA: módulo Produtos (validades) + eventos entre módulos + motor de automação
-- + AuthorizedWhatsAppUser (papel/permissões no WhatsAppContact).

-- Enums
CREATE TYPE "ExpirationOutcome" AS ENUM ('PENDING', 'SOLD', 'DISCARDED', 'PRICED_DOWN');
CREATE TYPE "DomainEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE "WhatsAppRole" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- Organization: limites de validade configuráveis
ALTER TABLE "organizations"
  ADD COLUMN "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "expiryUrgentDays"  INTEGER NOT NULL DEFAULT 7;

-- WhatsAppContact: AuthorizedWhatsAppUser
ALTER TABLE "whatsapp_contacts"
  ADD COLUMN "role"        "WhatsAppRole" NOT NULL DEFAULT 'OWNER',
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "active"      BOOLEAN NOT NULL DEFAULT true;

-- products
CREATE TABLE "products" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "barcode"        TEXT,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdById"    UUID NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_organizationId_barcode_key" ON "products" ("organizationId", "barcode");
CREATE INDEX "products_organizationId_active_idx" ON "products" ("organizationId", "active");
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- product_expirations
CREATE TABLE "product_expirations" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "quantity"       INTEGER NOT NULL,
  "expirationDate" DATE NOT NULL,
  "lot"            TEXT,
  "location"       TEXT,
  "outcome"        "ExpirationOutcome" NOT NULL DEFAULT 'PENDING',
  "resolvedAt"     TIMESTAMP(3),
  "createdById"    UUID NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_expirations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "product_expirations_organizationId_expirationDate_idx" ON "product_expirations" ("organizationId", "expirationDate");
CREATE INDEX "product_expirations_organizationId_outcome_expirationDate_idx" ON "product_expirations" ("organizationId", "outcome", "expirationDate");
ALTER TABLE "product_expirations" ADD CONSTRAINT "product_expirations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_expirations" ADD CONSTRAINT "product_expirations_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_expirations" ADD CONSTRAINT "product_expirations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- domain_events (outbox)
CREATE TABLE "domain_events" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "payload"        JSONB NOT NULL,
  "status"         "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "error"          TEXT,
  "dedupeKey"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"    TIMESTAMP(3),
  CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "domain_events_dedupeKey_key" ON "domain_events" ("dedupeKey");
CREATE INDEX "domain_events_status_createdAt_idx" ON "domain_events" ("status", "createdAt");
CREATE INDEX "domain_events_organizationId_type_createdAt_idx" ON "domain_events" ("organizationId", "type", "createdAt");
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_rules (esqueleto do motor de automação)
CREATE TABLE "automation_rules" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "trigger"        TEXT NOT NULL,
  "conditions"     JSONB NOT NULL DEFAULT '[]',
  "actions"        JSONB NOT NULL DEFAULT '[]',
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_rules_organizationId_trigger_active_idx" ON "automation_rules" ("organizationId", "trigger", "active");
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth (segue o padrão de supabase/migrations/0001): a app só acessa via Prisma (role postgres).
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_expirations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "products", "product_expirations", "domain_events", "automation_rules" FROM anon, authenticated;
