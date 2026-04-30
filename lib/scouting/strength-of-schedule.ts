import { prisma } from '@/lib/db'
import type { StrengthOfScheduleResult } from './types'

export interface SoSInput {
  acsedTeamId: number
  rivalTeamId: number
  tournamentId: number
  stageId: number
  groupId: number
  asOfDate: Date
}

/**
 * SoS = mean PPG of opponents already faced in the current phase.
 * PPG is computed using each opponent's standings within this phase, restricted to
 * matches played before asOfDate so the metric is honest for back-testing.
 */
export async function getStrengthOfSchedule(input: SoSInput): Promise<StrengthOfScheduleResult> {
  const phaseMatches = await prisma.match.findMany({
    where: {
      tournamentId: input.tournamentId,
      stageId: input.stageId,
      groupId: input.groupId,
      date: { lt: input.asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  })

  const teamStats = new Map<number, { points: number; played: number }>()
  const recordOpponents = new Map<number, Set<number>>()

  for (const m of phaseMatches) {
    if (m.homeTeamId == null || m.awayTeamId == null) continue
    const hs = m.homeScore ?? 0
    const as = m.awayScore ?? 0

    bumpStats(teamStats, m.homeTeamId, hs > as ? 3 : hs === as ? 1 : 0)
    bumpStats(teamStats, m.awayTeamId, as > hs ? 3 : as === hs ? 1 : 0)

    addOpponent(recordOpponents, m.homeTeamId, m.awayTeamId)
    addOpponent(recordOpponents, m.awayTeamId, m.homeTeamId)
  }

  const ppg = (teamId: number) => {
    const s = teamStats.get(teamId)
    if (!s || s.played === 0) return 0
    return s.points / s.played
  }

  const sosFor = (teamId: number) => {
    const opps = recordOpponents.get(teamId)
    if (!opps || opps.size === 0) return 0
    let sum = 0
    for (const o of opps) sum += ppg(o)
    return sum / opps.size
  }

  const sosACSED = sosFor(input.acsedTeamId)
  const sosRival = sosFor(input.rivalTeamId)
  return { sosACSED, sosRival, diff: sosACSED - sosRival }
}

function bumpStats(map: Map<number, { points: number; played: number }>, teamId: number, points: number) {
  const cur = map.get(teamId) ?? { points: 0, played: 0 }
  cur.points += points
  cur.played += 1
  map.set(teamId, cur)
}

function addOpponent(map: Map<number, Set<number>>, teamId: number, opponentId: number) {
  if (!map.has(teamId)) map.set(teamId, new Set())
  map.get(teamId)!.add(opponentId)
}
