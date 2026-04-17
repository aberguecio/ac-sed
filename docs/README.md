# AC SED — Repository Docs

Full-stack Next.js 15 application for **AC SED**, a football club in Chile's Liga B.
It scrapes Liga B data, stores it in Postgres, generates AI-powered news & Instagram posts,
and serves a public site + admin panel.

## Stack

- **Framework**: Next.js 15 (App Router, `output: standalone`)
- **Language**: TypeScript
- **DB**: PostgreSQL 16 + Prisma ORM
- **Auth**: NextAuth v5 (password-only admin)
- **Styling**: Tailwind CSS (custom navy/wheat/cream palette)
- **AI**: Vercel AI SDK (OpenAI-compatible; supports LiteLLM via `AI_BASE_URL`)
- **Cloud**: AWS SES (newsletter) + AWS S3 (image storage)
- **Social**: Instagram Graph API v21.0
- **Images**: Sharp (IG/VS composition)
- **Infra**: Docker Compose (db + web + cron) behind Traefik in prod

## Documents

- [architecture.md](./architecture.md) — repo layout, data model, key entities
- [backend.md](./backend.md) — API routes, scraper, libs, integrations
- [frontend.md](./frontend.md) — pages, components, styling, data fetching
- [running.md](./running.md) — how to run both backend and frontend locally
- [whatsapp-integration.md](./whatsapp-integration.md) — wiring an external WhatsApp provider into the attendance feature

## Conventions (from `.claude/CLAUDE.md`)

- **Never** run `npm` / `npx prisma` commands locally — everything runs in Docker.
- **Team detection**: always use `isACSED()` from `lib/team-utils.ts`; never string matching.
- **Team logos**: always use `<TeamLogo>` from `components/team-logo.tsx`; never raw `<img>`.
- Schema fields in English; Spanish comments allowed.
- Current active tournament: ID `201` (Apertura 2026 Rinconada). Stage `396`. AC SED group `2300`.
