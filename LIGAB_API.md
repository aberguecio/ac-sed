# Liga B API Documentation

Base URL: `https://api.ligab.cl/v1`

## Índice
- [Ligas y Torneos](#ligas-y-torneos)
- [Partidos](#partidos)
- [Equipos](#equipos)
- [Jugadores](#jugadores)
- [Árbitros](#árbitros)
- [Suspensiones](#suspensiones)
- [Tabla de Posiciones](#tabla-de-posiciones)
- [Goleadores](#goleadores)

## Endpoints Detectados

### 1. Listar Ligas
```
GET /v1/leagues
```
Retorna todas las ligas disponibles.

### 2. Obtener Liga Específica
```
GET /v1/leagues/{leagueId}
```
Ejemplo: `GET /v1/leagues/24`

Retorna información de la Liga B (ID: 24).

### 3. Obtener Torneos de una Liga
```
GET /v1/leagues/{leagueId}/tournaments?filter={"include":[{"relation":"stages"}]}
```
Ejemplo: `GET /v1/leagues/24/tournaments?filter={"include":[{"relation":"stages"}]}`

**Retorna:**
- Lista de torneos desde 2020 hasta presente
- Cada torneo incluye:
  - `id`: ID del torneo
  - `name`: Nombre (ej: "Apertura 2026")
  - `isActive`: Si está activo actualmente
  - `stages`: Array de fases del torneo
    - `id`: ID de la fase
    - `name`: Nombre de la fase
    - `isActive`: Si la fase está activa

**Torneo Activo Actual:** ID 201 (Apertura 2026)
**Fase Activa:** ID 396 (Fase 1)

### 4. Obtener Grupos de una Fase
```
GET /v1/stages/{stageId}/groups
```
Ejemplo: `GET /v1/stages/396/groups`

**Retorna:**
Array de grupos/divisiones:
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

### 5. Obtener Tabla de Posiciones de un Grupo
```
GET /v1/groups/{groupId}/standings
```
Ejemplo: `GET /v1/groups/2303/standings`

**Retorna:**
Array con posiciones:
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

### 6. Obtener Fechas y Partidos de una Fase
```
GET /v1/stages/{stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}]}}]}
```
Ejemplo: `GET /v1/stages/396/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}]}}]}`

**Retorna:**
Array de jornadas (match-days), cada una con su array de partidos:

**IMPORTANTE:** Para obtener la fecha/hora completa de un partido:
- `matchDay.date` contiene la **fecha del día** (`"2026-04-13T00:00:00.000Z"`)
- `match.matchSchedule.schedule` contiene solo la **hora** (`"20:00"`)
- Hay que combinar ambos para obtener la fecha/hora exacta del partido
- Algunos partidos tienen `matchSchedule: null` cuando aún no se asigna la hora

```json
[
  {
    "id": 1763,
    "date": "2026-04-13T00:00:00.000Z",  // ⚠️ Fecha del día de esta jornada
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
          "schedule": "20:00"  // ⚠️ Solo hora (HH:MM), NO fecha completa
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

### 7. Obtener Tabla de Goleadores de un Torneo
```
GET /v1/tournaments/{tournamentId}/top-scorers
```
Ejemplo: `GET /v1/tournaments/201/top-scorers`

**Retorna:**
Array de goleadores (vacío si el torneo aún no comenzó):
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

## Equipos

### 8. Listar Todos los Equipos
```
GET /v1/teams
```

**Retorna:**
```json
[
  {
    "id": 82,
    "name": "The Lat",
    "isActive": true,
    "description": "...",
    "teamLogoUrl": "...",
    "logoMigrated": false
  }
]
```

**Filtros disponibles:**
- `?filter={"limit": 10}` - Limitar resultados
- `?filter={"where": {"isActive": true}}` - Solo equipos activos

### 9. Obtener Detalle de un Equipo
```
GET /v1/teams/{teamId}
```
Ejemplo: `GET /v1/teams/3208`

### 10. Obtener Jugadores de un Equipo
```
GET /v1/teams/{teamId}/players
```
Ejemplo: `GET /v1/teams/3208/players`

**Retorna:**
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

## Jugadores

### 11. Listar Todos los Jugadores
```
GET /v1/players
```

**Retorna:**
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

**Filtros útiles:**
- `?filter={"limit": 50}` - Limitar cantidad
- `?filter={"where": {"activationStatus": 1}}` - Solo activos
- `?filter={"include": ["teams"]}` - Incluir equipos del jugador

### 12. Obtener Detalle de un Jugador
```
GET /v1/players/{playerId}
```

---

## Partidos

### 13. Listar Todos los Partidos
```
GET /v1/matches
```

**Retorna:**
Lista de todos los partidos (puede ser muy grande, usar filtros)

### 14. Obtener Detalle de un Partido
```
GET /v1/matches/{matchId}
```
Ejemplo: `GET /v1/matches/44978`

**Retorna:**
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

### 15. Obtener Eventos de un Partido
```
GET /v1/matches/{matchId}/events
```
Ejemplo: `GET /v1/matches/44978/events`

**Retorna:**
Array de eventos (goles, tarjetas, etc.) - vacío si no hay eventos registrados

---

## Árbitros

### 16. Listar Todos los Árbitros
```
GET /v1/referees
```

**Retorna:**
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

## Suspensiones

### 17. Obtener Suspensiones de un Torneo
```
GET /v1/tournaments/{tournamentId}/suspensions
```
Ejemplo: `GET /v1/tournaments/201/suspensions`

**Retorna:**
Array de jugadores suspendidos (vacío si no hay suspensiones activas)

---

## Filtros Avanzados

La API usa LoopBack, que soporta filtros JSON complejos:

### Ejemplos de Filtros:

**Limitar resultados:**
```
?filter={"limit": 10, "skip": 20}
```

**Incluir relaciones:**
```
?filter={"include": [{"relation": "homeTeam"}, {"relation": "awayTeam"}]}
```

**Filtrar por condiciones:**
```
?filter={"where": {"isActive": true, "name": {"like": "AC SED"}}}
```

**Ordenar:**
```
?filter={"order": "createdAt DESC"}
```

---

## Flujo de Scraping Recomendado

1. Obtener torneos: `/v1/leagues/24/tournaments?filter={"include":[{"relation":"stages"}]}`
2. Identificar torneo activo (`isActive: true`)
3. Identificar fase activa dentro del torneo
4. Obtener grupos de la fase: `/v1/stages/{stageId}/groups`
5. Para cada grupo, obtener tabla de posiciones: `/v1/groups/{groupId}/standings`
6. Obtener todos los partidos: `/v1/stages/{stageId}/match-days?filter=...`
7. Obtener goleadores: `/v1/tournaments/{tournamentId}/top-scorers`
8. Obtener suspensiones: `/v1/tournaments/{tournamentId}/suspensions`

## Datos Históricos

La API mantiene datos desde 2020. Al ejecutar el scraper semanalmente:
- **Primera vez**: Importa todos los partidos del torneo activo
- **Subsecuentes**: Actualiza resultados de partidos existentes y detecta nuevos partidos
- Solo genera noticias para partidos nuevos de AC SED

## Endpoints Adicionales Disponibles

Estos endpoints existen pero requieren más exploración:
- `/v1/teams/{teamId}/matches` - Partidos de un equipo específico
- `/v1/players/{playerId}/stats` - Estadísticas de un jugador (posible)
- `/v1/tournaments/{tournamentId}/stats` - Estadísticas del torneo (posible)
