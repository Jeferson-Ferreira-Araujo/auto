CREATE TABLE "whatsapp_contacts" (
  "id" TEXT NOT NULL, "phoneE164" TEXT NOT NULL, "userId" UUID NOT NULL, "organizationId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3), "verificationCode" TEXT, "verificationExpiresAt" TIMESTAMP(3), "lastInboundAt" TIMESTAMP(3),
  "pendingAction" JSONB, "pendingExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_contacts_phoneE164_key" ON "whatsapp_contacts"("phoneE164");
CREATE INDEX "whatsapp_contacts_organizationId_idx" ON "whatsapp_contacts"("organizationId");
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "whatsapp_events" (
  "id" TEXT NOT NULL, "wamid" TEXT NOT NULL, "direction" TEXT NOT NULL, "phoneE164" TEXT NOT NULL,
  "organizationId" TEXT, "messageType" TEXT, "bodyPreview" TEXT, "parsed" JSONB, "status" TEXT NOT NULL,
  "responseText" TEXT, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_events_wamid_key" ON "whatsapp_events"("wamid");
CREATE INDEX "whatsapp_events_phoneE164_createdAt_idx" ON "whatsapp_events"("phoneE164", "createdAt");
CREATE INDEX "whatsapp_events_organizationId_createdAt_idx" ON "whatsapp_events"("organizationId", "createdAt");
