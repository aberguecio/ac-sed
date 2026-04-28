import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { isACSED, ACSED_TEAM_NAME } from '@/lib/team-utils'
import { getMatchContext } from '@/lib/ai'
import { calculateStandingsUpToDate } from '@/lib/stats-calculator'
import { getTournamentRules } from '@/lib/tournament-config'
import { bestLevenshtein } from '@/lib/string-utils'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const startOfToday = (): Date => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function findActiveTournament() {
  return prisma.tournament.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
    include: {
      stages: { orderBy: { orderIndex: 'desc' } },
    },
  })
}

async function findActiveScope() {
  const tournament = await findActiveTournament()
  if (!tournament) return null
  const stage = tournament.stages[0] ?? null
  if (!stage) return { tournament, stage: null, group: null }
  const acsedGroup = await prisma.group.findFirst({
    where: {
      stageId: stage.id,
      standings: { some: { team: { name: ACSED_TEAM_NAME } } },
    },
  })
  return { tournament, stage, group: acsedGroup }
}

async function resolveTeamId(
  teamId?: number | null,
  opponent?: string | null
): Promise<number | null> {
  if (teamId) return teamId
  if (opponent) {
    const t = await prisma.team.findFirst({
      where: { name: { contains: opponent, mode: 'insensitive' } },
      select: { id: true },
    })
    return t?.id ?? null
  }
  const t = await prisma.team.findFirst({
    where: { name: ACSED_TEAM_NAME },
    select: { id: true },
  })
  return t?.id ?? null
}

function summarizeMatch(m: {
  id: number
  date: Date
  venue: string | null
  roundName: string | null
  homeScore: number | null
  awayScore: number | null
  homeTeam: { name: string } | null
  awayTeam: { name: string } | null
  tournament?: { name: string } | null
}) {
  return {
    id: m.id,
    date: m.date.toISOString(),
    venue: m.venue,
    roundName: m.roundName,
    homeTeam: m.homeTeam?.name ?? 'TBD',
    awayTeam: m.awayTeam?.name ?? 'TBD',
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    played: m.homeScore !== null,
    tournament: m.tournament?.name ?? null,
  }
}

export const listMatchesTool = tool({
  description:
    'Lista partidos con filtros flexibles. Útil para "qué partidos hay/hubo". Por defecto: AC SED, próximos. Filtros: status (played|upcoming|any), opponent (nombre rival), teamId, year, from/to (ISO date), tournamentId, limit.',
  parameters: z.object({
    status: z.enum(['played', 'upcoming', 'any']).nullish(),
    teamId: z.number().int().nullish(),
    opponent: z.string().nullish(),
    year: z.number().int().nullish(),
    tournamentId: z.number().int().nullish(),
    from: z.string().nullish().describe('ISO date inclusive'),
    to: z.string().nullish().describe('ISO date inclusive'),
    limit: z.number().int().min(1).max(MAX_LIMIT).nullish(),
    order: z.enum(['asc', 'desc']).nullish(),
  }),
  execute: async ({ status, teamId, opponent, year, tournamentId, from, to, limit, order }) => {
    const effectiveStatus = status ?? 'any'

    const where: Record<string, unknown> = {}
    if (tournamentId) where.tournamentId = tournamentId

    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) dateFilter.lte = new Date(to)
    if (year) {
      dateFilter.gte = new Date(Date.UTC(year, 0, 1))
      dateFilter.lte = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
    }
    if (effectiveStatus === 'played') {
      where.homeScore = { not: null }
      if (!from && !to && !year) dateFilter.lte = new Date()
    } else if (effectiveStatus === 'upcoming') {
      if (!from && !to && !year) dateFilter.gte = startOfToday()
    }
    if (Object.keys(dateFilter).length) where.date = dateFilter

    const focusTeamId = await resolveTeamId(teamId ?? undefined, opponent ?? undefined)
    if (focusTeamId) {
      where.OR = [{ homeTeamId: focusTeamId }, { awayTeamId: focusTeamId }]
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
      orderBy: { date: order ?? 'asc' },
      take: limit ?? DEFAULT_LIMIT,
    })

    return { count: matches.length, matches: matches.map(summarizeMatch) }
  },
})

