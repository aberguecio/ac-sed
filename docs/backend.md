# Backend

## API routes (`app/api`)

### Scraping / data
- `POST /api/scrape` — manual scrape (body: `{ tournamentId?, stageId? }`); generates news + VS images + IG drafts for new AC SED matches
- `GET  /api/scrape/logs` — paginated scrape history
- `GET  /api/tournaments` — list tournaments
- `GET  /api/cron` — cron-only; header `X-Cron-Secret` required; runs scraper + content generation

### News
- `GET/POST /api/news` — list (paginated, `?all=true` includes unpublished) / create
- `GET/POST /api/news/[id]` — fetch / update (publish, featured)
- `POST /api/news/[id]/send` — newsletter send via SES (embeds standings table)
- `POST /api/news/[id]/regenerate` — re-run AI on linked match
- `POST /api/news/generate-vs-image` — standalone VS image

### Instagram
- `GET/POST /api/instagram` — list / create draft
- `GET/POST /api/instagram/[id]` — fetch / update
- `POST /api/instagram/[id]/images` — attach composed image
- `POST /api/instagram/[id]/regenerate` — AI caption
- `POST /api/instagram/[id]/publish` — publish (single or carousel, polls container status)
- `GET /api/instagram/matches` / `/backgrounds` / `/templates`

### Players
- `GET/POST /api/players`, `GET/POST /api/players/[id]`
- `POST /api/admin/players/generate` — AI bios/stats
- `POST /api/admin/players/link` — link roster player ↔ Liga B scrapedPlayer

### Stats
- `GET /api/stats` — standings + top scorers (supports `upToDate`)
- `GET /api/stats/chart-data`, `/head-to-head`, `/match-days`
- `POST /api/stats/generate-analysis`, `/api/admin/analysis/*`

### Utility
- `POST /api/subscribe`, `/api/unsubscribe`
- `GET /api/subscribers` (admin)
- `POST /api/upload` — S3 upload
- `POST /api/auth/[...nextauth]` — NextAuth

## `lib/scraper.ts`

Entry: `runScraper(triggeredBy, options?)`.

Base URL `https://api.ligab.cl/v1`, league `24`.

Per stage:
1. `/stages/{stageId}/groups` → find AC SED group
2. `/groups/{groupId}/standings` → upsert Team + Standing
3. `/tournaments/{tid}/top-scorers` → LeagueScorer
4. `/stages/{stageId}/match-days?filter=…` → upsert Match
5. For scored matches → `/matches/{matchId}/events?filter={"include":["player","team"]}` → upsert ScrapedPlayer, MatchGoal, MatchCard (deletes existing events first → idempotent)

Logos: parses Liga B CDN (`liga-b.nyc3.digitaloceanspaces.com`) UUIDs so we can render at any size.

## Key libs

| File | Role |
|---|---|
| `lib/db.ts` | Prisma singleton with dev query logging |
| `lib/auth.ts` | NextAuth + Credentials (password matches `ADMIN_PASSWORD`) |
| `lib/ai.ts` | `getModel()`, `getMatchContext()` (goals/cards/form/head-to-head/standings-at-date), `generateMatchNews()`, `generateInstagramCaption()` |
| `lib/stats-calculator.ts` | `calculateStandingsUpToDate()`, `calculateScorersUpToDate()` — used for historical context in AI prompts |
| `lib/coach-analysis.ts` | AI tactical analysis (phase-aware: start / mid / end) |
| `lib/aws.ts` | `sendNewsletterEmail()` (HTML email w/ standings), `uploadImageToS3()` |
| `lib/instagram.ts` | Graph API v21.0 — container create → poll (≤30×2s) → publish; supports carousels |
| `lib/ig-image-generator.ts` | Sharp composites for result / standings / promo / custom posts |
| `lib/vs-image-generator.ts` | 1200×630 hero with team logos + gradient for news |
| `lib/team-utils.ts` | `isACSED()`, `ACSED_TEAM_ID=2836`, `ACSED_TEAM_NAME='AC Sed'` |

## Cron

Docker `cron` service (alpine + curl). Schedule:
- **Prod**: `0 12 * * 2` (Tue 12:00 UTC)
- **Dev**: `0 8 * * 1` (Mon 08:00 UTC)

Hits `http://web:3000/api/cron` with `X-Cron-Secret: ${CRON_SECRET}`. No Bull/Agenda — the Docker cron service is the only scheduler.

## Environment variables (see `.env.example`)

```
DATABASE_URL=postgresql://acsed:changeme@db:5432/acsed
POSTGRES_{DB,USER,PASSWORD}
NEXTAUTH_SECRET, NEXTAUTH_URL
ADMIN_PASSWORD
AI_API_KEY, AI_MODEL=gpt-4o-mini, AI_BASE_URL  (optional for LiteLLM/vLLM)
CRON_SECRET
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
AWS_SES_FROM_EMAIL, AWS_S3_BUCKET
INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN
NEXT_PUBLIC_SITE_URL
```
