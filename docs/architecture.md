# Architecture

## Repository layout

```
app/
├── (site)/                 Public pages (homepage, news, stats, players)
├── admin/                  Protected admin panel (NextAuth)
└── api/                    Route handlers (scrape, news, instagram, cron, stats, auth)
components/
├── team-logo.tsx           Canonical team logo (AC SED + Liga B CDN + fallback)
├── hexagon-stats.tsx       FIFA-style SVG radar for player stats
├── standings-table.tsx     League table (highlights AC SED row)
├── news-card.tsx
├── player-card.tsx
├── newsletter-signup.tsx
├── layout/{navbar,footer}.tsx
└── admin/sidebar.tsx
lib/
├── db.ts                   PrismaClient singleton
├── auth.ts                 NextAuth (Credentials / password)
├── scraper.ts              Liga B API scraper
├── ai.ts                   News + caption generation (Vercel AI SDK)
├── aws.ts                  SES newsletter + S3 uploads
├── instagram.ts            IG Graph API wrapper (single + carousel)
├── team-utils.ts           isACSED(), ACSED_TEAM_ID=2836
├── stats-calculator.ts     Standings-at-date recalculation
├── coach-analysis.ts       AI tactical analysis
├── ig-image-generator.ts   Sharp-based IG composites (1080×1080)
└── vs-image-generator.ts   Match VS hero image (1200×630)
prisma/schema.prisma        ~18 models
public/                     Static assets (logos, templates)
scripts/                    One-off utilities (analyze-teams, logo-extraction)
Dockerfile, Dockerfile.dev  Prod + dev images
docker-compose.yml          Prod (Traefik, cron Tue 12:00 UTC)
docker-compose.dev.yml      Dev (hot reload, cron Mon 08:00 UTC)
middleware.ts               Protects /admin + sensitive API routes
next.config.ts              standalone output, image remotePatterns for S3 + Liga B CDN
tailwind.config.ts          Custom palette (navy/wheat/cream)
LIGAB_API.md                Liga B API reference
```

## Data model (prisma/schema.prisma)

Tournament-centric. Cascade deletes preserve integrity; `leagueMatchId @unique` makes scraping idempotent.

| Model | Purpose |
|---|---|
| `Tournament` | Liga B tournament (id, name, isActive) |
| `Stage` | Phase inside a tournament (ordered) |
| `Group` | Division within a stage (e.g. "Ragnar", "Thor") |
| `Team` | Teams with cached logo UUID |
| `Match` | Match record (date, venue, scores, `leagueMatchId` unique) |
| `Standing` | Computed per (tournament, stage, group, team) |
| `LeagueScorer` | Top scorers, tournament-wide |
| `Player` | AC SED roster (number, bio, photo, FIFA-style stats: ritmo/disparo/pase/regate/defensa/físico) |
| `ScrapedPlayer` | Liga B API players (not roster) |
| `MatchGoal` / `MatchCard` | Events linked to scraped + optional roster player |
| `NewsArticle` | AI-generated match chronicle (slug, content, published, featured) |
| `NewsletterSubscriber` | Email + unsubscribe token |
| `ScrapeLog` | Audit trail per scrape run |
| `TournamentAnalysis` | Coach analysis (unique per tournament/stage/group) |
| `InstagramBackground` / `InstagramPost` / `InstagramPostImage` | IG drafts + composed images |

## Request flow

1. **Cron / admin** triggers `/api/scrape`
2. `lib/scraper.ts` hits `api.ligab.cl/v1` → upserts tournaments, stages, groups, teams, matches, standings, scorers, goals, cards
3. For new AC SED matches → `lib/ai.ts` generates news article + `lib/vs-image-generator.ts` makes VS hero → uploaded to S3
4. Admin reviews in `/admin/news` → publishes → `/api/news/[id]/send` emails subscribers via SES (with standings table)
5. Admin creates IG draft in `/admin/instagram` → `/api/instagram/[id]/publish` pushes to IG Graph API

## Auth

Single shared admin password via `ADMIN_PASSWORD`. NextAuth Credentials provider, JWT sessions. `middleware.ts` guards `/admin/**` and sensitive `/api/**` endpoints.