export const getMatchByIdTool = tool({
  description: 'Devuelve un partido por id con equipos, fecha, marcador, sede.',
  parameters: z.object({ matchId: z.number().int() }),
  execute: async ({ matchId }) => {
    const m = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    })
    return m ? summarizeMatch(m) : null
  },
})

export const getMatchDetailsTool = tool({
  description:
    'Devuelve TODO el contexto de un partido: goles, tarjetas, partidos previos en la fase, tabla hasta esa fecha, próximos partidos, otros resultados de la jornada e historial vs el rival. Tool "fat" — úsalo cuando necesites contexto rico para narrar.',
  parameters: z.object({ matchId: z.number().int() }),
  execute: async ({ matchId }) => {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    })
    if (!match) return null
    const ctx = await getMatchContext(match)
    return {
      match: summarizeMatch({ ...match, tournament: null }),
      goals: ctx.goals.map(g => ({
        scorer: `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`.trim(),
        team: g.teamName,
        minute: g.minute,
      })),
      cards: ctx.cards.map(c => ({
        player: `${c.scrapedPlayer.firstName} ${c.scrapedPlayer.lastName}`.trim(),
        team: c.teamName,
        type: c.cardType,
        minute: c.minute,
      })),
      previousMatchesInPhase: ctx.previousMatches.map(m =>
        summarizeMatch({ ...m, tournament: null })
      ),
      upcomingMatchesInPhase: ctx.upcomingMatches.map(m =>
        summarizeMatch({ ...m, tournament: null })
      ),
      otherMatchesInRound: ctx.otherMatchesInRound.map(m =>
        summarizeMatch({ ...m, tournament: null })
      ),
      historicalVsOpponent: ctx.historicalMatches.map(m =>
        summarizeMatch({ ...m, tournament: null })
      ),
      standingsAtMatchDate: ctx.standingsRows,
    }
  },
})

export const getMatchGoalsTool = tool({
  description: 'Devuelve los goleadores de un partido (nombre, equipo, minuto).',
  parameters: z.object({ matchId: z.number().int() }),
  execute: async ({ matchId }) => {
    const goals = await prisma.matchGoal.findMany({
      where: { matchId },
      include: { scrapedPlayer: true },
      orderBy: { minute: 'asc' },
    })
    return goals.map(g => ({
      scorer: `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`.trim(),
      team: g.teamName,
      minute: g.minute,
    }))
  },
})

export const getNextMatchTool = tool({
  description: 'Próximo partido (no jugado aún) de AC SED por defecto, o de un equipo dado.',
  parameters: z.object({
    teamId: z.number().int().nullish(),
    opponent: z.string().nullish(),
  }),
  execute: async ({ teamId, opponent }) => {
    const focus = await resolveTeamId(teamId, opponent)
    if (!focus) return null
    const m = await prisma.match.findFirst({
      where: {
        date: { gte: startOfToday() },
        OR: [{ homeTeamId: focus }, { awayTeamId: focus }],
      },
      orderBy: { date: 'asc' },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    })
    return m ? summarizeMatch(m) : null
  },
})

export const getLastPlayedMatchTool = tool({
  description: 'Último partido jugado (con marcador) de AC SED por defecto, o de un equipo dado.',
  parameters: z.object({
    teamId: z.number().int().nullish(),
    opponent: z.string().nullish(),
  }),
  execute: async ({ teamId, opponent }) => {
    const focus = await resolveTeamId(teamId, opponent)
    if (!focus) return null
    const m = await prisma.match.findFirst({
      where: {
        homeScore: { not: null },
        OR: [{ homeTeamId: focus }, { awayTeamId: focus }],
      },
      orderBy: { date: 'desc' },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
    })
    return m ? summarizeMatch(m) : null
  },
})

