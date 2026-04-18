import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { isACSED, ACSED_TEAM_NAME } from '@/lib/team-utils'
import { getMatchContext } from '@/lib/ai'
import { calculateStandingsUpToDate } from '@/lib/stats-calculator'
import { getTournamentRules } from '@/lib/tournament-config'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

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

async function resolveTeamId(teamId?: number, opponent?: string): Promise<number | null> {
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
    status: z.enum(['played', 'upcoming', 'any']).optional().default('any'),
    teamId: z.number().int().optional(),
    opponent: z.string().optional(),
    year: z.number().int().optional(),
    tournamentId: z.number().int().optional(),
    from: z.string().optional().describe('ISO date inclusive'),
    to: z.string().optional().describe('ISO date inclusive'),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
    order: z.enum(['asc', 'desc']).optional().default('asc'),
  }),
  execute: async ({ status, teamId, opponent, year, tournamentId, from, to, limit, order }) => {
    const where: Record<string, unknown> = {}
    if (tournamentId) where.tournamentId = tournamentId

    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) dateFilter.lte = new Date(to)
    if (year) {
      dateFilter.gte = new Date(Date.UTC(year, 0, 1))
      dateFilter.lte = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
    }
    if (status === 'played') {
      where.homeScore = { not: null }
      if (!from && !to && !year) dateFilter.lte = new Date()
    } else if (status === 'upcoming') {
      if (!from && !to && !year) dateFilter.gt = new Date()
    }
    if (Object.keys(dateFilter).length) where.date = dateFilter

    const focusTeamId = await resolveTeamId(teamId, opponent)
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
      orderBy: { date: order },
      take: limit,
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
    teamId: z.number().int().optional(),
    opponent: z.string().optional(),
  }),
  execute: async ({ teamId, opponent }) => {
    const focus = await resolveTeamId(teamId, opponent)
    if (!focus) return null
    const m = await prisma.match.findFirst({
      where: {
        date: { gt: new Date() },
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
    teamId: z.number().int().optional(),
    opponent: z.string().optional(),
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

export const searchPlayerTool = tool({
  description:
    'Busca jugador del roster por nombre o apodo (fuzzy, case-insensitive). Devuelve id + nombre + apodos. NUNCA expone teléfonos.',
  parameters: z.object({ query: z.string().min(1) }),
  execute: async ({ query }) => {
    const q = query.trim()
    const players = await prisma.player.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { nicknames: { hasSome: [q, q.toLowerCase()] } },
        ],
      },
      select: {
        id: true,
        name: true,
        nicknames: true,
        position: true,
        number: true,
        active: true,
      },
      take: 10,
    })
    return players
  },
})

export const getTopScorersTool = tool({
  description:
    'Goleadores agregados sumando MatchGoal. Filtros: year, tournamentId, teamName (para limitar a un equipo). Default limit 10.',
  parameters: z.object({
    year: z.number().int().optional(),
    tournamentId: z.number().int().optional(),
    teamName: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional().default(10),
  }),
  execute: async ({ year, tournamentId, teamName, limit }) => {
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
      .slice(0, limit)
  },
})

export const getPlayerSeasonStatsTool = tool({
  description:
    'Estadísticas de un jugador del roster (por id) en un año o torneo: goles, partidos jugados, tarjetas. Buscar el id con searchPlayer si solo tienes el nombre.',
  parameters: z.object({
    playerId: z.number().int(),
    year: z.number().int().optional(),
    tournamentId: z.number().int().optional(),
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

export const getTournamentInfoTool = tool({
  description:
    'Devuelve info del torneo (por defecto el activo): nombre, fases, equipos del grupo de AC SED, reglas hardcodeadas (6 equipos, 5 partidos, 2 ascienden, 2 descienden), partidos jugados/restantes en la fase actual.',
  parameters: z.object({ tournamentId: z.number().int().optional() }),
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
    tournamentId: z.number().int().optional(),
    stageId: z.number().int().optional(),
    groupId: z.number().int().optional(),
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
    tournamentId: z.number().int().optional(),
    stageId: z.number().int().optional(),
    groupId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    opponent: z.string().optional(),
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
      date: { gt: new Date() },
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
    tournamentId: z.number().int().optional(),
    stageId: z.number().int().optional(),
    groupId: z.number().int().optional(),
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
  getNextMatch: getNextMatchTool,
  getLastPlayedMatch: getLastPlayedMatchTool,
  searchPlayer: searchPlayerTool,
  getTopScorers: getTopScorersTool,
  getPlayerSeasonStats: getPlayerSeasonStatsTool,
  getHeadToHead: getHeadToHeadTool,
  getTournamentInfo: getTournamentInfoTool,
  getCurrentStandings: getCurrentStandingsTool,
  getRemainingFixtures: getRemainingFixturesTool,
  getPromotionProjection: getPromotionProjectionTool,
}
