import { prisma } from './db'

// Sincroniza goles/asistencias/tarjetas de MatchGoal/MatchCard hacia PlayerMatch agregado por partido.
// Usa rosterPlayerId directamente desde MatchGoal/MatchCard.
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
  const [goals, cards] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId },
      select: { rosterPlayerId: true, assistRosterPlayerId: true },
    }),
    prisma.matchCard.findMany({
      where: { matchId },
      select: { rosterPlayerId: true, cardType: true },
    }),
  ])

  const agg = new Map<number, { goals: number; assists: number; yellowCards: number; hasRed: boolean }>()

  for (const g of goals) {
    // Count goals using rosterPlayerId directly
    if (g.rosterPlayerId) {
      const entry = agg.get(g.rosterPlayerId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
      entry.goals += 1
      agg.set(g.rosterPlayerId, entry)
    }
    // Count assists using assistRosterPlayerId directly
    if (g.assistRosterPlayerId) {
      const entry = agg.get(g.assistRosterPlayerId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
      entry.assists += 1
      agg.set(g.assistRosterPlayerId, entry)
    }
  }

  for (const c of cards) {
    // Use rosterPlayerId directly
    if (c.rosterPlayerId) {
      const entry = agg.get(c.rosterPlayerId) ?? { goals: 0, assists: 0, yellowCards: 0, hasRed: false }
      if (c.cardType === 'yellow') entry.yellowCards += 1
      if (c.cardType === 'red') entry.hasRed = true
      agg.set(c.rosterPlayerId, entry)
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
