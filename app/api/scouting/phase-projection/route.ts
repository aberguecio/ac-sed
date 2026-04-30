import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import { getPhaseProjection, buildStandings } from '@/lib/scouting/phase-projection'
import type { PendingMatchPrediction } from '@/lib/scouting/types'

export async function GET(request: Request) {
  try {
    const ctx = await resolveContext(request)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 404 })

    const projection = await getPhaseProjection({
      tournamentId: ctx.tournamentId,
      stageId: ctx.stageId,
      groupId: ctx.groupId,
      asOfDate: ctx.asOfDate,
    })

    return NextResponse.json(projection)
  } catch (err) {
    console.error('Phase projection GET error:', err)
    return NextResponse.json({ error: 'Failed to compute projection' }, { status: 500 })
  }
}

/**
 * Recompute the projected standings with user-provided score overrides for
 * specific matches. Body: { tournamentId, stageId, groupId, overrides: PendingMatchPrediction[] }
 * The overrides array IS the new pending list — caller sends the full set
 * (predicted or edited) so we just consume it as the synthetic results.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tournamentId = Number(body.tournamentId)
    const stageId = Number(body.stageId)
    const groupId = Number(body.groupId)
    const asOfDate = body.asOfDate ? new Date(body.asOfDate) : new Date()
    const overrides: PendingMatchPrediction[] = Array.isArray(body.overrides) ? body.overrides : []

    if (!tournamentId || !stageId || !groupId) {
      return NextResponse.json({ error: 'Missing tournamentId/stageId/groupId' }, { status: 400 })
    }

    const baseline = await buildStandings(tournamentId, stageId, groupId, asOfDate, [])
    const projected = await buildStandings(tournamentId, stageId, groupId, asOfDate, overrides)

    const baseByName = new Map(baseline.map((r) => [r.teamName, r]))
    for (const r of projected) {
      const base = baseByName.get(r.teamName)
      r.basePosition = base?.position ?? r.position
      r.basePoints = base?.points ?? 0
    }

    return NextResponse.json({ projectedStandings: projected, baselineStandings: baseline })
  } catch (err) {
    console.error('Phase projection POST error:', err)
    return NextResponse.json({ error: 'Failed to recompute projection' }, { status: 500 })
  }
}

async function resolveContext(
  request: Request
): Promise<
  | { tournamentId: number; stageId: number; groupId: number; asOfDate: Date }
  | { error: string }
> {
  const { searchParams } = new URL(request.url)
  const tournamentIdParam = searchParams.get('tournamentId')
  const stageIdParam = searchParams.get('stageId')
  const groupIdParam = searchParams.get('groupId')
  const asOfDate = searchParams.get('asOfDate') ? new Date(searchParams.get('asOfDate')!) : new Date()

  let tournamentId = tournamentIdParam ? Number(tournamentIdParam) : null
  let stageId = stageIdParam ? Number(stageIdParam) : null
  let groupId = groupIdParam ? Number(groupIdParam) : null

  if (!tournamentId || !stageId || !groupId) {
    const acsedStanding = await prisma.standing.findFirst({
      where: { teamId: ACSED_TEAM_ID },
      orderBy: { updatedAt: 'desc' },
      select: { tournamentId: true, stageId: true, groupId: true },
    })
    if (!acsedStanding) return { error: 'No AC SED context found' }
    tournamentId = tournamentId ?? acsedStanding.tournamentId
    stageId = stageId ?? acsedStanding.stageId
    groupId = groupId ?? acsedStanding.groupId
  }

  return { tournamentId: tournamentId!, stageId: stageId!, groupId: groupId!, asOfDate }
}
