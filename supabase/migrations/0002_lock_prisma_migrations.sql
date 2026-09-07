-- Defense-in-depth: a tabela de histórico de migrations do Prisma fica no schema
-- `public`, que o PostgREST expõe. Revoga o acesso de anon/authenticated e liga
-- RLS (sem policy = nega tudo). Aplicado no SQL Editor / via MCP.

REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
