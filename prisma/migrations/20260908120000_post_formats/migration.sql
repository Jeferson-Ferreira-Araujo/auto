CREATE TYPE "PostFormat" AS ENUM ('AUTO', 'STORY', 'CAROUSEL');
ALTER TABLE "scheduled_posts" ADD COLUMN "postFormat" "PostFormat" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "scheduled_posts" ADD COLUMN "carouselExtraIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
