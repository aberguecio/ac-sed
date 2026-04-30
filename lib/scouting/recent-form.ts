import { prisma } from '@/lib/db'
import type { FormResult, RecentFormResult, RecentFormTeam } from './types'
import { WEIGHTS } from './weights'
import { mean } from './utils'

export interface RecentFormInput {
  acsedTeamId: number
  rivalTeamId: number
  asOfDate: Date
}

export async function getRecentForm(input: RecentFormInput): Promise<RecentFormResult> {
  const window = WEIGHTS.recentFormWindow
  const [acsed, rival] = await Promise.all([
    teamRecentForm(input.acsedTeamId, input.asOfDate, window),
    teamRecentForm(input.rivalTeamId, input.asOfDate, window),
  ])
  return { acsed, rival, windowSize: window }
}

export async function teamRecentForm(teamId: number, asOfDate: Date, window: number): Promise<RecentFormTeam> {
  const matches = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      date: true,
      homeTeamId: true,
      homeScore: true,
      awayScore: true,
    },
    orderBy: { date: 'desc' },
    take: window,
  })

  // Reverse to chronological order so trend reflects oldest -> newest.
  const chrono = matches.slice().reverse()

  const results: FormResult[] = []
  const gds: number[] = []
  for (const m of chrono) {
    const isHome = m.homeTeamId === teamId
    const gf = (isHome ? m.homeScore : m.awayScore) ?? 0
    const ga = (isHome ? m.awayScore : m.homeScore) ?? 0
    gds.push(gf - ga)
    results.push(gf > ga ? 'W' : gf < ga ? 'L' : 'D')
  }

  const points = results.reduce((a, r) => a + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
  const maxPoints = Math.max(1, results.length * 3)
  const pointsRatio = points / maxPoints

  // Streak: count from the most recent backward as long as the result type repeats.
  let currentStreak: { type: FormResult; length: number } | null = null
  if (results.length > 0) {
    const last = results[results.length - 1]
    let len = 1
    for (let i = results.length - 2; i >= 0; i--) {
      if (results[i] === last) len++
      else break
    }
    currentStreak = { type: last, length: len }
  }

  // Trend: difference of avg GD between second half and first half of the window.
  let trend = 0
  if (gds.length >= 4) {
    const mid = Math.floor(gds.length / 2)
    const firstHalf = gds.slice(0, mid)
    const secondHalf = gds.slice(mid)
    const range = 6 // typical max GD swing — normalize to roughly [-1, 1]
    trend = Math.max(-1, Math.min(1, (mean(secondHalf) - mean(firstHalf)) / range))
  }

  return {
    results,
    pointsRatio,
    avgGD: mean(gds),
    currentStreak,
    trend,
  }
}
