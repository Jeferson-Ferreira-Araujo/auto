CREATE TYPE "VideoPreset" AS ENUM ('NATURAL', 'DINAMICO', 'PROMOCAO', 'ELEGANTE');
CREATE TYPE "PublishVariant" AS ENUM ('ORIGINAL', 'ENHANCED');
CREATE TYPE "VideoJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE "media_assets" ADD COLUMN "enhancedStorageKey" TEXT, ADD COLUMN "enhancedThumbnailKey" TEXT, ADD COLUMN "enhancedDurationSec" DOUBLE PRECISION, ADD COLUMN "publishVariant" "PublishVariant" NOT NULL DEFAULT 'ORIGINAL', ADD COLUMN "activeVideoJobId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "logoStorageKey" TEXT;
ALTER TABLE "scheduled_posts" ADD COLUMN "reelAudioId" TEXT, ADD COLUMN "reelAudioName" TEXT;
CREATE TABLE "video_jobs" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "mediaAssetId" TEXT NOT NULL,
  "preset" "VideoPreset" NOT NULL, "autoMode" BOOLEAN NOT NULL DEFAULT false, "titleText" TEXT,
  "includeLogo" BOOLEAN NOT NULL DEFAULT false, "status" "VideoJobStatus" NOT NULL DEFAULT 'PENDING',
  "progress" INTEGER NOT NULL DEFAULT 0, "resultStorageKey" TEXT, "resultThumbnailKey" TEXT,
  "resultDurationSec" DOUBLE PRECISION, "resultWidth" INTEGER, "resultHeight" INTEGER,
  "errorMessage" TEXT, "ffmpegSummary" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
  "dispatchedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_jobs_status_createdAt_idx" ON "video_jobs"("status", "createdAt");
CREATE INDEX "video_jobs_mediaAssetId_idx" ON "video_jobs"("mediaAssetId");
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
