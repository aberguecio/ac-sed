import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import { getHeadToHead } from '@/lib/scouting/head-to-head'
import { getCommonOpponents } from '@/lib/scouting/common-opponents'
import { getCommonOpponentsL2 } from '@/lib/scouting/common-opponents-l2'
import { getRecentForm } from '@/lib/scouting/recent-form'
import { getPythagorean } from '@/lib/scouting/pythagorean'
import { getStrengthOfSchedule } from '@/lib/scouting/strength-of-schedule'
import { getVolatility } from '@/lib/scouting/volatility'
import { getDiscipline } from '@/lib/scouting/discipline'
import { getScorers } from '@/lib/scouting/scorers'
import { getCurrentStandings } from '@/lib/scouting/current-standings'
import { predict } from '@/lib/scouting/predictor'
import { buildInsights } from '@/lib/scouting/insights'
import type { ScoutingBundle } from '@/lib/scouting/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId: teamIdStr } = await params
    const rivalTeamId = Number(teamIdStr)
    if (!rivalTeamId || rivalTeamId === ACSED_TEAM_ID) {
      return NextResponse.json({ error: 'Invalid rival teamId' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const tournamentIdParam = searchParams.get('tournamentId')
    const stageIdParam = searchParams.get('stageId')
    const asOfDateParam = searchParams.get('asOfDate')

    const asOfDate = asOfDateParam ? new Date(asOfDateParam) : new Date()

    const ctx = await resolveContext({
      rivalTeamId,
      tournamentId: tournamentIdParam ? Number(tournamentIdParam) : null,
      stageId: stageIdParam ? Number(stageIdParam) : null,
      asOfDate,
    })

    if (!ctx) {
      return NextResponse.json(
        { error: 'No active tournament/stage/group found for AC SED' },
        { status: 404 }
      )
    }

    const { tournamentId, stageId, groupId, nextMatch } = ctx

    const [acsedTeam, rivalTeam] = await Promise.all([
      prisma.team.findUnique({ where: { id: ACSED_TEAM_ID } }),
      prisma.team.findUnique({ where: { id: rivalTeamId } }),
    ])
    if (!rivalTeam) {
      return NextResponse.json({ error: 'Rival team not found' }, { status: 404 })
    }

    const [
      headToHead,
      commonOpponents,
      recentForm,
      pythagorean,
      strengthOfSchedule,
      volatility,
      discipline,
      scorers,
      currentStandings,
    ] = await Promise.all([
      getHeadToHead({ rivalTeamId, asOfDate, currentStageId: stageId }),
      getCommonOpponents({ rivalTeamId, asOfDate, currentStageId: stageId }),
      getRecentForm({ acsedTeamId: ACSED_TEAM_ID, rivalTeamId, asOfDate }),
      getPythagorean({ acsedTeamId: ACSED_TEAM_ID, rivalTeamId, tournamentId, stageId, asOfDate }),
      getStrengthOfSchedule({
        acsedTeamId: ACSED_TEAM_ID,
        rivalTeamId,
        tournamentId,
        stageId,
        groupId,
        asOfDate,
      }),
      getVolatility({ acsedTeamId: ACSED_TEAM_ID, rivalTeamId, asOfDate }),
      getDiscipline({ acsedTeamId: ACSED_TEAM_ID, rivalTeamId, tournamentId, stageId, asOfDate }),
      getScorers({ acsedTeamId: ACSED_TEAM_ID, rivalTeamId, tournamentId, stageId, asOfDate }),
      getCurrentStandings({ rivalTeamId, tournamentId, stageId, groupId, asOfDate }),
    ])

    const commonOpponentsL2 = await getCommonOpponentsL2({
      commonOpponents,
      rivalTeamId,
      asOfDate,
      currentStageId: stageId,
    })

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

    const insights = buildInsights({
      rivalName: rivalTeam.name,
      headToHead,
      commonOpponents,
      commonOpponentsL2,
      recentForm,
      pythagorean,
      strengthOfSchedule,
      volatility,
      discipline,
      scorers,
      currentStandings,
    })

    const bundle: ScoutingBundle = {
      acsed: {
        id: ACSED_TEAM_ID,
        name: acsedTeam?.name ?? 'AC Sed',
        logoUrl: acsedTeam?.logoUrl ?? null,
      },
      rival: { id: rivalTeam.id, name: rivalTeam.name, logoUrl: rivalTeam.logoUrl },
      context: {
        tournamentId,
        stageId,
        groupId,
        asOfDate: asOfDate.toISOString(),
        nextMatch: nextMatch
          ? { id: nextMatch.id, date: nextMatch.date.toISOString() }
          : null,
      },
      headToHead,
      commonOpponents,
      commonOpponentsL2,
      recentForm,
      pythagorean,
      strengthOfSchedule,
      volatility,
      discipline,
      scorers,
      currentStandings,
      prediction,
      insights,
    }

    return NextResponse.json(bundle)
  } catch (err) {
    console.error('Scouting error:', err)
    return NextResponse.json({ error: 'Failed to build scouting bundle' }, { status: 500 })
  }
}

async function resolveContext(args: {
  rivalTeamId: number
  tournamentId: number | null
  stageId: number | null
  asOfDate: Date
}): Promise<{
  tournamentId: number
  stageId: number
  groupId: number
  nextMatch: { id: number; date: Date } | null
} | null> {
  // 1) If client passed both, trust it; else fall back to AC SED's most relevant
  // group: prefer an upcoming match, then the latest standings entry.
  let tournamentId = args.tournamentId
  let stageId = args.stageId

  if (!tournamentId || !stageId) {
    const upcoming = await prisma.match.findFirst({
      where: {
        date: { gt: args.asOfDate },
        OR: [{ homeTeamId: ACSED_TEAM_ID }, { awayTeamId: ACSED_TEAM_ID }],
        tournamentId: { not: null },
        stageId: { not: null },
      },
      orderBy: { date: 'asc' },
      select: { tournamentId: true, stageId: true },
    })

    if (upcoming?.tournamentId && upcoming.stageId) {
      tournamentId = upcoming.tournamentId
      stageId = upcoming.stageId
    } else {
      // Latest standings entry for AC SED.
      const latest = await prisma.standing.findFirst({
        where: { teamId: ACSED_TEAM_ID },
        orderBy: { updatedAt: 'desc' },
        select: { tournamentId: true, stageId: true },
      })
      if (latest) {
        tournamentId = latest.tournamentId
        stageId = latest.stageId
      }
    }
  }

  if (!tournamentId || !stageId) return null

  // Resolve groupId from AC SED's standing in that (tournament, stage).
  const acsedStanding = await prisma.standing.findFirst({
    where: { tournamentId, stageId, teamId: ACSED_TEAM_ID },
    select: { groupId: true },
  })
  if (!acsedStanding) return null

  // Find next AC SED match between AC SED and the requested rival in this phase.
  const nextMatch = await prisma.match.findFirst({
    where: {
      tournamentId,
      stageId,
      groupId: acsedStanding.groupId,
      date: { gt: args.asOfDate },
      OR: [
        { homeTeamId: ACSED_TEAM_ID, awayTeamId: args.rivalTeamId },
        { homeTeamId: args.rivalTeamId, awayTeamId: ACSED_TEAM_ID },
      ],
    },
    orderBy: { date: 'asc' },
    select: { id: true, date: true },
  })

  return {
    tournamentId,
    stageId,
    groupId: acsedStanding.groupId,
    nextMatch: nextMatch ?? null,
  }
}
