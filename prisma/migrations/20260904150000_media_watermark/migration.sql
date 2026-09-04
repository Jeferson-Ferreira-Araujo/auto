-- ALTER TYPE ... ADD VALUE não pode rodar em transação; fica isolado.
ALTER TYPE "VideoJobKind" ADD VALUE IF NOT EXISTS 'WATERMARK';

CREATE TYPE "WatermarkSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');
CREATE TYPE "WatermarkPosition" AS ENUM (
  'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT',
  'MIDDLE_LEFT', 'CENTER', 'MIDDLE_RIGHT',
  'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'
);

ALTER TABLE "organizations" ADD COLUMN "watermarkStorageKey" TEXT;

ALTER TABLE "media_assets"
  ADD COLUMN "watermarkEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "watermarkPosition" "WatermarkPosition" NOT NULL DEFAULT 'BOTTOM_RIGHT',
  ADD COLUMN "watermarkSize" "WatermarkSize" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "watermarkOpacity" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "watermarkedStorageKey" TEXT;
