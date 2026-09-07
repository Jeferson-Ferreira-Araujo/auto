ALTER TABLE "organizations" ADD COLUMN "whatsappPromoMessage" TEXT;

CREATE TABLE "whatsapp_customers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "name" TEXT,
  "promoConsent" BOOLEAN NOT NULL DEFAULT false,
  "promoConsentAt" TIMESTAMP(3),
  "promoConsentText" TEXT,
  "promoAskedAt" TIMESTAMP(3),
  "promoOptOutAt" TIMESTAMP(3),
  "lastOrderAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastPromoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_customers_organizationId_phoneE164_key" ON "whatsapp_customers"("organizationId", "phoneE164");
CREATE INDEX "whatsapp_customers_organizationId_promoConsent_lastOrderAt_idx" ON "whatsapp_customers"("organizationId", "promoConsent", "lastOrderAt");

CREATE TABLE "delivery_orders" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "valueCents" INTEGER,
  "note" TEXT,
  "registeredById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "delivery_orders_organizationId_createdAt_idx" ON "delivery_orders"("organizationId", "createdAt");

ALTER TABLE "whatsapp_customers" ADD CONSTRAINT "whatsapp_customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "whatsapp_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "whatsapp_customers" FROM anon, authenticated;
REVOKE ALL ON TABLE "delivery_orders" FROM anon, authenticated;
