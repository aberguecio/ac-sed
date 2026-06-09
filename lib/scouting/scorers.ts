import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import type { ScorersResult, TopScorer } from './types'

export interface ScorersInput {
  acsedTeamId: number
  rivalTeamId: number
  tournamentId: number
  stageId: number
  asOfDate: Date
}

export async function getScorers(input: ScorersInput): Promise<ScorersResult> {
  const [acsedTop, rivalTop] = await Promise.all([
    teamScorers(input.acsedTeamId, input.tournamentId, input.stageId, input.asOfDate),
    teamScorers(input.rivalTeamId, input.tournamentId, input.stageId, input.asOfDate),
  ])
  return {
    acsedTop: acsedTop.top,
    rivalTop: rivalTop.top,
    acsedHHI: acsedTop.hhi,
    rivalHHI: rivalTop.hhi,
  }
}

async function teamScorers(
  teamId: number,
  tournamentId: number,
  stageId: number,
  asOfDate: Date
): Promise<{ top: TopScorer[]; hhi: number }> {
  const matches = await prisma.match.findMany({
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
      goals: {
        select: {
          rosterPlayerId: true,
          scrapedPlayer: { select: { firstName: true, lastName: true, teamId: true } },
          rosterPlayer: { select: { name: true } },
        },
      },
    },
  })

  const counts = new Map<string, number>()
  let teamTotal = 0
  for (const m of matches) {
    for (const g of m.goals) {
      const rosterOwned = g.rosterPlayerId != null && teamId === ACSED_TEAM_ID
      const scrapedOwned = g.scrapedPlayer?.teamId === teamId
      if (!rosterOwned && !scrapedOwned) continue
      const name = g.rosterPlayer?.name
        ?? (g.scrapedPlayer
          ? `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`.trim()
          : null)
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
      teamTotal++
    }
  }

  const arr: TopScorer[] = Array.from(counts.entries())
    .map(([playerName, goals]) => ({
      playerName,
      goals,
      share: teamTotal > 0 ? goals / teamTotal : 0,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 3)

  // Herfindahl–Hirschman index: sum of squared shares across all scorers.
  let hhi = 0
  if (teamTotal > 0) {
    for (const goals of counts.values()) {
      const s = goals / teamTotal
      hhi += s * s
    }
  }

  return { top: arr, hhi }
}
