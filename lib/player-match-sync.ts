import { prisma } from './db'

// Sincroniza goles/asistencias/tarjetas de MatchGoal/MatchCard hacia PlayerMatch agregado por partido.
// Mapea leaguePlayerId a Player.id usando Player.leaguePlayerId.
//
// Regla de red card: true si existe cualquier MatchCard con cardType='red' O si yellowCards >= 2.
// No sobreescribe attendanceStatus/rating/notes (data manual).
// Si no existe PlayerMatch para (playerId, matchId), se crea con attendanceStatus=CONFIRMED
// (lógica: si anotó gol, dio asistencia o recibió tarjeta, estuvo).
export async function syncPlayerMatchEventsForMatch(matchId: number): Promise<{
  updated: number
  created: number
  skipped: number
}> {
  // Get all roster players with leaguePlayerId to map league IDs to roster IDs
  const players = await prisma.player.findMany({
    where: { leaguePlayerId: { not: null } },
    select: { id: true, leaguePlayerId: true },
  })
  const leagueToRoster = new Map(players.map(p => [p.leaguePlayerId!, p.id]))

  const [goals, cards] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId },
      select: { leaguePlayerId: true, assistLeaguePlayerId: true },
    }),
    prisma.matchCard.findMany({
      where: { matchId },
      select: { leaguePlayerId: true, cardType: true },
    }),
  ])

  const agg = new Map<number, { goals: number; assists: number; yellowCards: number; hasRed: boolean }>()

  for (const g of goals) {
    // Count goals - map leaguePlayerId to roster playerId
    const scorerRosterId = leagueToRoster.get(g.leaguePlayerId)
    if (scorerRosterId) {
      const entry = agg.get(scorerRosterId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
      entry.goals += 1
      agg.set(scorerRosterId, entry)
    }
    // Count assists - map assistLeaguePlayerId to roster playerId
    if (g.assistLeaguePlayerId) {
      const assisterRosterId = leagueToRoster.get(g.assistLeaguePlayerId)
      if (assisterRosterId) {
        const entry = agg.get(assisterRosterId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
        entry.assists += 1
        agg.set(assisterRosterId, entry)
      }
    }
  }

  for (const c of cards) {
    // Map leaguePlayerId to roster playerId
    const cardRosterId = leagueToRoster.get(c.leaguePlayerId)
    if (cardRosterId) {
      const entry = agg.get(cardRosterId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
      if (c.cardType === 'yellow') entry.yellowCards += 1
      if (c.cardType === 'red') entry.hasRed = true
      agg.set(cardRosterId, entry)
    }
  }

  let updated = 0
  let created = 0
  const skipped = 0

  for (const [playerId, stats] of agg.entries()) {
    const yellow = Math.min(stats.yellowCards, 2)
    const red = stats.hasRed || yellow === 2

    const result = await prisma.playerMatch.upsert({
      where: { playerId_matchId: { playerId, matchId } },
      create: {
        playerId,
        matchId,
        attendanceStatus: 'CONFIRMED',
        goals: stats.goals,
        assists: stats.assists,
        yellowCards: yellow,
        redCard: red,
      },
      update: {
        goals: stats.goals,
        assists: stats.assists,
        yellowCards: yellow,
        redCard: red,
      },
    })

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1
    else updated += 1
  }

  return { updated, created, skipped }
}
