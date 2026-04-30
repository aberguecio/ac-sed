import { calculateStandingsUpToDate } from '@/lib/stats-calculator'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import type { CurrentStandingsResult, CurrentStandingsRow } from './types'
import { prisma } from '@/lib/db'

export interface CurrentStandingsInput {
  rivalTeamId: number
  tournamentId: number
  stageId: number
  groupId: number
  asOfDate: Date
  teamAId?: number // defaults to AC SED
}

export async function getCurrentStandings(input: CurrentStandingsInput): Promise<CurrentStandingsResult> {
  const teamAId = input.teamAId ?? ACSED_TEAM_ID

  const raw = await calculateStandingsUpToDate(
    input.tournamentId,
    input.stageId,
    input.groupId,
    input.asOfDate
  )

  const rows: CurrentStandingsRow[] = raw.map((r) => ({
    teamName: r.teamName,
    position: r.position,
    played: r.won + r.drawn + r.lost,
    points: r.points,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    goalDifference: r.goalDifference,
    ppg: r.won + r.drawn + r.lost > 0 ? r.points / (r.won + r.drawn + r.lost) : 0,
  }))

  const [teamA, rival] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamAId }, select: { name: true } }),
    prisma.team.findUnique({ where: { id: input.rivalTeamId }, select: { name: true } }),
  ])
  const acsed = teamA ? rows.find((r) => r.teamName === teamA.name) ?? null : null
  const rivalRow = rival ? rows.find((r) => r.teamName === rival.name) ?? null : null

  const ppgDiff = (acsed?.ppg ?? 0) - (rivalRow?.ppg ?? 0)

  return { acsed, rival: rivalRow, ppgDiff, table: rows }
}
