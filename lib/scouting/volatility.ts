import { prisma } from '@/lib/db'
import type { VolatilityResult } from './types'
import { WEIGHTS } from './weights'
import { stdDev } from './utils'

export interface VolatilityInput {
  acsedTeamId: number
  rivalTeamId: number
  asOfDate: Date
}

export async function getVolatility(input: VolatilityInput): Promise<VolatilityResult> {
  const window = WEIGHTS.volatilityWindow
  const [acsedStdDev, rivalStdDev] = await Promise.all([
    teamGdStdDev(input.acsedTeamId, input.asOfDate, window),
    teamGdStdDev(input.rivalTeamId, input.asOfDate, window),
  ])
  return {
    acsedStdDev,
    rivalStdDev,
    diff: rivalStdDev - acsedStdDev,
  }
}

async function teamGdStdDev(teamId: number, asOfDate: Date, window: number): Promise<number> {
  const matches = await prisma.match.findMany({
    where: {
      date: { lt: asOfDate },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      homeTeamId: true,
      homeScore: true,
      awayScore: true,
    },
    orderBy: { date: 'desc' },
    take: window,
  })

  const gds = matches.map((m) => {
    const isHome = m.homeTeamId === teamId
    const f = (isHome ? m.homeScore : m.awayScore) ?? 0
    const a = (isHome ? m.awayScore : m.homeScore) ?? 0
    return f - a
  })

  return stdDev(gds)
}
