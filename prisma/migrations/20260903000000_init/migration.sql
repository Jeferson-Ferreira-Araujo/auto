-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AutoPublishStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "InstagramConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('PENDING', 'READY', 'INCOMPATIBLE', 'FAILED');

-- CreateEnum
CREATE TYPE "SelectionStrategy" AS ENUM ('SEQUENTIAL', 'RANDOM', 'LEAST_USED');

-- CreateEnum
CREATE TYPE "AutomationMediaType" AS ENUM ('IMAGE', 'VIDEO', 'ANY');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('MANUAL', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "PublicationOutcome" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "PublicationPhase" AS ENUM ('CONTAINER', 'STATUS', 'PUBLISH');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "autoPublishStatus" "AutoPublishStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "uploadLimitMb" INTEGER NOT NULL DEFAULT 200,
    "mediaLimit" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accountType" TEXT,
    "profilePictureUrl" TEXT,
    "accessTokenCipher" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "type" "MediaType" NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "processedStorageKey" TEXT,
    "thumbnailKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "caption" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedAt" TIMESTAMP(3),
    "processingStatus" "MediaProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "mediaType" "AutomationMediaType" NOT NULL DEFAULT 'ANY',
    "selectionStrategy" "SelectionStrategy" NOT NULL DEFAULT 'LEAST_USED',
    "daysOfWeek" INTEGER[],
    "publicationTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_posts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "automationId" TEXT,
    "source" "PostSource" NOT NULL DEFAULT 'MANUAL',
    "caption" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "instagramContainerId" TEXT,
    "instagramMediaId" TEXT,
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "occurrenceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduledPostId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" "PublicationOutcome" NOT NULL,
    "phase" "PublicationPhase" NOT NULL,
    "message" TEXT,
    "metaResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_organizationId_idx" ON "organization_members"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_userId_organizationId_key" ON "organization_members"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_organizationId_key" ON "instagram_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "media_categories_organizationId_idx" ON "media_categories"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "media_categories_organizationId_name_key" ON "media_categories"("organizationId", "name");

-- CreateIndex
CREATE INDEX "media_assets_organizationId_type_idx" ON "media_assets"("organizationId", "type");

-- CreateIndex
CREATE INDEX "media_assets_organizationId_isActive_idx" ON "media_assets"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "media_assets_organizationId_categoryId_idx" ON "media_assets"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "automations_organizationId_idx" ON "automations"("organizationId");

-- CreateIndex
CREATE INDEX "automations_isActive_idx" ON "automations"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_posts_instagramMediaId_key" ON "scheduled_posts"("instagramMediaId");

-- CreateIndex
CREATE INDEX "scheduled_posts_status_scheduledAt_idx" ON "scheduled_posts"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_posts_organizationId_scheduledAt_idx" ON "scheduled_posts"("organizationId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_posts_automationId_occurrenceKey_key" ON "scheduled_posts"("automationId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "publication_logs_scheduledPostId_idx" ON "publication_logs"("scheduledPostId");

-- CreateIndex
CREATE INDEX "publication_logs_organizationId_createdAt_idx" ON "publication_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_categories" ADD CONSTRAINT "media_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "media_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "media_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_logs" ADD CONSTRAINT "publication_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_logs" ADD CONSTRAINT "publication_logs_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

