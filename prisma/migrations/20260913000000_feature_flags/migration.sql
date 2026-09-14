CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- Defense-in-depth: só o backend (service role) acessa esta tabela.
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "feature_flags" FROM anon, authenticated;