export const listRosterTool = tool({
  description:
    'Lista el plantel de AC SED (todos los jugadores del roster). Filtros: position, activeOnly. NUNCA devuelve teléfonos. Útil cuando te preguntan "quiénes son los jugadores", "qué arqueros hay", "cuántos somos", etc.',
  parameters: z.object({
    position: z.string().nullish().describe('Filtrar por posición exacta (arquero, defensa, mediocampista, delantero…).'),
    activeOnly: z.boolean().nullish().describe('Si true, solo jugadores activos. Default true.'),
  }),
  execute: async ({ position, activeOnly }) => {
    const where: Record<string, unknown> = {}
    if (position) where.position = { equals: position, mode: 'insensitive' }
    if (activeOnly !== false) where.active = true

    const players = await prisma.player.findMany({
      where,
      select: {
        id: true,
        name: true,
        nicknames: true,
        position: true,
        number: true,
        active: true,
      },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    })
    return { count: players.length, players }
  },
})

export const getMatchAttendanceTool = tool({
  description:
    'Devuelve la asistencia de AC SED a un partido (por matchId): listas de jugadores confirmados, llega tarde, de visita, declinaron, no_show y pendientes (sin responder). Cada jugador tiene name, nicknames, position, number. NUNCA devuelve teléfonos. Útil para "quiénes van al partido del sábado", "cuántos confirmaron", etc.',
  parameters: z.object({ matchId: z.number().int() }),
  execute: async ({ matchId }) => {
    const rows = await prisma.playerMatch.findMany({
      where: { matchId },
      select: {
        attendanceStatus: true,
        player: {
          select: {
            id: true,
            name: true,
            nicknames: true,
            position: true,
            number: true,
            active: true,
          },
        },
      },
    })

    const buckets: Record<string, Array<typeof rows[number]['player']>> = {
      confirmed: [],
      late: [],
      visiting: [],
      declined: [],
      noShow: [],
      pending: [],
    }
    const statusToBucket: Record<string, keyof typeof buckets> = {
      CONFIRMED: 'confirmed',
      LATE: 'late',
      VISITING: 'visiting',
      DECLINED: 'declined',
      NO_SHOW: 'noShow',
      PENDING: 'pending',
    }

    for (const r of rows) {
      const bucket = statusToBucket[r.attendanceStatus]
      if (bucket) buckets[bucket].push(r.player)
    }

    const sortByNumber = (a: { number: number | null }, b: { number: number | null }) =>
      (a.number ?? 9999) - (b.number ?? 9999)
    for (const k of Object.keys(buckets)) buckets[k].sort(sortByNumber)

    const attendingCount = buckets.confirmed.length + buckets.late.length + buckets.visiting.length
    return {
      matchId,
      counts: {
        confirmed: buckets.confirmed.length,
        late: buckets.late.length,
        visiting: buckets.visiting.length,
        declined: buckets.declined.length,
        noShow: buckets.noShow.length,
        pending: buckets.pending.length,
        attending: attendingCount,
        total: rows.length,
      },
      ...buckets,
    }
  },
})

const PLAYER_SELECT = {
  id: true,
  name: true,
  nicknames: true,
  position: true,
  number: true,
  active: true,
  bio: true,
  phoneNumber: true,
} as const

const FUZZY_MAX_DISTANCE = 2
const FUZZY_MIN_QUERY_LEN = 3

