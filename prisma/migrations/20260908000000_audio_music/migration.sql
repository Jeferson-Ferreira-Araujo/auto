ALTER TYPE "VideoJobKind" ADD VALUE 'ADD_MUSIC';
CREATE TYPE "MusicMode" AS ENUM ('MIX', 'MUSIC_ONLY');

ALTER TABLE "organizations" ADD COLUMN "autoMusicTrackId" TEXT;

CREATE TABLE "audio_tracks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "durationSec" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audio_tracks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audio_tracks_organizationId_active_idx" ON "audio_tracks"("organizationId", "active");

ALTER TABLE "media_assets" ADD COLUMN "musicTrackId" TEXT;
ALTER TABLE "media_assets" ADD COLUMN "musicMode" "MusicMode" NOT NULL DEFAULT 'MIX';
ALTER TABLE "media_assets" ADD COLUMN "musicedStorageKey" TEXT;
ALTER TABLE "media_assets" ADD COLUMN "musicedThumbnailKey" TEXT;

ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_musicTrackId_fkey" FOREIGN KEY ("musicTrackId") REFERENCES "audio_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_autoMusicTrackId_fkey" FOREIGN KEY ("autoMusicTrackId") REFERENCES "audio_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tracks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "audio_tracks" FROM anon, authenticated;
