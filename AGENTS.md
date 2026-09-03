<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# InstaPub — convenções do projeto

Ver `README.md` para setup completo. Pontos-chave:

- **Multi-tenant:** nunca confie em `organizationId` vindo do cliente. Use `requireOrgContext()` /
  `requireOrgAccess()` de `src/lib/auth`. Toda query Prisma escopada por `organizationId`; buscas por id
  usam `where: { id, organizationId }`.
- **Meta/Instagram:** só via `InstagramService` (`src/lib/instagram/service.ts`). Tokens cifrados
  (`src/lib/crypto.ts`), nunca no frontend.
- **Mutations:** Server Actions via `orgAction()` de `src/lib/safe-action.ts` (auth + Zod + `ActionResult`).
- **Uploads:** browser → `POST /api/r2/presign` → PUT direto no R2 → `confirmUpload` (server action) valida
  e processa. Arquivo nunca passa pela Vercel.
- **Scheduler:** `src/lib/scheduler/*` acionado por `pg_cron` → `/api/cron/*` (segredo `CRON_SECRET`).
  Idempotência: `FOR UPDATE SKIP LOCKED` + `scheduled_posts.instagramMediaId` UNIQUE.
- **Prisma pinado em v6** (v7+ exige `prisma.config.ts` e adapters). `datasource` usa `url`/`directUrl`.
- Rodar: `npm run typecheck`, `npm run lint`, `npm run build`.