export const searchPlayerTool = tool({
  description:
    'Busca jugador del roster por nombre o apodo. Devuelve id, nombre, apodos, posición, dorsal, bio y phoneNumber. ' +
    'Si phoneNumber no es null, etiqueta al jugador con @{phoneNumber} en tu respuesta (ej: @56991234567). ' +
    'NO menciones el número de teléfono como texto plano.',
  parameters: z.object({ query: z.string().min(1) }),
  execute: async ({ query }) => {
    const q = query.trim()
    const qLower = q.toLowerCase()

    // Phase 1: exact substring / array match via DB index (fast path)
    let players = await prisma.player.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { nicknames: { hasSome: [q, qLower] } },
        ],
      },
      select: PLAYER_SELECT,
      take: 10,
    })

    // Phase 2: fuzzy fallback — full roster scan with Levenshtein distance
    if (players.length === 0 && q.length >= FUZZY_MIN_QUERY_LEN) {
      const all = await prisma.player.findMany({ select: PLAYER_SELECT })

      players = all
        .filter(p => {
          const nameTokens = p.name.toLowerCase().split(/\s+/)
          return bestLevenshtein(qLower, [...nameTokens, ...p.nicknames]) <= FUZZY_MAX_DISTANCE
        })
        .sort((a, b) => {
          const tokensA = [...a.name.toLowerCase().split(/\s+/), ...a.nicknames]
          const tokensB = [...b.name.toLowerCase().split(/\s+/), ...b.nicknames]
          return bestLevenshtein(qLower, tokensA) - bestLevenshtein(qLower, tokensB)
        })
        .slice(0, 10)
    }

    return players
  },
})

export const getTopScorersTool = tool({
  description:
    'Goleadores agregados sumando MatchGoal. Filtros: year, tournamentId, teamName (para limitar a un equipo). Default limit 10.',
  parameters: z.object({
    year: z.number().int().nullish(),
    tournamentId: z.number().int().nullish(),
    teamName: z.string().nullish(),
    limit: z.number().int().min(1).max(50).nullish(),
  }),
  execute: async ({ year, tournamentId, teamName, limit }) => {
    const effectiveLimit = limit ?? 10
    const matchWhere: Record<string, unknown> = { homeScore: { not: null } }
    if (tournamentId) matchWhere.tournamentId = tournamentId
    if (year) {
      matchWhere.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      }
    }
    const matchIds = (
      await prisma.match.findMany({ where: matchWhere, select: { id: true } })
    ).map(m => m.id)
    if (matchIds.length === 0) return []

    const goalWhere: Record<string, unknown> = { matchId: { in: matchIds } }
    if (teamName) goalWhere.teamName = { contains: teamName, mode: 'insensitive' }

    const goals = await prisma.matchGoal.findMany({
      where: goalWhere,
      include: { scrapedPlayer: true },
    })

    const acc = new Map<string, { player: string; team: string; goals: number }>()
    for (const g of goals) {
      const player = `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`.trim()
      const key = `${player}::${g.teamName}`
      const existing = acc.get(key)
      if (existing) existing.goals++
      else acc.set(key, { player, team: g.teamName, goals: 1 })
    }
    return Array.from(acc.values())
      .sort((a, b) => b.goals - a.goals)
      .slice(0, effectiveLimit)
  },
})

export const getPlayerSeasonStatsTool = tool({
  description:
    'Estadísticas de un jugador del roster (por id) en un año o torneo: goles, partidos jugados, tarjetas. Buscar el id con searchPlayer si solo tienes el nombre.',
  parameters: z.object({
    playerId: z.number().int(),
    year: z.number().int().nullish(),
    tournamentId: z.number().int().nullish(),
  }),
  execute: async ({ playerId, year, tournamentId }) => {
    const matchWhere: Record<string, unknown> = { homeScore: { not: null } }
    if (tournamentId) matchWhere.tournamentId = tournamentId
    if (year) {
      matchWhere.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      }
    }
    const matches = await prisma.match.findMany({ where: matchWhere, select: { id: true } })
    const matchIds = matches.map(m => m.id)

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, nicknames: true, leaguePlayerId: true },
    })
    if (!player) return null

    const playerOr: Record<string, unknown>[] = [{ rosterPlayerId: playerId }]
    if (player.leaguePlayerId) playerOr.push({ leaguePlayerId: player.leaguePlayerId })

    const [goalsCount, appearances, yellowCards, redCards] = await Promise.all([
      prisma.matchGoal.count({
        where: { matchId: { in: matchIds }, OR: playerOr },
      }),
      prisma.playerMatch.count({
        where: {
          playerId,
          matchId: { in: matchIds },
          attendanceStatus: { in: ['CONFIRMED', 'LATE', 'VISITING'] },
        },
      }),
      prisma.matchCard.count({
        where: { matchId: { in: matchIds }, cardType: 'yellow', OR: playerOr },
      }),
      prisma.matchCard.count({
        where: { matchId: { in: matchIds }, cardType: 'red', OR: playerOr },
      }),
    ])

    return {
      player: { id: player.id, name: player.name, nicknames: player.nicknames },
      scope: { year: year ?? null, tournamentId: tournamentId ?? null },
      goals: goalsCount,
      appearances,
      yellowCards,
      redCards,
    }
  },
})

