import { prisma } from '@/lib/db'
import { getHeadToHead } from './head-to-head'
import { getCommonOpponents } from './common-opponents'
import { getCommonOpponentsL2 } from './common-opponents-l2'
import { teamRecentForm } from './recent-form'
import { getPythagorean } from './pythagorean'
import { getStrengthOfSchedule } from './strength-of-schedule'
import { getVolatility } from './volatility'
import { getCurrentStandings } from './current-standings'
import { predict } from './predictor'
import { WEIGHTS } from './weights'

export interface PairPredictionInput {
  homeTeamId: number
  awayTeamId: number
  tournamentId: number
  stageId: number
  groupId: number
  asOfDate: Date
}

export interface PairPrediction {
  pHomeWin: number
  pDraw: number
  pAwayWin: number
  expectedGD: number // home perspective
  predictedHome: number
  predictedAway: number
  // Transparency: how the score was derived.
  scoreDerivation: {
    homeGFperMatch: number // goals home team usually scores
    homeGAperMatch: number // goals home team usually concedes
    awayGFperMatch: number
    awayGAperMatch: number
    expectedHomeGoals: number // pre-rounding lambda for home
    expectedAwayGoals: number
  }
}

/**
 * Pair predictor: same model as the AC-SED-vs-rival flow but generalized to
 * any (home, away) pair. Feeds all metrics — including L2 second-derivative
 * — into the shared predict() so phase-projection stays consistent with the
 * scouting card on top.
 */
export async function predictPairLite(input: PairPredictionInput): Promise<PairPrediction> {
  const { homeTeamId, awayTeamId, asOfDate, stageId, tournamentId, groupId } = input

  const [
    headToHead,
    commonOpponents,
    formHome,
    formAway,
    pythagorean,
    strengthOfSchedule,
    volatility,
    currentStandings,
    gfRateHome,
    gfRateAway,
  ] = await Promise.all([
    getHeadToHead({ rivalTeamId: awayTeamId, asOfDate, currentStageId: stageId, teamAId: homeTeamId }),
    getCommonOpponents({ rivalTeamId: awayTeamId, asOfDate, currentStageId: stageId, teamAId: homeTeamId }),
    teamRecentForm(homeTeamId, asOfDate, WEIGHTS.recentFormWindow),
    teamRecentForm(awayTeamId, asOfDate, WEIGHTS.recentFormWindow),
    getPythagorean({ acsedTeamId: homeTeamId, rivalTeamId: awayTeamId, tournamentId, stageId, asOfDate }),
    getStrengthOfSchedule({
      acsedTeamId: homeTeamId,
      rivalTeamId: awayTeamId,
      tournamentId,
      stageId,
      groupId,
      asOfDate,
    }),
    getVolatility({ acsedTeamId: homeTeamId, rivalTeamId: awayTeamId, asOfDate }),
    getCurrentStandings({ rivalTeamId: awayTeamId, tournamentId, stageId, groupId, asOfDate, teamAId: homeTeamId }),
    teamGoalRates(homeTeamId, asOfDate),
    teamGoalRates(awayTeamId, asOfDate),
  ])

  const commonOpponentsL2 = await getCommonOpponentsL2({
    commonOpponents,
    rivalTeamId: awayTeamId,
    asOfDate,
    currentStageId: stageId,
    teamAId: homeTeamId,
  })

  const recentForm = { acsed: formHome, rival: formAway, windowSize: WEIGHTS.recentFormWindow }

  const prediction = predict({
    headToHead,
    commonOpponents,
    commonOpponentsL2,
    recentForm,
    pythagorean,
    strengthOfSchedule,
    volatility,
    currentStandings,
  })

  // Poisson-style score derivation: each side's expected goals is the average
  // of (its own scoring rate) and (the opponent's conceding rate). That avoids
  // double-counting that the naive gfHome+gfAway sum produces.
  const baseHome = (gfRateHome.gf + gfRateAway.ga) / 2
  const baseAway = (gfRateAway.gf + gfRateHome.ga) / 2
  const baseGD = baseHome - baseAway

  // Use the model's expectedGD to nudge the Poisson means: if the model thinks
  // the gap is bigger than what raw rates suggest, shift goals from the
  // weaker side to the stronger one (half the residual on each end).
  const residual = prediction.expectedGD - baseGD
  const lambdaHome = Math.max(0, baseHome + residual / 2)
  const lambdaAway = Math.max(0, baseAway - residual / 2)

  const predictedHome = Math.max(0, Math.round(lambdaHome))
  const predictedAway = Math.max(0, Math.round(lambdaAway))

  return {
    pHomeWin: prediction.pWin,
    pDraw: prediction.pDraw,
    pAwayWin: prediction.pLoss,
    expectedGD: prediction.expectedGD,
    predictedHome,
    predictedAway,
    scoreDerivation: {
      homeGFperMatch: gfRateHome.gf,
      homeGAperMatch: gfRateHome.ga,
      awayGFperMatch: gfRateAway.gf,
      awayGAperMatch: gfRateAway.ga,
      expectedHomeGoals: lambdaHome,
      expectedAwayGoals: lambdaAway,
    },
  }
}

async function teamGoalRates(teamId: number, asOfDate: Date): Promise<{ gf: number; ga: number }> {
  const matches = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: { homeTeamId: true, homeScore: true, awayScore: true },
    orderBy: { date: 'desc' },
    take: WEIGHTS.recentFormWindow,
  })

  if (matches.length === 0) return { gf: 1.5, ga: 1.5 }

  let gf = 0
  let ga = 0
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId
    gf += (isHome ? m.homeScore : m.awayScore) ?? 0
    ga += (isHome ? m.awayScore : m.homeScore) ?? 0
  }
  return { gf: gf / matches.length, ga: ga / matches.length }
}
