# Liga B API Documentation

Base URL: `https://api.ligab.cl/v1`

## Index
- [Leagues and Tournaments](#leagues-and-tournaments)
- [Matches](#matches)
- [Teams](#teams)
- [Players](#players)
- [Referees](#referees)
- [Suspensions](#suspensions)
- [Standings](#standings)
- [Top Scorers](#top-scorers)

## Detected Endpoints

### 1. List Leagues
```
GET /v1/leagues
```
Returns all available leagues.

### 2. Get Specific League
```
GET /v1/leagues/{leagueId}
```
Example: `GET /v1/leagues/24`

Returns Liga B information (ID: 24).

### 3. Get League Tournaments
```
GET /v1/leagues/{leagueId}/tournaments?filter={"include":[{"relation":"stages"}]}
```
Example: `GET /v1/leagues/24/tournaments?filter={"include":[{"relation":"stages"}]}`

**Returns:**
- List of tournaments from 2020 to present
- Each tournament includes:
  - `id`: Tournament ID
  - `name`: Name (e.g., "Apertura 2026")
  - `isActive`: Whether it's currently active
  - `stages`: Array of tournament stages
    - `id`: Stage ID
    - `name`: Stage name
    - `isActive`: Whether the stage is active

**Current Active Tournament:** ID 201 (Liga B + Lunes, Apertura 2026 Rinconada)
**Active Stage:** ID 396 (Fase 1)

### 4. Get Stage Groups
```
GET /v1/stages/{stageId}/groups
```
Example: `GET /v1/stages/396/groups`

**Returns:**
Array of groups/divisions:
```json
[
  {
    "id": 2295,
    "name": "División Odin",
    "stageId": 396
  },
  {
    "id": 2299,
    "name": "División Thor",
    "stageId": 396
  }
]
```

### 5. Get Group Standings
```
GET /v1/groups/{groupId}/standings
```
Example: `GET /v1/groups/2303/standings`

**Returns:**
Array with standings:
```json
[
  {
    "team": {
      "id": 3020,
      "name": "La Banda Marciana",
      "teamLogoUrl": "..."
    },
    "points": 0,
    "played": 0,
    "won": 0,
    "drawn": 0,
    "lost": 0,
    "goalsFor": 0,
    "goalsAgainst": 0,
    "goalDifference": 0
  }
]
```

### 6. Get Stage Match Days and Matches
```
GET /v1/stages/{stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}]}}]}
```
Example: `GET /v1/stages/396/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}]}}]}`

**Returns:**
Array of match-days, each with its array of matches:

**IMPORTANT:** To get the complete match date/time:
- `matchDay.date` contains the **day date** (`"2026-04-13T00:00:00.000Z"`)
- `match.matchSchedule.schedule` contains only the **time** (`"20:00"`)
- `match.grounds` contains the **venue** (`"Cancha 7"`)
- Combine `matchDay.date` + `matchSchedule.schedule` to get the exact match date/time
- Some matches have `matchSchedule: null` when time hasn't been assigned yet
- Some matches have `grounds: null` when venue hasn't been assigned yet

```json
[
  {
    "id": 1763,
    "date": "2026-04-13T00:00:00.000Z",  // ⚠️ Date of this match day
    "matches": [
      {
        "id": 44978,
        "homeTeamId": 2796,
        "awayTeamId": 3031,
        "homeScore": null,
        "awayScore": null,
        "groupId": 2295,
        "grounds": "Cancha 7",
        "homeTeam": {
          "id": 2796,
          "name": "C. S. D. La Trilogía",
          "teamLogoUrl": "..."
        },
        "awayTeam": {
          "id": 3031,
          "name": "Naltagua F.C.",
          "teamLogoUrl": "..."
        },
        "matchSchedule": {
          "id": 7,
          "schedule": "20:00"  // ⚠️ Only time (HH:MM), NOT full date
        },
        "group": {
          "id": 2295,
          "name": "División Odin"
        }
      }
    ]
  }
]
```

### 7. Get Tournament Top Scorers
```
GET /v1/tournaments/{tournamentId}/top-scorers
```
Example: `GET /v1/tournaments/201/top-scorers`

**Returns:**
Array of top scorers (empty if tournament hasn't started):
```json
[
  {
    "player": {
      "name": "Juan Pérez"
    },
    "team": {
      "name": "AC SED"
    },
    "goals": 5
  }
]
```

---

## Teams

### 8. List All Teams
```
GET /v1/teams
```

**Returns:**
```json
[
  {
    "id": 82,
    "name": "The Lat",
    "isActive": true,
    "description": "...",
    "teamLogoUrl": "https://liga-b.nyc3.digitaloceanspaces.com/team/82/50x50_UUID.jpeg",
    "logoMigrated": false
  }
]
```

### Team Logos

Logos are available on DigitalOcean Spaces in two formats:

**1. Without size prefix (Original - 1024x1024):**
```
https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{UUID}.jpeg
```

**2. With size prefix (Resized):**
```
https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{size}_{UUID}.jpeg
```

**Available sizes:**
- No prefix - `1024x1024` - Original/High resolution
- `28x28` - Small
- `48x48` - Medium
- `50x50` - Default (used in teamLogoUrl from API)
- `80x80` - Large

**Example:**
- Team ID: 3020
- UUID: c161d4f3-2ddc-4270-9097-dcea7949c1cb.png
- Available URLs:
  - `https://liga-b.nyc3.digitaloceanspaces.com/team/3020/c161d4f3-2ddc-4270-9097-dcea7949c1cb.png` (1024x1024)
  - `https://liga-b.nyc3.digitaloceanspaces.com/team/3020/28x28_c161d4f3-2ddc-4270-9097-dcea7949c1cb.png`
  - `https://liga-b.nyc3.digitaloceanspaces.com/team/3020/50x50_c161d4f3-2ddc-4270-9097-dcea7949c1cb.png`
  - `https://liga-b.nyc3.digitaloceanspaces.com/team/3020/80x80_c161d4f3-2ddc-4270-9097-dcea7949c1cb.png`

**Note:** The `teamLogoUrl` in API responses returns the URL without prefix (1024x1024). To get specific sizes, add the `{size}_` prefix before the UUID.

**Available filters:**
- `?filter={"limit": 10}` - Limit results
- `?filter={"where": {"isActive": true}}` - Only active teams

### 9. Get Team Details
```
GET /v1/teams/{teamId}
```
Example: `GET /v1/teams/3208`

### 10. Get Team Players
```
GET /v1/teams/{teamId}/players
```
Example: `GET /v1/teams/3208/players`

**Returns:**
```json
[
  {
    "inRoster": true,
    "isCaptain": false,
    "playerId": 27070,
    "teamId": 3208,
    "lastUpdatedAt": "2025-09-08T15:35:42.000Z"
  }
]
```

---

## Players

### 11. List All Players
```
GET /v1/players
```

**Returns:**
```json
[
  {
    "id": 111,
    "firstName": "gonzalo",
    "lastName": "gutierrez",
    "email": "gzgonzalo@gmail.com",
    "run": "17890678-k",
    "dateOfBirth": "1992-01-18T00:00:00.000Z",
    "phone": null,
    "avatarUrl": "...",
    "activationStatus": 1
  }
]
```

**Useful filters:**
- `?filter={"limit": 50}` - Limit quantity
- `?filter={"where": {"activationStatus": 1}}` - Only active players
- `?filter={"include": ["teams"]}` - Include player's teams

### 12. Get Player Details
```
GET /v1/players/{playerId}
```

---

## Matches

### 13. List All Matches
```
GET /v1/matches
```

**Returns:**
List of all matches (can be very large, use filters)

### 14. Get Match Details
```
GET /v1/matches/{matchId}
```
Example: `GET /v1/matches/44978`

**Returns:**
```json
{
  "id": 44978,
  "homeTeamId": 2796,
  "awayTeamId": 3031,
  "matchScheduleId": 7,
  "matchDayId": 1763,
  "homeScore": null,
  "awayScore": null,
  "groupId": 2295,
  "wasWalkover": false,
  "grounds": "Cancha 7",
  "refereeId": 0
}
```

### 15. Get Match Events
```
GET /v1/matches/{matchId}/events
```
Example: `GET /v1/matches/44978/events`

**Returns:**
Array of events (goals, cards, etc.) - empty if no events are recorded

---

## Referees

### 16. List All Referees
```
GET /v1/referees
```

**Returns:**
```json
[
  {
    "id": 1,
    "firstName": "Alexandra",
    "lastName": "Gallegos",
    "refereeAssociationId": 2,
    "photo": "ale.png",
    "photoDir": "1"
  }
]
```

---

## Suspensions

### 17. Get Tournament Suspensions
```
GET /v1/tournaments/{tournamentId}/suspensions
```
Example: `GET /v1/tournaments/201/suspensions`

**Returns:**
Array of suspended players (empty if no active suspensions)

---

## Advanced Filters

The API uses LoopBack, which supports complex JSON filters:

### Filter Examples:

**Limit results:**
```
?filter={"limit": 10, "skip": 20}
```

**Include relations:**
```
?filter={"include": [{"relation": "homeTeam"}, {"relation": "awayTeam"}]}
```

**Filter by conditions:**
```
?filter={"where": {"isActive": true, "name": {"like": "AC SED"}}}
```

**Sort:**
```
?filter={"order": "createdAt DESC"}
```

---

## Recommended Scraping Flow

1. Get tournaments: `/v1/leagues/24/tournaments?filter={"include":[{"relation":"stages"}]}`
2. Identify active tournament (`isActive: true`)
3. Identify active stage within tournament
4. Get stage groups: `/v1/stages/{stageId}/groups`
5. For each group, get standings: `/v1/groups/{groupId}/standings`
6. Get all matches: `/v1/stages/{stageId}/match-days?filter=...`
7. Get top scorers: `/v1/tournaments/{tournamentId}/top-scorers`
8. Get suspensions: `/v1/tournaments/{tournamentId}/suspensions`

## Historical Data

The API maintains data since 2020. When running the scraper weekly:
- **First time**: Imports all matches from active tournament
- **Subsequent**: Updates existing match results and detects new matches
- Only generates news for new AC SED matches

## Additional Available Endpoints

These endpoints exist but require more exploration:
- `/v1/teams/{teamId}/matches` - Matches for a specific team
- `/v1/players/{playerId}/stats` - Player statistics (possible)
- `/v1/tournaments/{tournamentId}/stats` - Tournament statistics (possible)
