# InstaPub — automação de publicações no Instagram (MVP)

SaaS multiempresa onde uma empresa **envia mídias → organiza em categorias → agenda (manual ou automação) → o sistema publica sozinho no Instagram no horário → registra no histórico**.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Prisma · PostgreSQL (Supabase) · Supabase Auth · Cloudflare R2 · Zod · APIs oficiais da Meta.
- **Custo alvo:** R$ 0 usando Vercel Free + Supabase Free + Cloudflare R2 Free Tier.
- **Publicação em background:** `pg_cron` no Supabase (a cada 1 min) chamando rotas `/api/cron/*` protegidas por segredo. Não usa Vercel Cron (o plano Hobby só roda 1×/dia), nem Redis/BullMQ.

## Como funciona (visão de arquitetura)

```
Browser ──(URL pré-assinada)──► Cloudflare R2         (upload direto; não passa pela Vercel)
   │
   ▼
Next.js (Vercel)  ── Prisma ──►  PostgreSQL (Supabase)
   │                              ▲
   │  InstagramService            │ pg_cron + pg_net (a cada minuto)
   ▼                              │
 graph.instagram.com  ◄───────────┘  chama POST /api/cron/publish
```

- Toda mídia (original, JPEG normalizado, thumbnail) vive no **R2**, em bucket **privado**. Quando a Meta precisa buscar a mídia para publicar, geramos uma **URL pré-assinada de leitura válida por 2h**.
- Os **tokens da Meta são cifrados** (AES-256-GCM) no banco e **nunca** vão para o frontend. Toda comunicação com a Meta passa por `src/lib/instagram/service.ts` (`InstagramService`).
- **Isolamento multiempresa:** toda query é escopada por `organizationId` resolvido no servidor; `requireOrgContext()` / `requireOrgAccess()` verificam a associação do usuário. RLS está habilitada em todas as tabelas como defesa em profundidade (a app acessa o banco só via Prisma).
- **Idempotência de publicação:** o worker reivindica cada `ScheduledPost` com `UPDATE ... FOR UPDATE SKIP LOCKED` (só um processo ganha a linha) e `instagramMediaId` é `UNIQUE`. Dois workers nunca publicam o mesmo post duas vezes.

---

## 1. Pré-requisitos

