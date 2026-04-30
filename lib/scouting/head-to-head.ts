import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import type { H2HMatch, HeadToHeadResult, MatchLite } from './types'
import { WEIGHTS } from './weights'
import { recencyWeight, weightedMean } from './utils'

export interface H2HInput {
  rivalTeamId: number
  asOfDate: Date
  currentStageId: number | null
  teamAId?: number // defaults to AC SED
}

/**
 * Direct head-to-head between team A (AC SED by default) and a rival, weighted by recency.
 * Matches in the active stage get an extra boost.
 */
export async function getHeadToHead(input: H2HInput): Promise<HeadToHeadResult> {
  const { rivalTeamId, asOfDate, currentStageId } = input
  const teamAId = input.teamAId ?? ACSED_TEAM_ID

  const matches = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [
        { homeTeamId: teamAId, awayTeamId: rivalTeamId },
        { homeTeamId: rivalTeamId, awayTeamId: teamAId },
      ],
    },
    select: {
      id: true,
      date: true,
      tournamentId: true,
      stageId: true,
      groupId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
    orderBy: { date: 'desc' },
  })

  const enriched: H2HMatch[] = matches.map((m: MatchLite) => {
    const acsedIsHome = m.homeTeamId === teamAId
    const acsedScore = (acsedIsHome ? m.homeScore : m.awayScore) ?? 0
    const rivalScore = (acsedIsHome ? m.awayScore : m.homeScore) ?? 0
    const result: 'W' | 'D' | 'L' =
      acsedScore > rivalScore ? 'W' : acsedScore < rivalScore ? 'L' : 'D'
    const isCurrentPhase = currentStageId !== null && m.stageId === currentStageId
    const baseWeight = recencyWeight(m.date, asOfDate)
    const weight = isCurrentPhase ? baseWeight * WEIGHTS.currentPhaseBoost : baseWeight
    return {
      matchId: m.id,
      date: m.date,
      acsedScore,
      rivalScore,
      result,
      weight,
      isCurrentPhase,
    }
  })

  const sampleSize = enriched.length
  const weightedSampleSize = enriched.reduce((acc, m) => acc + m.weight, 0)

  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      weightedSampleSize: 0,
      winRate: 0,
      drawRate: 0,
      lossRate: 0,
      avgGD: 0,
      weightedScore: 0,
      matches: [],
    }
  }

  const wins = enriched.filter((m) => m.result === 'W').reduce((a, m) => a + m.weight, 0)
  const draws = enriched.filter((m) => m.result === 'D').reduce((a, m) => a + m.weight, 0)
  const losses = enriched.filter((m) => m.result === 'L').reduce((a, m) => a + m.weight, 0)

  const winRate = wins / weightedSampleSize
  const drawRate = draws / weightedSampleSize
  const lossRate = losses / weightedSampleSize

  const avgGD = weightedMean(
    enriched.map((m) => ({ value: m.acsedScore - m.rivalScore, weight: m.weight }))
  )

  // Score in [-1, 1]: each W contributes +1, D 0, L -1, weighted.
  const weightedScore = weightedMean(
    enriched.map((m) => ({
      value: m.result === 'W' ? 1 : m.result === 'L' ? -1 : 0,
      weight: m.weight,
    }))
  )

  return {
    sampleSize,
    weightedSampleSize,
    winRate,
    drawRate,
    lossRate,
    avgGD,
    weightedScore,
    matches: enriched,
  }
}
