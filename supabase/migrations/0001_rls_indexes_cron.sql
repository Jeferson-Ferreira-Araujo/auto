-- Executar APÓS `prisma migrate deploy`.
-- Aplique no Supabase: Dashboard > SQL Editor  (ou `supabase db push` se usar a CLI).
-- Já foi aplicado no projeto "instapub" (crnuazkevczftzqyyxnr) durante o desenvolvimento.

-- ── Índice parcial para o scheduler (só linhas SCHEDULED) ──
CREATE INDEX IF NOT EXISTS "scheduled_posts_due_idx"
  ON "scheduled_posts" ("scheduledAt")
  WHERE "status" = 'SCHEDULED';

-- ── RLS: defesa em profundidade ──
-- A aplicação acessa o banco SOMENTE via Prisma (role "postgres", dona das tabelas,
-- que ignora RLS). Habilitamos RLS sem políticas para que "anon"/"authenticated"
-- (qualquer cliente supabase-js) não consigam ler/escrever nada.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','organizations','organization_members','instagram_accounts',
    'media_categories','media_assets','automations','scheduled_posts','publication_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', t);
  END LOOP;
END $$;

-- ── Config privada consumida pelos jobs de cron ──
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO private.app_config(key, value) VALUES
  ('app_url', 'http://localhost:3000'),
  ('cron_secret', 'dev-cron-secret-troque-em-producao-0123456789abcdef')
ON CONFLICT (key) DO NOTHING;
-- Após o deploy, rode:
--   UPDATE private.app_config SET value = 'https://SEU-APP.vercel.app' WHERE key = 'app_url';
--   UPDATE private.app_config SET value = 'SEU_CRON_SECRET'            WHERE key = 'cron_secret';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rota única /api/cron?job=... (consolidada por causa do limite de 12 Serverless Functions no plano Hobby da Vercel).
CREATE OR REPLACE FUNCTION private.call_cron(job text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  base   text;
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO base   FROM private.app_config WHERE key = 'app_url';
  SELECT value INTO secret FROM private.app_config WHERE key = 'cron_secret';
  SELECT net.http_post(
    url     := base || '/api/cron?job=' || job,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO req_id;
  RETURN req_id;
END $$;

SELECT cron.schedule('instapub_generate',       '*/15 * * * *', $$SELECT private.call_cron('generate')$$);
SELECT cron.schedule('instapub_publish',        '* * * * *',    $$SELECT private.call_cron('publish')$$);
SELECT cron.schedule('instapub_refresh_tokens', '0 6 * * *',    $$SELECT private.call_cron('refresh-tokens')$$);