- Node.js 20+ e npm
- Conta no [Supabase](https://supabase.com), [Cloudflare](https://dash.cloudflare.com) e [Meta for Developers](https://developers.facebook.com)
- Uma conta **profissional** do Instagram (Comercial ou Criador de Conteúdo) para testes

---

## 2. Supabase (PostgreSQL + Auth)

> Um projeto Supabase chamado **`instapub`** já foi criado durante o desenvolvimento
> (ref `crnuazkevczftzqyyxnr`, região `sa-east-1`). Você pode usá-lo ou criar o seu.

1. **Project Settings → API**: copie `Project URL` e a `anon`/`publishable` key para `.env`.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = string do **Transaction Pooler** (porta `6543`) + `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL` = string da **conexão direta** (porta `5432`)
   - Se não souber a senha do banco, clique em **Reset database password**.
3. **Auth → Providers → Email**: mantenha habilitado. Em **Auth → URL Configuration**, adicione
   `http://localhost:3000/**` e a URL de produção em *Redirect URLs*.
4. **Migrations do schema (Prisma):**
   ```bash
   npm install
   npx prisma migrate deploy      # cria as tabelas
   ```
   > O projeto `instapub` **já tem as tabelas criadas**. Nele, rode uma única vez:
   > `npx prisma migrate resolve --applied 20260903000000_init`
5. **Migration de RLS + índices + cron** (`supabase/migrations/0001_rls_indexes_cron.sql`):
   - Abra **SQL Editor** no dashboard, cole o conteúdo do arquivo e execute.
   - Isso habilita RLS, cria o índice parcial do scheduler, as extensões `pg_cron`/`pg_net`,
     a tabela `private.app_config` e agenda os 3 jobs.
   > Já aplicada no projeto `instapub`.
6. **Configurar os jobs de cron** (depois de ter a URL da app — passo 6 abaixo). No SQL Editor:
   ```sql
   update private.app_config set value = 'https://SEU-APP.vercel.app' where key = 'app_url';
   update private.app_config set value = 'SEU_CRON_SECRET'            where key = 'cron_secret';
   ```
   Para **desenvolvimento local** os jobs não conseguem alcançar `localhost` — use `npm run cron:*` (passo 7).

---

## 3. Cloudflare R2 (armazenamento das mídias)

1. **R2 → Create bucket** → nome `instapub-media` (ou outro; ajuste `R2_BUCKET`).
2. **R2 → Manage R2 API Tokens → Create API token** com permissão *Object Read & Write* no bucket.
   Copie `Access Key ID`, `Secret Access Key` e o `Account ID`.
3. `R2_ENDPOINT` = `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. **CORS do bucket** (Settings → CORS policy) — necessário para o upload direto do browser:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://SEU-APP.vercel.app"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Mantenha o bucket **privado** (não habilite acesso público). A aplicação entrega as mídias
   via URLs pré-assinadas.

**Free tier:** 10 GB de armazenamento, 1 milhão de operações de classe A e 10 milhões de classe B por mês,
egress gratuito. Suficiente para o MVP. Vídeos grandes consomem rápido os 10 GB — o limite de upload
por arquivo é configurável em **Configurações**.

---

## 4. Meta / Instagram (API oficial — *Instagram API with Instagram Login*)

Usamos o fluxo **Business Login for Instagram** (OAuth direto em `instagram.com`), com os escopos
`instagram_business_basic` e `instagram_business_content_publish`.

1. [developers.facebook.com](https://developers.facebook.com) → **Create App** → tipo **Business**.
2. No painel do app: **Add Product → Instagram → API setup with Instagram login**.
3. Em **Business login settings**:
   - **Redirect URI**: `http://localhost:3000/api/instagram/callback` (e a de produção).
     Precisa bater **exatamente** com `INSTAGRAM_REDIRECT_URI`.
   - Anote o **Instagram App ID** e **Instagram App Secret** → `.env`.
4. **App roles → Roles / Instagram testers**: adicione a conta profissional do Instagram que
   vai testar e **aceite o convite** dentro do app do Instagram
   (*Configurações → Para profissionais → Apps e sites*).
5. Enquanto o app estiver em **Development**, só é possível publicar em contas de teste adicionadas.
   Para produção, submeta **App Review** para `instagram_business_content_publish`
   (requer vídeo de demonstração do fluxo e política de privacidade publicada).

**Requisitos de mídia validados pela aplicação** (`src/lib/media/constraints.ts`):

| Tipo | Regra |
|---|---|
| Imagem (feed) | Convertida para **JPEG**; proporção entre **4:5 e 1.91:1**; largura ≥ 320px (recomendado ≤ 1440px) |
| Vídeo (Reels) | **MP4/MOV, H.264**; **3 s a 15 min**; proporção 0.01:1–10:1 (recomendado 9:16); **≤ 100 MB** no MVP (ver Limitações) |

Imagens são normalizadas com `sharp`. Vídeos **não são transcodificados** (inviável no free tier serverless):
metadados são lidos com `ffprobe` e, se incompatíveis, a mídia fica marcada como **Incompatível** com
mensagem clara para o usuário reenviar em formato correto.

**Limite da Meta:** 100 publicações por conta a cada 24h (carrossel conta como 1).

---

## 5. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. Gere os segredos:

```bash
# ENCRYPTION_KEY (32 bytes base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública da app, sem barra final |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `DATABASE_URL` / `DIRECT_URL` | Postgres (pooler 6543 / direto 5432) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` | Cloudflare R2 |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI` | Meta / Instagram |
| `ENCRYPTION_KEY` | AES-256 (32 bytes base64) para cifrar tokens da Meta |
| `CRON_SECRET` | Protege as rotas `/api/cron/*` |

---

## 6. Rodar localmente

```bash
npm install
npx prisma generate
# (schema já aplicado — veja passo 2.4)
npm run dev
```

Abra `http://localhost:3000`. Fluxo: **Criar conta → confirmar e-mail → criar empresa (onboarding) →
conectar Instagram → criar categorias → enviar mídias → agendar/automatizar → calendário**.

### Disparar o scheduler em desenvolvimento

Os jobs `pg_cron` no Supabase não alcançam `localhost`. Com `npm run dev` rodando:

```bash
npm run cron:generate   # materializa ScheduledPosts das automações (próximos 7 dias)
npm run cron:publish     # publica os ScheduledPosts vencidos
npm run cron:refresh     # renova tokens do Instagram perto de expirar
```

Para simular o cron real, rode `npm run cron:publish` num loop a cada minuto
(ex.: `while true; do npm run cron:publish; sleep 60; done`).

---

## 7. Deploy na Vercel

1. Importe o repositório na Vercel.
2. **Environment Variables**: adicione todas as do `.env` (com os valores de produção;
   `NEXT_PUBLIC_APP_URL` e `INSTAGRAM_REDIRECT_URI` com o domínio da Vercel).
3. Build command padrão (`npm run build` já roda `prisma generate`).
4. Após o primeiro deploy, atualize:
   - **Meta**: adicione `https://SEU-APP.vercel.app/api/instagram/callback` nas Redirect URIs.
   - **Supabase Auth**: adicione o domínio nas Redirect URLs.
   - **Cloudflare R2 CORS**: adicione o domínio.
   - **Supabase SQL Editor**: `update private.app_config ...` com a URL e o `CRON_SECRET` de produção (passo 2.6).
5. Os jobs `pg_cron` passam a chamar a produção automaticamente (1 min / 15 min / diário).

Não há Vercel Cron configurado — de propósito. Se preferir usar o `pg_cron`, nada a fazer.
Alternativas gratuitas (GitHub Actions `*/5`, etc.) podem chamar as mesmas rotas `/api/cron/*`.

---

## 8. Estrutura de pastas

```
prisma/
  schema.prisma                 modelo de dados (fonte da verdade)
  migrations/                   migration inicial do Prisma
supabase/
  migrations/0001_*.sql         RLS + índice parcial + pg_cron/pg_net
scripts/cron.mjs                dispara /api/cron/* em dev
src/
  proxy.ts                      (middleware) renova sessão + protege rotas
  app/
    (auth)/{login,signup}       autenticação
    auth/{callback,signout}     rotas do Supabase Auth
    onboarding/                 primeiros passos + criação da empresa
    (app)/                      área logada (layout com sidebar + guard de org)
      dashboard/ biblioteca/ categorias/ calendario/
      automacoes/ instagram/ historico/ configuracoes/
    api/
      r2/presign                gera URL pré-assinada de upload
      instagram/{connect,callback}
      media/[id]/[variant]      entrega mídia via URL pré-assinada (com auth)
      cron/{generate,publish,refresh-tokens}
  components/ui/                Button, Card, Input, Modal, Toast, ...
  lib/
    auth/                       requireUser / requireOrgContext / requireOrgAccess
    db.ts                       Prisma singleton
    crypto.ts                   AES-256-GCM para tokens
    storage/r2.ts               cliente R2 + presign + chaves seguras
    media/                      constraints, sniff de magic bytes, sharp, ffprobe, ingest
    instagram/                  InstagramService (único ponto de contato com a Meta)
    scheduler/                  occurrences, selection, generate, publish, refresh-tokens
    validation/schemas.ts       schemas Zod
    safe-action.ts              wrapper de Server Actions (auth + zod + erros)
    errors.ts / logger.ts       tratamento centralizado + logs estruturados (pino)
```

---

## 9. Verificação do fluxo real (sem mocks)

1. Criar conta → confirmar e-mail → onboarding cria `Organization` + `OrganizationMember`.
2. `/instagram` → **Conectar Instagram** (conta de teste) → mostra `@usuario`, tipo e expiração do token.
   Verifique no banco que `instagram_accounts.accessTokenCipher` é texto cifrado (`iv.tag.ciphertext`).
3. Criar 2 categorias; enviar 1 JPEG, 1 PNG (vira JPEG, com `processedStorageKey`) e 1 MP4 9:16 curto →
   aparecem **Prontos** na biblioteca com thumbnail.
4. `/calendario` → **Agendar publicação** para daqui a ~3 min → aparece como **Agendado**.
5. `/automacoes` → nova automação (dias de hoje, horário +5 min, `LEAST_USED`) →
   `npm run cron:generate` → o `ScheduledPost` da automação aparece no calendário.
6. `npm run cron:publish` (ou aguardar o `pg_cron` em produção) → status vai a **Publicando** → **Publicado**,
   com `instagramMediaId` e `publishedAt`; **a publicação aparece de verdade no Instagram**.
7. Token inválido → `retryCount` sobe, `publication_logs` registra cada fase, e após 3 tentativas vai a **Falhou**.
8. Concorrência: `npm run cron:publish` 2× em paralelo → apenas 1 `instagramMediaId`, sem post duplicado.
9. **Configurações → Pausar tudo** → automações não publicam; publicações manuais continuam; ao retomar, volta.
10. Histórico e Dashboard refletem tudo; um segundo usuário/empresa não enxerga os dados do primeiro.

---

## 10. Limitações conhecidas do MVP

- **Sem transcode de vídeo** — vídeos fora do padrão de Reels são rejeitados com instrução clara.
- **Vídeo ≤ 100 MB** — o `ffprobe` roda baixando o arquivo na função serverless (memória limitada no
  free tier). Para vídeos maiores seria preciso um worker dedicado (fora do escopo gratuito do MVP).
- **Meta App Review** — sem aprovação, publica apenas em contas de teste.
- **Rate limiting da aplicação** — limitador simples em memória; para produção séria, trocar por Upstash Free.
- **1 conta do Instagram por empresa** (constraint `@@unique([organizationId])` — fácil de relaxar).
- **Fuso nos campos `datetime-local`** — usam o fuso do navegador; para clientes fora do fuso da empresa,
  conferir o horário exibido.
- **Sem drag-and-drop no calendário** — reagendamento é feito pelo modal de detalhe (decisão de escopo do MVP).

## 11. Preparado para o futuro (não implementado de propósito)

Arquitetura já acomoda: múltiplas legendas / geração com IA (campo `caption` isolado, `ScheduledPost.caption`
separado do `MediaAsset.caption`), múltiplos usuários por empresa (`OrganizationMember` + `role`),
múltiplas contas do Instagram por empresa, e outras redes. Nada disso está ligado neste MVP.