export const getTeamCardsTool = tool({
  description:
    'Tarjetas (amarillas y rojas) de los jugadores de un equipo (por nombre), opcionalmente filtradas por fecha. Devuelve, por jugador: total amarillas, total rojas, tarjetas recientes (partido, minuto, tipo) y si la tarjeta más reciente fue roja o segunda amarilla (candidato a suspensión en la próxima fecha). Útil para "quién está suspendido en el rival" o "cómo viene el rival de tarjetas".',
  parameters: z.object({
    teamName: z.string().min(1),
    sinceDate: z.string().nullish().describe('ISO date — solo tarjetas de partidos jugados >= esta fecha.'),
    limit: z.number().int().min(1).max(MAX_LIMIT).nullish(),
  }),
  execute: async ({ teamName, sinceDate, limit }) => {
    const matchWhere: Record<string, unknown> = { homeScore: { not: null } }
    if (sinceDate) matchWhere.date = { gte: new Date(sinceDate) }

    const matchIds = (
      await prisma.match.findMany({ where: matchWhere, select: { id: true } })
    ).map(m => m.id)
    if (matchIds.length === 0) return { teamName, players: [] }

    const cards = await prisma.matchCard.findMany({
      where: {
        matchId: { in: matchIds },
        teamName: { contains: teamName, mode: 'insensitive' },
      },
      include: {
        scrapedPlayer: true,
        match: {
          select: {
            id: true,
            date: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
      orderBy: { match: { date: 'desc' } },
      take: limit ?? MAX_LIMIT,
    })

    type Bucket = {
      player: string
      yellowCards: number
      redCards: number
      cards: Array<{
        matchId: number
        date: string
        opponent: string
        type: string
        minute: number | null
      }>
      lastCardType: string | null
      lastCardDate: string | null
    }
    const byPlayer = new Map<number, Bucket>()
    for (const c of cards) {
      const key = c.leaguePlayerId
      const name = `${c.scrapedPlayer.firstName} ${c.scrapedPlayer.lastName}`.trim()
      const homeName = c.match.homeTeam?.name ?? 'TBD'
      const awayName = c.match.awayTeam?.name ?? 'TBD'
      const isHome = homeName.toLowerCase().includes(teamName.toLowerCase())
      const opponent = isHome ? awayName : homeName
      const dateIso = c.match.date.toISOString()
      let b = byPlayer.get(key)
      if (!b) {
        b = {
          player: name,
          yellowCards: 0,
          redCards: 0,
          cards: [],
          lastCardType: null,
          lastCardDate: null,
        }
        byPlayer.set(key, b)
      }
      if (c.cardType === 'red') b.redCards++
      else if (c.cardType === 'yellow') b.yellowCards++
      b.cards.push({
        matchId: c.matchId,
        date: dateIso,
        opponent,
        type: c.cardType,
        minute: c.minute,
      })
      if (!b.lastCardDate || dateIso > b.lastCardDate) {
        b.lastCardDate = dateIso
        b.lastCardType = c.cardType
      }
    }

    const players = Array.from(byPlayer.values())
      .map(b => {
        const yellowsInLastMatch = b.cards.filter(
          c => c.date === b.lastCardDate && c.type === 'yellow'
        ).length
        const likelySuspendedNextMatch =
          b.lastCardType === 'red' || yellowsInLastMatch >= 2
        return { ...b, likelySuspendedNextMatch }
      })
      .sort((a, b) => b.redCards * 10 + b.yellowCards - (a.redCards * 10 + a.yellowCards))

    return { teamName, count: players.length, players }
  },
})

export const getHeadToHeadTool = tool({
  description: 'Historial de AC SED vs un rival (por nombre): partidos jugados, marcadores y récord.',
  parameters: z.object({ opponent: z.string().min(1) }),
  execute: async ({ opponent }) => {
    const matches = await prisma.match.findMany({
      where: {
        homeScore: { not: null },
        OR: [
          {
            homeTeam: { name: { contains: opponent, mode: 'insensitive' } },
            awayTeam: { name: ACSED_TEAM_NAME },
          },
          {
            awayTeam: { name: { contains: opponent, mode: 'insensitive' } },
            homeTeam: { name: ACSED_TEAM_NAME },
          },
        ],
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })

    let wins = 0, draws = 0, losses = 0
    for (const m of matches) {
      const acsedHome = isACSED(m.homeTeam?.name)
      const our = (acsedHome ? m.homeScore : m.awayScore) ?? 0
      const their = (acsedHome ? m.awayScore : m.homeScore) ?? 0
      if (our > their) wins++
      else if (our < their) losses++
      else draws++
    }

    return {
      record: { played: matches.length, wins, draws, losses },
      matches: matches.map(summarizeMatch),
    }
  },
})

export const listTournamentsTool = tool({
  description:
    'Lista todos los torneos guardados (id, nombre, si está activo, fases, rango de fechas y total de partidos). Útil para mapear "Apertura 2025" o "el torneo pasado" a un tournamentId antes de llamar otras tools.',
  parameters: z.object({
    activeOnly: z.boolean().nullish().describe('Si true, solo torneos con isActive=true.'),
  }),
  execute: async ({ activeOnly }) => {
    const tournaments = await prisma.tournament.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: {
        stages: {
          select: { id: true, name: true, orderIndex: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { id: 'desc' },
    })

    const ranges = await prisma.match.groupBy({
      by: ['tournamentId'],
      _min: { date: true },
      _max: { date: true },
      _count: { _all: true },
    })
    const rangeById = new Map(
      ranges.map(r => [r.tournamentId, {
        firstMatch: r._min.date?.toISOString() ?? null,
        lastMatch: r._max.date?.toISOString() ?? null,
        totalMatches: r._count._all,
      }])
    )

    return {
      count: tournaments.length,
      tournaments: tournaments.map(t => ({
        id: t.id,
        name: t.name,
        isActive: t.isActive,
        stages: t.stages,
        ...(rangeById.get(t.id) ?? { firstMatch: null, lastMatch: null, totalMatches: 0 }),
      })),
    }
  },
})

export const getTournamentInfoTool = tool({
  description:
    'Devuelve info del torneo (por defecto el activo): nombre, fases, equipos del grupo de AC SED, reglas hardcodeadas (6 equipos, 5 partidos, 2 ascienden, 2 descienden), partidos jugados/restantes en la fase actual.',
  parameters: z.object({ tournamentId: z.number().int().nullish() }),
  execute: async ({ tournamentId }) => {
    const tournament = tournamentId
      ? await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: { stages: { orderBy: { orderIndex: 'desc' } } },
        })
      : await findActiveTournament()
    if (!tournament) return null

    const stage = tournament.stages[0] ?? null
    const group = stage
      ? await prisma.group.findFirst({
          where: {
            stageId: stage.id,
            standings: { some: { team: { name: ACSED_TEAM_NAME } } },
          },
          include: {
            standings: {
              include: { team: { select: { id: true, name: true } } },
              orderBy: { position: 'asc' },
            },
          },
        })
      : null

    let played = 0
    let total = 0
    if (stage && group) {
      const counts = await prisma.match.groupBy({
        by: ['homeScore'],
        where: {
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId: group.id,
        },
        _count: { _all: true },
      })
      for (const c of counts) {
        total += c._count._all
        if (c.homeScore !== null) played += c._count._all
      }
    }

    return {
      tournament: { id: tournament.id, name: tournament.name, isActive: tournament.isActive },
      stage: stage ? { id: stage.id, name: stage.name, orderIndex: stage.orderIndex } : null,
      group: group
        ? {
            id: group.id,
            name: group.name,
            teams: group.standings.map(s => ({ id: s.team.id, name: s.team.name })),
          }
        : null,
      rules: getTournamentRules(),
      progress: { played, remaining: total - played, totalScheduled: total },
    }
  },
})

export const getCurrentStandingsTool = tool({
  description:
    'Tabla de posiciones actual del grupo de AC SED (calculada desde los partidos jugados hasta hoy). Si pasas tournamentId/stageId/groupId úsalos; sino, default al grupo activo de AC SED.',
  parameters: z.object({
    tournamentId: z.number().int().nullish(),
    stageId: z.number().int().nullish(),
    groupId: z.number().int().nullish(),
  }),
  execute: async ({ tournamentId, stageId, groupId }) => {
    let scope: { tournamentId: number; stageId: number; groupId: number } | null = null
    if (tournamentId && stageId && groupId) {
      scope = { tournamentId, stageId, groupId }
    } else {
      const active = await findActiveScope()
      if (!active?.stage || !active.group) return null
      scope = { tournamentId: active.tournament.id, stageId: active.stage.id, groupId: active.group.id }
    }
    const rows = await calculateStandingsUpToDate(
      scope.tournamentId,
      scope.stageId,
      scope.groupId,
      new Date()
    )
    return { scope, standings: rows }
  },
})

export const getRemainingFixturesTool = tool({
  description:
    'Lista de partidos pendientes (date > now). Si no se especifica teamId/opponent, devuelve todos los partidos pendientes del grupo activo de AC SED para todos los equipos.',
  parameters: z.object({
    tournamentId: z.number().int().nullish(),
    stageId: z.number().int().nullish(),
    groupId: z.number().int().nullish(),
    teamId: z.number().int().nullish(),
    opponent: z.string().nullish(),
  }),
  execute: async ({ tournamentId, stageId, groupId, teamId, opponent }) => {
    let scopeFilter: Record<string, unknown> = {}
    if (tournamentId) scopeFilter.tournamentId = tournamentId
    if (stageId) scopeFilter.stageId = stageId
    if (groupId) scopeFilter.groupId = groupId
    if (!tournamentId && !stageId && !groupId) {
      const active = await findActiveScope()
      if (active?.tournament) scopeFilter.tournamentId = active.tournament.id
      if (active?.stage) scopeFilter.stageId = active.stage.id
      if (active?.group) scopeFilter.groupId = active.group.id
    }

    const teamFilter = await resolveTeamId(teamId, opponent)
    const where: Record<string, unknown> = {
      ...scopeFilter,
      date: { gte: startOfToday() },
    }
    if (teamId || opponent) {
      if (!teamFilter) return { matches: [] }
      where.OR = [{ homeTeamId: teamFilter }, { awayTeamId: teamFilter }]
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        tournament: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
      take: MAX_LIMIT,
    })
    return { count: matches.length, matches: matches.map(summarizeMatch) }
  },
})

export const getPromotionProjectionTool = tool({
  description:
    'Para cada equipo del grupo activo de AC SED: puntos actuales, partidos restantes, máximo posible (current + 3*restantes), mínimo posible, y rivales pendientes. Útil para razonar "qué necesitamos para ascender/no descender". Reglas del torneo: 6 equipos, todos contra todos (5 partidos), 2 primeros ascienden, 2 últimos descienden.',
  parameters: z.object({
    tournamentId: z.number().int().nullish(),
    stageId: z.number().int().nullish(),
    groupId: z.number().int().nullish(),
  }),
  execute: async ({ tournamentId, stageId, groupId }) => {
    let scope: { tournamentId: number; stageId: number; groupId: number } | null = null
    if (tournamentId && stageId && groupId) {
      scope = { tournamentId, stageId, groupId }
    } else {
      const active = await findActiveScope()
      if (!active?.stage || !active.group) return null
      scope = { tournamentId: active.tournament.id, stageId: active.stage.id, groupId: active.group.id }
    }

    const standings = await calculateStandingsUpToDate(
      scope.tournamentId,
      scope.stageId,
      scope.groupId,
      new Date()
    )

    const remaining = await prisma.match.findMany({
      where: {
        tournamentId: scope.tournamentId,
        stageId: scope.stageId,
        groupId: scope.groupId,
        date: { gt: new Date() },
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    })

    const rules = getTournamentRules()
    const projections = standings.map(row => {
      const teamRemaining = remaining.filter(
        m => m.homeTeam?.name === row.teamName || m.awayTeam?.name === row.teamName
      )
      const remainingCount = teamRemaining.length
      return {
        team: row.teamName,
        position: row.position,
        currentPoints: row.points,
        played: row.won + row.drawn + row.lost,
        matchesRemaining: remainingCount,
        maxPossiblePoints: row.points + 3 * remainingCount,
        minPossiblePoints: row.points,
        remainingOpponents: teamRemaining.map(m => {
          const opp = m.homeTeam?.name === row.teamName ? m.awayTeam?.name : m.homeTeam?.name
          return { opponent: opp ?? 'TBD', date: m.date.toISOString(), matchId: m.id }
        }),
      }
    })

    return {
      scope,
      rules,
      promotionCutoffPosition: rules.promotionSlots,
      relegationStartPosition: rules.teamsPerPhase - rules.relegationSlots + 1,
      projections,
    }
  },
})

export const whatsappAgentTools = {
  listMatches: listMatchesTool,
  getMatchById: getMatchByIdTool,
  getMatchDetails: getMatchDetailsTool,
  getMatchGoals: getMatchGoalsTool,
  getMatchAttendance: getMatchAttendanceTool,
  getNextMatch: getNextMatchTool,
  getLastPlayedMatch: getLastPlayedMatchTool,
  listRoster: listRosterTool,
  searchPlayer: searchPlayerTool,
  getTopScorers: getTopScorersTool,
  getPlayerSeasonStats: getPlayerSeasonStatsTool,
  getHeadToHead: getHeadToHeadTool,
  getTeamCards: getTeamCardsTool,
  listTournaments: listTournamentsTool,
  getTournamentInfo: getTournamentInfoTool,
  getCurrentStandings: getCurrentStandingsTool,
  getRemainingFixtures: getRemainingFixturesTool,
  getPromotionProjection: getPromotionProjectionTool,
}

export {
  WHATSAPP_TOOL_KEYS,
  WHATSAPP_TOOL_DESCRIPTIONS,
  type WhatsappToolKey,
} from '@/lib/ai-whatsapp-tool-keys'

/**
 * Filter the tools dict to only the keys present in `enabled`. Keys not in
 * the registry are ignored. Returns undefined when the result would be
 * empty so callers can pass it to the AI SDK as "no tools".
 */
export function pickEnabledTools(
  enabled: readonly string[],
): Partial<typeof whatsappAgentTools> | undefined {
  const out: Partial<typeof whatsappAgentTools> = {}
  for (const key of enabled) {
    if (key in whatsappAgentTools) {
      // safe by the `in` check
      ;(out as any)[key] = (whatsappAgentTools as any)[key]
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
