-- Trilha sonora passa a ser escolhida por PUBLICAÇÃO, não pela mídia.
ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_musicTrackId_fkey";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "musicTrackId";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "musicMode";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "musicedStorageKey";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "musicedThumbnailKey";

ALTER TABLE "scheduled_posts" ADD COLUMN "musicTrackId" TEXT;
ALTER TABLE "scheduled_posts" ADD COLUMN "musicMode" "MusicMode" NOT NULL DEFAULT 'MIX';
ALTER TABLE "scheduled_posts" ADD COLUMN "musicedStorageKey" TEXT;
ALTER TABLE "scheduled_posts" ADD COLUMN "musicedThumbnailKey" TEXT;
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_musicTrackId_fkey"
  FOREIGN KEY ("musicTrackId") REFERENCES "audio_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_jobs" ADD COLUMN "scheduledPostId" TEXT;
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_scheduledPostId_fkey"
  FOREIGN KEY ("scheduledPostId") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "video_jobs_scheduledPostId_idx" ON "video_jobs"("scheduledPostId");
