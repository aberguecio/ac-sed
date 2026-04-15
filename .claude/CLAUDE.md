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
  - **ALWAYS** use the `<TeamLogo>` component from `components/team-logo.tsx`
  - **NEVER** manually build logo URLs or use `<img>` tags directly for team logos
  - Import: `import { TeamLogo } from '@/components/team-logo'`
  - Usage: `<TeamLogo teamId={team.id} teamName={team.name} logoUrl={team.logoUrl} size="md" />`
  - Available sizes: `'sm'` (28px), `'md'` (80px), `'lg'` (128px)
  - The component handles:
    - AC SED logo: automatically uses `/ACSED-transaparent.webp`
    - Other teams: uses API URL with correct size prefix
    - Fallback: shows initials in gray circle if no logo available
