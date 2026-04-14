# AC SED - Claude Context

## Reference Documentation

### Liga B API
- **File**: `LIGAB_API.md`
- Refer to this file for any questions about Liga B API
- Contains data structure, endpoints, filters and examples
- **Current active tournament**: ID 201 (Liga B + Lunes, Apertura 2026 Rinconada)
- **Active stage**: ID 396 (Fase 1)
- **AC SED group**: ID 2300 (División Ragnar)

## Project Conventions

### Database
- ORM: Prisma
- Always use `npx prisma db push` after schema changes
- Name fields in English in schema, add Spanish comments when needed

### Scraper
- File: `lib/scraper.ts`
- Map API fields to semantic names in our DB
- Example: `grounds` (API) → `venue` (DB)

### Team Detection
- **ALWAYS** use the utility function `isACSED()` from `lib/team-utils.ts` to check if a team is AC SED
- **NEVER** use string comparisons like `.includes('ACSED')` or `.toUpperCase().includes('AC SED')`
- Import: `import { ACSED_TEAM_NAME, ACSED_TEAM_ID, isACSED } from '@/lib/team-utils'`
- Example: `isACSED(team?.name)` returns `true` if team is AC SED

### Frontend
- Framework: Next.js 15
- Styling: Tailwind CSS
- Team logos:
  - AC SED logo: always use `/ACSED-transaparent.webp` from public folder
  - Other teams logos from API:
    - For images **>100x100px**: use base URL without size prefix (1024x1024 original)
      - Format: `https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{logoUrl}`
    - For images **≤100x100px**: use size prefix matching display size
      - Available sizes: `28x28`, `48x48`, `50x50`, `80x80`
      - Format: `https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{size}_{logoUrl}`
      - Example: for 32px display → use `28x28_`, for 80px display → use `80x80_`
