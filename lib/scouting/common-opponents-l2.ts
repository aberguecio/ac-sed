import { ACSED_TEAM_ID } from '@/lib/team-utils'
import { loadTeamMatches } from './common-opponents'
import type {
  CommonOpponentsL2Result,
  CommonOpponentL2Row,
  CommonOpponentsResult,
  SecondaryOpponentRow,
} from './types'
import { weightedMean } from './utils'

export interface CommonOpponentsL2Input {
  commonOpponents: CommonOpponentsResult
  rivalTeamId: number
  asOfDate: Date
  currentStageId: number | null
  teamAId?: number
  topSecondaryPerCommon?: number
}

/**
 * Second-derivative analysis: for each common opponent Y of (A, X),
 * inspect Y's other rivals (excluding A and X) to derive Y's "implied rating"
 * — i.e. how strong does Y look against the rest of the league?
 *
 * This is informational and gets a small predictor weight: when our common
 * opponents are themselves strong (high implied rating), our wins against
 * them carry more meaning, and vice versa.
 */
export async function getCommonOpponentsL2(input: CommonOpponentsL2Input): Promise<CommonOpponentsL2Result> {
  const teamAId = input.teamAId ?? ACSED_TEAM_ID
  const topN = input.topSecondaryPerCommon ?? 5

  const rows: CommonOpponentL2Row[] = []
  let totalSecondary = 0
  let weightedSum = 0
  let totalWeight = 0

  for (const co of input.commonOpponents.opponents) {
    const yMatches = await loadTeamMatches(co.opponentId, input.asOfDate, input.currentStageId)
    // Y's matches against everyone except A and X — those would be first-derivative data.
    const yVsOthers = yMatches.filter(
      (m) => m.opponentId !== teamAId && m.opponentId !== input.rivalTeamId
    )

    if (yVsOthers.length === 0) {
      rows.push({
        yId: co.opponentId,
        yName: co.opponentName,
        yImpliedRating: 0,
        secondaryOpponents: [],
      })
      continue
    }

    // Aggregate by secondary opponent so the same team isn't double-counted.
    const byOpp = new Map<number, { name: string; gds: { value: number; weight: number }[] }>()
    for (const m of yVsOthers) {
      if (!byOpp.has(m.opponentId)) {
        byOpp.set(m.opponentId, { name: m.opponentName, gds: [] })
      }
      byOpp.get(m.opponentId)!.gds.push({ value: m.gd, weight: m.weight })
    }

    const secondaryOpponents: SecondaryOpponentRow[] = Array.from(byOpp.entries())
      .map(([oppId, info]) => {
        const yGD = weightedMean(info.gds)
        const weight = info.gds.reduce((acc, g) => acc + g.weight, 0)
        return { opponentId: oppId, opponentName: info.name, yGD, weight }
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topN)

    const yImpliedRating = weightedMean(
      secondaryOpponents.map((s) => ({ value: s.yGD, weight: s.weight }))
    )

    rows.push({
      yId: co.opponentId,
      yName: co.opponentName,
      yImpliedRating,
      secondaryOpponents,
    })

    totalSecondary += secondaryOpponents.length

    // Aggregate signal: weight each common opponent's L1 delta by Y's strength.
    // Continuous weighting: factor = 1 + rating/10, clamped to [0.5, 1.5].
    // A goal-difference of ±5 reaches the cap; smaller ratings give gentle
    // proportional adjustments (rating -2 → 0.8, +3 → 1.3, etc.).
    // Asymmetry: when Y is weak AND someone failed to beat it, we don't apply
    // the discount — losing/drawing vs a team that loses to everyone is a real
    // red flag and shouldn't be diluted.
    let strengthFactor = 1
    if (yImpliedRating > 0) {
      strengthFactor = Math.min(1.5, 1 + yImpliedRating / 10)
    } else if (yImpliedRating < 0) {
      const bothWon = co.acsedOutcome > 0 && co.rivalOutcome > 0
      strengthFactor = bothWon ? Math.max(0.5, 1 + yImpliedRating / 10) : 1
    }
    weightedSum += co.gdDelta * co.weight * strengthFactor
    totalWeight += co.weight * strengthFactor
  }

  const weightedSecondaryDelta = totalWeight > 0 ? weightedSum / totalWeight : 0

  return {
    rows,
    weightedSecondaryDelta,
    totalSecondaryOpponents: totalSecondary,
  }
}
