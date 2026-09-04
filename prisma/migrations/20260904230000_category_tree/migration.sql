ALTER TABLE "media_categories" ADD COLUMN "parentId" TEXT;

DROP INDEX "media_categories_organizationId_name_key";

CREATE UNIQUE INDEX "media_categories_organizationId_parentId_name_key"
  ON "media_categories" ("organizationId", "parentId", "name");

CREATE INDEX "media_categories_parentId_idx" ON "media_categories" ("parentId");

ALTER TABLE "media_categories"
  ADD CONSTRAINT "media_categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "media_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
