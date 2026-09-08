# Backend

## API routes (`app/api`)

### Scraping / data
- `POST /api/scrape` — manual scrape (body: `{ tournamentId?, stageId? }`); generates news + VS images + IG drafts for new AC SED matches
- `GET  /api/scrape/logs` — paginated scrape history
- `GET  /api/tournaments` — list tournaments
- `GET  /api/cron` — cron-only; header `X-Cron-Secret` required; runs scraper + content generation
- `GET/POST /api/admin/matches/duplicates` — inspect / merge the duplicate `Match` rows an old fixture republication left behind (see *Match identity* below)

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
2. `/groups/{groupId}/standings` → upsert Team + Standing (keyed on `(tournamentId, stageId, groupId, teamId)`; teams no longer in the group are deleted)
3. `/tournaments/{tid}/top-scorers` → upsert LeagueScorer keyed on `(tournamentId, leaguePlayerId)`
4. `/stages/{stageId}/match-days?filter=…` → upsert Match (identity below)
5. For scored matches → `/matches/{matchId}/events?filter={"include":["player","team"]}` → upsert ScrapedPlayer, and MatchGoal / MatchCard keyed on `leagueEventId`, deleting the events the payload no longer carries

`fetchAPI` retries 429/5xx and network errors three times with exponential
backoff. Everything in a stage shares one scrape, so an unretried failure used
to cost the whole run — a Cloudflare 521 did exactly that on 2026-09-08.

### Writing rules

Every collection the scraper owns is keyed and upserted; none is deleted and
rebuilt. That mattered: the delete-and-reinsert pattern burned ~421k ids for
~2.500 real rows, and it destroyed manual edits on every pass, since a
hand-set `rosterPlayerId` lives on a row that was about to be deleted.

| Collection | Key | Deletes |
|---|---|---|
| `Standing` | `(tournamentId, stageId, groupId, teamId)` | teams no longer in the group |
| `LeagueScorer` | `(tournamentId, leaguePlayerId)` | players no longer on the leaderboard |
| `MatchGoal` / `MatchCard` | `leagueEventId` | events the payload no longer returns |
| `Match` | `leagueMatchId`, then the natural key | never |

On update, the fields a human can edit are left out of the payload on purpose:
`rosterPlayerId`, `minute`, `reason` and the assist fields on events;
`context` on a match. `eventsLocked` still short-circuits the whole event sync
for a match someone edited by hand.

Deleting by absence needs a bound, or a stale response for an old match would
wipe events nobody can rebuild: `EVENT_FETCH_WINDOW_DAYS` (30) skips matches
played longer ago **that already have a score**. Without a score an old match
is the "result not entered yet" case and keeps being polled — the match of
2026-09-07 still had none 15 h later.

The entity upserts (`Team`, `Tournament`, `Stage`, `Group`, `ScrapedPlayer`)
compare before writing. Consequence worth knowing: `Team.updatedAt` used to
advance every two hours regardless, so historical values of it mean nothing.

### What the scraper reports (`lib/match-changes.ts`)

`runScraper` returns `changes: MatchChange[]` — `created`, `result-arrived`,
`rescheduled`, `updated` — for AC SED matches only.

Anything that generates content takes its matches from
`matchesWithNewResult(changes)`. This is not cosmetic: the old return value was
a single `newMatches` bag meaning both "a row appeared" and "the result
arrived", each consumer had to re-filter it, one forgot, and four fixture
republications produced 20 news articles with invented scorelines. With the
cases named, a `created` match cannot reach the chronicle generator.

`newMatches` is still returned with its historical meaning (created or newly
scored) for callers that want both.

### Match identity (`lib/match-consolidation.ts`)

`Match.leagueMatchId` is not stable: the league sometimes deletes and
republishes a whole fixture, handing the same real matches brand-new ids. It did
it four times on 2026-09-05/06 and left 60 rows where 15 belonged, with the
match's data scattered across the copies — attendance votes on one, the
Instagram promo on another, the live score on the newest.

So step 4 resolves a fixture entry in two hops (`resolveFixtureMatch`):

1. `leagueMatchId` — the fast path.
2. Failing that, the natural key `(tournamentId, stageId, groupId, homeTeamId,
   awayTeamId)`. A hit means the league republished: the existing row **adopts**
   the new `leagueMatchId` instead of a duplicate being created, and any other
   stray copy is folded into it.

Two rules that are easy to get wrong:

- **`date` is not part of the identity.** It is precisely the field the league
  mutates when a match is rescheduled (hence the `dateChanged` branch), so
  keying on it would bring the duplication back through the other door.
- **Rows whose `leagueMatchId` appears in the fixture being scraped are never
  merged.** They belong to a match the league still publishes separately — a
  second leg of the same pairing, say — and are not stale copies.

TBD fixtures (both teams `null`) have no natural key and always take the
`leagueMatchId` path.

The merge itself (`consolidateMatches`) runs in one transaction: children move
to the surviving row (the oldest of the group, so existing links keep
resolving), attendance is merged per player instead of colliding on
`(playerId, matchId)` — an answered vote beats a `PENDING` one — echoed
goals/cards are trimmed while a genuine brace is kept, `context` / `venue` /
`notifyGroupAt` / `eventsLocked` are inherited when the survivor lacks them, and
the empty duplicates are deleted.

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
| `lib/match-consolidation.ts` | Match natural key, `resolveFixtureMatch()`, `consolidateMatches()`, `findDuplicateMatchGroups()` |
| `lib/match-changes.ts` | `MatchChange` union + `matchesWithNewResult()` — the only door from a scrape to content |

## Cron

Docker `cron` service (alpine + curl). Schedule:
- **Prod**: `0 12 * * 2` (Tue 12:00 UTC)
- **Dev**: `0 8 * * 1` (Mon 08:00 UTC)

Hits `http://web:3000/api/cron` with `X-Cron-Secret: ${CRON_SECRET}`. No Bull/Agenda — the Docker cron service is the only scheduler.

In-app jobs live in `JOB_REGISTRY` (`lib/cron-jobs.ts`) and are seeded into
`CronJob` by `seedDefaultJobs()` on boot:

| Key | When | What |
|---|---|---|
| `weekly-result` | Tue 12:00 | scrape, then a chronicle for each `result-arrived` match |
| `monday-promo` | Mon 09:00 | Instagram promo for the day's match |
| `saturday-attendance` | Sat 12:00 | attendance poll broadcast |
| `refresh-ig-token` | Mon 04:00 | roll the long-lived Instagram token |
| `duplicate-matches-check` | Mon 05:00 | report duplicate `Match` rows (detection only) |

`duplicate-matches-check` reports `error` when it finds something so the admin
panel shows it in red. It exists because the scraper only visits the active
tournament: a duplicate left in an older one is never looked at again, which
is how 45 orphan rows went unnoticed for three days.

## Schema changes

There is no `prisma/migrations` directory — the schema is applied with
`npm run db:push` (`prisma db push`), followed by `npm run db:generate` for the
client. A push that adds a unique index fails while duplicates exist, so clean
the data first.

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
