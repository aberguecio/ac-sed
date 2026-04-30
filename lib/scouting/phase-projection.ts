import { prisma } from '@/lib/db'
import { calculateStandingsUpToDate } from '@/lib/stats-calculator'
import { predictPairLite } from './predict-pair-lite'
import type { PendingMatchPrediction, PhaseProjectionResult, ProjectedStandingRow } from './types'

export interface PhaseProjectionInput {
  tournamentId: number
  stageId: number
  groupId: number
  asOfDate: Date
}

export async function getPhaseProjection(input: PhaseProjectionInput): Promise<PhaseProjectionResult> {
  const { tournamentId, stageId, groupId, asOfDate } = input

  const allPhaseMatches = await prisma.match.findMany({
    where: { tournamentId, stageId, groupId },
    include: {
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
    },
    orderBy: { date: 'asc' },
  })

  const pending = allPhaseMatches.filter((m) => m.homeScore == null || m.awayScore == null)

  const pendingPredictions: PendingMatchPrediction[] = []
  for (const m of pending) {
    if (!m.homeTeam || !m.awayTeam) continue
    const pred = await predictPairLite({
      homeTeamId: m.homeTeam.id,
      awayTeamId: m.awayTeam.id,
      tournamentId,
      stageId,
      groupId,
      asOfDate,
    })
    pendingPredictions.push({
      matchId: m.id,
      date: m.date.toISOString(),
      homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logoUrl: m.homeTeam.logoUrl },
      awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logoUrl: m.awayTeam.logoUrl },
      pHomeWin: pred.pHomeWin,
      pDraw: pred.pDraw,
      pAwayWin: pred.pAwayWin,
      expectedGD: pred.expectedGD,
      predictedHome: pred.predictedHome,
      predictedAway: pred.predictedAway,
      scoreDerivation: pred.scoreDerivation,
    })
  }

  const baseline = await buildStandings(tournamentId, stageId, groupId, asOfDate, [])
  const projected = await buildStandings(tournamentId, stageId, groupId, asOfDate, pendingPredictions)

  // Annotate base position/points on projected rows so the UI can render the diff.
  const baseByName = new Map(baseline.map((r) => [r.teamName, r]))
  for (const r of projected) {
    const base = baseByName.get(r.teamName)
    r.basePosition = base?.position ?? r.position
    r.basePoints = base?.points ?? 0
  }

  return {
    pendingMatches: pendingPredictions,
    projectedStandings: projected,
    baselineStandings: baseline,
  }
}

/**
 * Compute standings from played matches and a list of synthesized scores
 * (used for both the live "include predictions" projection and the baseline
 * "played only" snapshot when synthetic is empty).
 */
export async function buildStandings(
  tournamentId: number,
  stageId: number,
  groupId: number,
  asOfDate: Date,
  synthetic: PendingMatchPrediction[]
): Promise<ProjectedStandingRow[]> {
  const baseline = await calculateStandingsUpToDate(tournamentId, stageId, groupId, asOfDate)

  // Map team name -> teamId/logo for output.
  const standings = await prisma.standing.findMany({
    where: { tournamentId, stageId, groupId },
    include: { team: true },
  })
  const byName = new Map<string, { teamId: number; logoUrl: string | null }>()
  for (const s of standings) {
    byName.set(s.team.name, { teamId: s.team.id, logoUrl: s.team.logoUrl })
  }

  const stats = new Map<
    string,
    { points: number; won: number; drawn: number; lost: number; gf: number; ga: number }
  >()
  for (const r of baseline) {
    stats.set(r.teamName, {
      points: r.points,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      gf: r.goalsFor,
      ga: r.goalsAgainst,
    })
  }

  // Apply synthetic results.
  if (synthetic.length > 0) {
    for (const pm of synthetic) {
      apply(stats, pm.homeTeam.name, pm.predictedHome, pm.predictedAway)
      apply(stats, pm.awayTeam.name, pm.predictedAway, pm.predictedHome)
    }
  }

  const rows: ProjectedStandingRow[] = Array.from(stats.entries()).map(([teamName, s]) => {
    const meta = byName.get(teamName) ?? { teamId: 0, logoUrl: null }
    return {
      teamId: meta.teamId,
      teamName,
      logoUrl: meta.logoUrl,
      played: s.won + s.drawn + s.lost,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      goalDifference: s.gf - s.ga,
      points: s.points,
      position: 0,
      basePosition: 0,
      basePoints: 0,
    }
  })

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    return b.goalsFor - a.goalsFor
  })
  rows.forEach((r, i) => {
    r.position = i + 1
  })
  return rows
}

function apply(
  stats: Map<string, { points: number; won: number; drawn: number; lost: number; gf: number; ga: number }>,
  team: string,
  goalsFor: number,
  goalsAgainst: number
) {
  if (!stats.has(team)) {
    stats.set(team, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
  }
  const s = stats.get(team)!
  s.gf += goalsFor
  s.ga += goalsAgainst
  if (goalsFor > goalsAgainst) {
    s.won++
    s.points += 3
  } else if (goalsFor < goalsAgainst) {
    s.lost++
  } else {
    s.drawn++
    s.points += 1
  }
}
