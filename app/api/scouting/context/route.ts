import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'

/**
 * Returns the active scouting context for AC SED:
 * - current tournament / stage / group
 * - the next AC SED match (if any) and its rival pre-selected
 * - the list of rivals in the group (5 other teams)
 */
export async function GET() {
  try {
    const now = new Date()

    let tournamentId: number | null = null
    let stageId: number | null = null

    const upcoming = await prisma.match.findFirst({
      where: {
        date: { gt: now },
        OR: [{ homeTeamId: ACSED_TEAM_ID }, { awayTeamId: ACSED_TEAM_ID }],
        tournamentId: { not: null },
        stageId: { not: null },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        homeTeamId: true,
        awayTeamId: true,
        tournamentId: true,
        stageId: true,
        groupId: true,
      },
    })

    if (upcoming?.tournamentId && upcoming.stageId) {
      tournamentId = upcoming.tournamentId
      stageId = upcoming.stageId
    } else {
      const latest = await prisma.standing.findFirst({
        where: { teamId: ACSED_TEAM_ID },
        orderBy: { updatedAt: 'desc' },
        select: { tournamentId: true, stageId: true },
      })
      tournamentId = latest?.tournamentId ?? null
      stageId = latest?.stageId ?? null
    }

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'No tournament context for AC SED' }, { status: 404 })
    }

    const acsedStanding = await prisma.standing.findFirst({
      where: { tournamentId, stageId, teamId: ACSED_TEAM_ID },
      select: { groupId: true },
    })
    if (!acsedStanding) {
      return NextResponse.json({ error: 'AC SED standing not found' }, { status: 404 })
    }
    const groupId = acsedStanding.groupId

    const groupStandings = await prisma.standing.findMany({
      where: { tournamentId, stageId, groupId },
      include: { team: true, group: true },
      orderBy: { position: 'asc' },
    })

    const rivals = groupStandings
      .filter((s) => s.teamId !== ACSED_TEAM_ID)
      .map((s) => ({
        id: s.team.id,
        name: s.team.name,
        logoUrl: s.team.logoUrl,
        position: s.position,
        played: s.won + s.drawn + s.lost,
        points: s.points,
      }))

    const groupName = groupStandings[0]?.group?.name ?? null

    let nextRival: { id: number; date: string; rivalId: number } | null = null
    if (upcoming) {
      const rivalId = upcoming.homeTeamId === ACSED_TEAM_ID ? upcoming.awayTeamId : upcoming.homeTeamId
      if (rivalId) {
        nextRival = {
          id: upcoming.id,
          date: upcoming.date.toISOString(),
          rivalId,
        }
      }
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    const stage = await prisma.stage.findUnique({ where: { id: stageId } })

    return NextResponse.json({
      tournament: { id: tournamentId, name: tournament?.name ?? `Torneo ${tournamentId}` },
      stage: { id: stageId, name: stage?.name ?? `Fase ${stageId}` },
      group: { id: groupId, name: groupName },
      rivals,
      nextMatch: nextRival,
    })
  } catch (err) {
    console.error('Scouting context error:', err)
    return NextResponse.json({ error: 'Failed to load scouting context' }, { status: 500 })
  }
}
