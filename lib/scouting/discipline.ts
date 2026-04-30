import { prisma } from '@/lib/db'
import type { DisciplineResult } from './types'

export interface DisciplineInput {
  acsedTeamId: number
  rivalTeamId: number
  tournamentId: number
  stageId: number
  asOfDate: Date
  recentMatchesWindow?: number
}

export async function getDiscipline(input: DisciplineInput): Promise<DisciplineResult> {
  const [acsed, rival] = await Promise.all([
    teamDiscipline(input.acsedTeamId, input.tournamentId, input.stageId, input.asOfDate, input.recentMatchesWindow ?? 3),
    teamDiscipline(input.rivalTeamId, input.tournamentId, input.stageId, input.asOfDate, input.recentMatchesWindow ?? 3),
  ])
  return {
    acsedAvgCards: acsed.avgCards,
    rivalAvgCards: rival.avgCards,
    acsedRecentReds: acsed.recentReds,
    rivalRecentReds: rival.recentReds,
  }
}

async function teamDiscipline(
  teamId: number,
  tournamentId: number,
  stageId: number,
  asOfDate: Date,
  recentMatchesWindow: number
) {
  const phaseMatches = await prisma.match.findMany({
    where: {
      tournamentId,
      stageId,
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      date: true,
      homeTeamId: true,
      cards: { select: { cardType: true, scrapedPlayer: { select: { teamId: true } } } },
    },
    orderBy: { date: 'desc' },
  })

  let totalCards = 0
  for (const m of phaseMatches) {
    for (const c of m.cards) {
      if (c.scrapedPlayer.teamId === teamId) totalCards++
    }
  }
  const avgCards = phaseMatches.length > 0 ? totalCards / phaseMatches.length : 0

  // Recent reds across any tournament, last N matches.
  const recent = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      cards: { select: { cardType: true, scrapedPlayer: { select: { teamId: true } } } },
    },
    orderBy: { date: 'desc' },
    take: recentMatchesWindow,
  })

  let recentReds = 0
  for (const m of recent) {
    for (const c of m.cards) {
      if (c.cardType === 'red' && c.scrapedPlayer.teamId === teamId) recentReds++
    }
  }

  return { avgCards, recentReds }
}
