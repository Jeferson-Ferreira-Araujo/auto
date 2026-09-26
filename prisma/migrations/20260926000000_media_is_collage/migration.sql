ALTER TABLE "media_assets" ADD COLUMN "isCollage" BOOLEAN NOT NULL DEFAULT false;

-- Marca retroativamente as montagens já criadas antes deste campo existir.
UPDATE "media_assets" SET "isCollage" = true WHERE name ILIKE 'Montagem — %';
