import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import type { CommonOpponentRow, CommonOpponentsResult } from './types'
import { WEIGHTS } from './weights'
import { recencyWeight, weightedMean } from './utils'

export interface CommonOpponentsInput {
  rivalTeamId: number
  asOfDate: Date
  currentStageId: number | null
  teamAId?: number // defaults to AC SED
}

export interface MatchVsOpponent {
  opponentId: number
  opponentName: string
  gd: number // from team's perspective
  outcome: number // +1 W, 0 D, -1 L
  weight: number
}

export async function getCommonOpponents(input: CommonOpponentsInput): Promise<CommonOpponentsResult> {
  const { rivalTeamId, asOfDate, currentStageId } = input
  const teamAId = input.teamAId ?? ACSED_TEAM_ID

  const acsedMatches = await loadTeamMatches(teamAId, asOfDate, currentStageId)
  const rivalMatches = await loadTeamMatches(rivalTeamId, asOfDate, currentStageId)

  // Exclude direct H2H from this analysis: we already account for it separately.
  const acsedFiltered = acsedMatches.filter((m) => m.opponentId !== rivalTeamId)
  const rivalFiltered = rivalMatches.filter((m) => m.opponentId !== teamAId)

  const acsedByOpp = groupByOpponent(acsedFiltered)
  const rivalByOpp = groupByOpponent(rivalFiltered)

  const commonIds = new Set<number>()
  for (const id of acsedByOpp.keys()) {
    if (rivalByOpp.has(id)) commonIds.add(id)
  }

  const opponents: CommonOpponentRow[] = []
  for (const oppId of commonIds) {
    const acsedAgainst = acsedByOpp.get(oppId)!
    const rivalAgainst = rivalByOpp.get(oppId)!
    const opponentName = acsedAgainst[0]?.opponentName ?? rivalAgainst[0]?.opponentName ?? `Team ${oppId}`

    const acsedGD = weightedMean(acsedAgainst.map((m) => ({ value: m.gd, weight: m.weight })))
    const rivalGD = weightedMean(rivalAgainst.map((m) => ({ value: m.gd, weight: m.weight })))
    const acsedOutcome = weightedMean(acsedAgainst.map((m) => ({ value: m.outcome, weight: m.weight })))
    const rivalOutcome = weightedMean(rivalAgainst.map((m) => ({ value: m.outcome, weight: m.weight })))

    // Combined weight for the row: how much we trust this comparison (geometric mean of sums).
    const acsedWSum = acsedAgainst.reduce((a, m) => a + m.weight, 0)
    const rivalWSum = rivalAgainst.reduce((a, m) => a + m.weight, 0)
    const rowWeight = Math.sqrt(acsedWSum * rivalWSum)

    opponents.push({
      opponentId: oppId,
      opponentName,
      acsedGD,
      rivalGD,
      gdDelta: acsedGD - rivalGD,
      acsedOutcome,
      rivalOutcome,
      outcomeDelta: acsedOutcome - rivalOutcome,
      weight: rowWeight,
      acsedSamples: acsedAgainst.length,
      rivalSamples: rivalAgainst.length,
    })
  }

  // Sort by absolute outcome delta first (qualitative winner/loser difference),
  // then GD delta as secondary tiebreaker.
  opponents.sort(
    (a, b) =>
      Math.abs(b.outcomeDelta) * b.weight + Math.abs(b.gdDelta) * b.weight * 0.3 -
      (Math.abs(a.outcomeDelta) * a.weight + Math.abs(a.gdDelta) * a.weight * 0.3)
  )

  const meanGdDelta =
    opponents.length === 0 ? 0 : opponents.reduce((a, o) => a + o.gdDelta, 0) / opponents.length
  const weightedMeanGdDelta = weightedMean(
    opponents.map((o) => ({ value: o.gdDelta, weight: o.weight }))
  )
  const weightedMeanOutcomeDelta = weightedMean(
    opponents.map((o) => ({ value: o.outcomeDelta, weight: o.weight }))
  )

  return {
    opponents,
    meanGdDelta,
    weightedMeanGdDelta,
    weightedMeanOutcomeDelta,
    totalCommonOpponents: opponents.length,
  }
}

export async function loadTeamMatches(
  teamId: number,
  asOfDate: Date,
  currentStageId: number | null
): Promise<MatchVsOpponent[]> {
  const matches = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      date: true,
      stageId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  })

  const out: MatchVsOpponent[] = []
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId
    const opponentId = (isHome ? m.awayTeamId : m.homeTeamId) ?? null
    const opponentName = (isHome ? m.awayTeam?.name : m.homeTeam?.name) ?? null
    if (opponentId == null || opponentName == null) continue

    const gf = (isHome ? m.homeScore : m.awayScore) ?? 0
    const ga = (isHome ? m.awayScore : m.homeScore) ?? 0
    const gd = gf - ga
    const outcome = gf > ga ? 1 : gf < ga ? -1 : 0

    const baseWeight = recencyWeight(m.date, asOfDate)
    const weight =
      currentStageId !== null && m.stageId === currentStageId
        ? baseWeight * WEIGHTS.currentPhaseBoost
        : baseWeight

    out.push({ opponentId, opponentName, gd, outcome, weight })
  }
  return out
}

function groupByOpponent(matches: MatchVsOpponent[]): Map<number, MatchVsOpponent[]> {
  const map = new Map<number, MatchVsOpponent[]>()
  for (const m of matches) {
    if (!map.has(m.opponentId)) map.set(m.opponentId, [])
    map.get(m.opponentId)!.push(m)
  }
  return map
}
