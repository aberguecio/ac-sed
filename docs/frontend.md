# Frontend

## Public routes (`app/(site)`)

| Route | Rendering | Purpose |
|---|---|---|
| `/` | RSC + ISR 5 min | Hero, latest match, standings, upcoming/played fixtures, gallery, latest 3 news |
| `/players` | RSC + ISR 5 min | Roster grid (active players, sorted by number); position labels in Spanish; hexagon stats |
| `/stats` | Client | Tournament/stage selectors, match-day slider, quick stats, standings, last/next match, division + AC SED scorers, head-to-head, final status badge |
| `/news` | RSC + ISR 60 s | Articles grouped by phase (2 phases/page); newsletter signup |
| `/news/[slug]` | RSC | Article detail |
| `/unsubscribe` | — | Token-based unsubscribe confirmation |

## Admin routes (`app/admin`) — NextAuth protected

`/admin`, `/admin/login`, `/admin/players`, `/admin/news`, `/admin/scrape`, `/admin/analysis`, `/admin/instagram`, `/admin/subscribers`, `/admin/settings`.

## Components (`components/`)

| Component | Notes |
|---|---|
| `TeamLogo` | **Canonical** — props `{teamId, teamName, logoUrl, size: sm\|md\|lg}`. AC SED uses `/ACSED-transaparent.webp`; others built from Liga B CDN UUID; initials fallback. Use this everywhere, never `<img>`. |
| `HexagonStats` | Client SVG radar, 6 stats (RIT/TIR/PAS/REG/DEF/FIS), wheat fill |
| `StandingsTable` | PJ/PG/PE/PP/GF/GC/Pts — AC SED row highlighted wheat |
| `NewsCard` | Image + date + title (2-line clamp) + excerpt (150 chars) |
| `PlayerCard` | Photo/initials, number, position, bio, total + phase goals, HexagonStats |
| `NewsletterSignup` | Client form → `POST /api/subscribe` |
| `layout/navbar` | Mobile hamburger, active-link highlight via `usePathname()` |
| `layout/footer` | Logo + "Made by Agustín Berguecio" + year |
| `admin/sidebar` | Persistent admin nav |

## Styling

Tailwind (`tailwind.config.ts`) with custom palette:

- **cream** `#FAF7F0` (light) / `#EDE8DC` (dark) — backgrounds
- **navy** `#1B2B4B` (default) / `#263D6B` / `#111B30` — primary text
- **wheat** `#C8A96E` (default) / `#D4BA8A` / `#A8894E` — accent

Font: Inter (system fallback). Patterns: rounded cards, hover:shadow-md/lg, glass effects (white/10 + backdrop-blur), mobile-first breakpoints.

## State / data fetching

- **Default**: Server Components query Prisma directly; ISR for public pages.
- **Client state**: only `/stats` (selectors, timeline), `NewsletterSignup`, `Navbar`. `useState` + `fetch()` — no Redux/Zustand/Context.
- **Client endpoints hit**: `/api/tournaments`, `/api/stats`, `/api/stats/match-days`, `/api/stats/head-to-head`, `/api/subscribe`.

## `next.config.ts`

- `output: 'standalone'` (Docker-friendly)
- `images.remotePatterns`: `*.s3.amazonaws.com`, `*.s3.*.amazonaws.com`, `liga-b.nyc3.digitaloceanspaces.com`
