import { prisma } from '@/lib/db'
import type { PythagoreanResult, PythagoreanTeam } from './types'
import { WEIGHTS } from './weights'

export interface PythagoreanInput {
  acsedTeamId: number
  rivalTeamId: number
  tournamentId: number
  stageId: number
  asOfDate: Date
}

export async function getPythagorean(input: PythagoreanInput): Promise<PythagoreanResult> {
  const [acsed, rival] = await Promise.all([
    teamPyth(input.acsedTeamId, input.tournamentId, input.stageId, input.asOfDate),
    teamPyth(input.rivalTeamId, input.tournamentId, input.stageId, input.asOfDate),
  ])
  return { acsed, rival }
}

async function teamPyth(
  teamId: number,
  tournamentId: number,
  stageId: number,
  asOfDate: Date
): Promise<PythagoreanTeam> {
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
      homeTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  })

  let gf = 0
  let ga = 0
  let wins = 0
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId
    const f = (isHome ? m.homeScore : m.awayScore) ?? 0
    const a = (isHome ? m.awayScore : m.homeScore) ?? 0
    gf += f
    ga += a
    if (f > a) wins++
  }

  const played = matches.length
  const x = WEIGHTS.pythagoreanExponent
  const denom = Math.pow(gf, x) + Math.pow(ga, x)
  const expectedWinPct = denom > 0 ? Math.pow(gf, x) / denom : 0.5
  const actualWinPct = played > 0 ? wins / played : 0
  return {
    expectedWinPct,
    actualWinPct,
    delta: actualWinPct - expectedWinPct,
    goalsFor: gf,
    goalsAgainst: ga,
    played,
  }
}
