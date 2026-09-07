CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'AMOUNT');

ALTER TABLE "delivery_orders" ADD COLUMN "couponCode" TEXT;

CREATE TABLE "coupons" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "kind" "CouponKind" NOT NULL,
  "value" INTEGER NOT NULL,
  "minOrderCents" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "timesSent" INTEGER NOT NULL DEFAULT 0,
  "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupons_organizationId_code_key" ON "coupons"("organizationId", "code");
CREATE INDEX "coupons_organizationId_active_expiresAt_idx" ON "coupons"("organizationId", "active", "expiresAt");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "coupons" FROM anon, authenticated;
