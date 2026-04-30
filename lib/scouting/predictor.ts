import type {
  CommonOpponentsL2Result,
  CommonOpponentsResult,
  CurrentStandingsResult,
  HeadToHeadResult,
  PredictionResult,
  PythagoreanResult,
  RecentFormResult,
  StrengthOfScheduleResult,
  VolatilityResult,
} from './types'
import { WEIGHTS } from './weights'
import { clamp, logistic } from './utils'

export interface PredictorInput {
  headToHead: HeadToHeadResult
  commonOpponents: CommonOpponentsResult
  commonOpponentsL2: CommonOpponentsL2Result
  recentForm: RecentFormResult
  pythagorean: PythagoreanResult
  strengthOfSchedule: StrengthOfScheduleResult
  volatility: VolatilityResult
  currentStandings: CurrentStandingsResult
}

/**
 * Combines all metrics into a single win probability for AC SED.
 * The model is logistic over normalized features; coefficients live in weights.ts.
 * Draw probability is a fixed slice around the W/L decision boundary.
 */
export function predict(input: PredictorInput): PredictionResult {
  const b = WEIGHTS.beta

  const features = {
    h2hWeightedScore: input.headToHead.weightedScore, // [-1, 1]
    commonOppOutcomeDelta: clamp(input.commonOpponents.weightedMeanOutcomeDelta, -2, 2),
    commonOppGdDelta: clamp(input.commonOpponents.weightedMeanGdDelta, -3, 3),
    commonOppL2Delta: clamp(input.commonOpponentsL2.weightedSecondaryDelta, -3, 3),
    formDiff: input.recentForm.acsed.pointsRatio - input.recentForm.rival.pointsRatio, // [-1, 1]
    pythDiff: input.pythagorean.acsed.expectedWinPct - input.pythagorean.rival.expectedWinPct, // [-1, 1]
    sosDiff: clamp(input.strengthOfSchedule.diff, -3, 3),
    ppgDiff: clamp(input.currentStandings.ppgDiff, -3, 3),
    rivalVolatility: clamp(input.volatility.rivalStdDev, 0, 5),
  }

  const logit =
    b.intercept +
    b.h2hWeightedScore * features.h2hWeightedScore +
    b.commonOppOutcomeDelta * features.commonOppOutcomeDelta +
    b.commonOppGdDelta * features.commonOppGdDelta +
    b.commonOppL2Delta * features.commonOppL2Delta +
    b.formDiff * features.formDiff +
    b.pythDiff * features.pythDiff +
    b.sosDiff * features.sosDiff +
    b.ppgDiff * features.ppgDiff +
    b.rivalVolatilityPenalty * (features.rivalVolatility - 1.5) // centered

  const pWinNoDraw = logistic(logit)

  // Carve out draw probability symmetrically around 0.5.
  const drawSpread = WEIGHTS.drawSpread
  const distFromMid = Math.abs(pWinNoDraw - 0.5)
  // Closer to 0.5 => higher draw share (max = drawSpread when at 0.5).
  const pDraw = drawSpread * Math.max(0, 1 - distFromMid * 2)
  const remaining = 1 - pDraw
  const pWin = pWinNoDraw * remaining
  const pLoss = (1 - pWinNoDraw) * remaining

  // Expected GD: blend common-opponents GD delta and direct H2H avg, scaled by current GD context.
  const expectedGD =
    0.5 * input.commonOpponents.weightedMeanGdDelta +
    0.3 * input.headToHead.avgGD +
    0.2 *
      ((input.currentStandings.acsed?.goalDifference ?? 0) -
        (input.currentStandings.rival?.goalDifference ?? 0)) /
        Math.max(1, input.currentStandings.acsed?.played ?? 1)

  const confidence = computeConfidence(input)

  return {
    pWin,
    pDraw,
    pLoss,
    expectedGD,
    confidence,
    features,
    betas: { ...b },
    intercept: b.intercept,
    logit,
  }
}

function computeConfidence(input: PredictorInput): number {
  const samples =
    input.headToHead.sampleSize +
    input.commonOpponents.totalCommonOpponents +
    Math.min(5, input.commonOpponentsL2.totalSecondaryOpponents) * 0.3
  const sampleScore = clamp(samples / WEIGHTS.confidence.minSamplesForFull, 0, 1)

  // Volatility hurts confidence above a baseline of 1.5 GD stddev.
  const rivalVol = input.volatility.rivalStdDev
  const acsedVol = input.volatility.acsedStdDev
  const volPenalty = WEIGHTS.confidence.volatilityPenalty * Math.max(0, (rivalVol + acsedVol) / 2 - 1.5)

  return clamp(sampleScore - volPenalty, 0, 1)
}
