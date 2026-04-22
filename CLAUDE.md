# AC SED Project - Helper Functions & Conventions

This document contains important helper functions, conventions, and project-specific information for Claude to reference when working on this codebase.

## String Utilities

### `cleanTournamentName(name: string): string`

**Location:** `lib/string-utils.ts`

Cleans up tournament names by removing common verbose prefixes and suffixes used in Liga B tournaments.

**Removes:**
- `"Liga B + Lunes, "` from the beginning (if present)
- `" Rinconada"` from the end (if present)

**Usage:**
```typescript
import { cleanTournamentName } from '@/lib/string-utils'

const fullName = "Liga B + Lunes, Otoño 2025 Rinconada"
const cleanName = cleanTournamentName(fullName)
// Result: "Otoño 2025"
```

**When to use:**
- Display tournament names in UI components (especially in charts, tables, or compact spaces)
- When tournament names need to be more concise without losing essential information

**Examples:**
- `"Liga B + Lunes, Otoño 2025"` → `"Otoño 2025"`
- `"Verano 2024 Rinconada"` → `"Verano 2024"`
- `"Liga B + Lunes, Primavera 2025 Rinconada"` → `"Primavera 2025"`
- `"Invierno 2024"` → `"Invierno 2024"` (unchanged if no prefix/suffix)

## Team Identification

### AC SED Team Name
The official team name in the database is: `"AC Sed"`

**Note:** Be careful with capitalization when querying or filtering for AC SED matches.

## Project Conventions

### Component Organization
- UI components: `components/`
- Chart components: `components/charts/`
- API routes: `app/api/`
- Utility functions: `lib/`

### Naming Conventions
- React components: PascalCase (e.g., `PositionEvolutionChart`)
- Utility functions: camelCase (e.g., `cleanTournamentName`)
- API routes: kebab-case directories (e.g., `app/api/stats/charts/temporal/`)

---

_Last updated: 2025-04-22_
