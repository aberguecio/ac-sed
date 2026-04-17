import { prisma } from './db'

// Sincroniza goles/tarjetas de MatchGoal/MatchCard hacia PlayerMatch agregado por partido.
// Solo procesa eventos con rosterPlayerId no nulo (linkeados a un Player del roster).
//
// Regla de red card: true si existe cualquier MatchCard con cardType='red' O si yellowCards >= 2.
// No sobreescribe attendanceStatus/rating/notes (data manual).
// Si no existe PlayerMatch para (playerId, matchId), se crea con attendanceStatus=CONFIRMED
// (lógica: si anotó gol o recibió tarjeta, estuvo).
export async function syncPlayerMatchEventsForMatch(matchId: number): Promise<{
  updated: number
  created: number
  skipped: number
}> {
  const [goals, cards] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId, rosterPlayerId: { not: null } },
      select: { rosterPlayerId: true },
    }),
    prisma.matchCard.findMany({
      where: { matchId, rosterPlayerId: { not: null } },
      select: { rosterPlayerId: true, cardType: true },
    }),
  ])

  const agg = new Map<number, { goals: number; yellowCards: number; hasRed: boolean }>()

  for (const g of goals) {
    const id = g.rosterPlayerId as number
    const entry = agg.get(id) ?? { goals: 0, yellowCards: 0, hasRed: false }
    entry.goals += 1
    agg.set(id, entry)
  }

  for (const c of cards) {
    const id = c.rosterPlayerId as number
    const entry = agg.get(id) ?? { goals: 0, yellowCards: 0, hasRed: false }
    if (c.cardType === 'yellow') entry.yellowCards += 1
    if (c.cardType === 'red') entry.hasRed = true
    agg.set(id, entry)
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
        yellowCards: yellow,
        redCard: red,
      },
      update: {
        goals: stats.goals,
        yellowCards: yellow,
        redCard: red,
      },
    })

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1
    else updated += 1
  }

  return { updated, created, skipped }
}
