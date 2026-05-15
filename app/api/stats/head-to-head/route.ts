import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ACSED_TEAM_NAME = 'AC Sed'

interface HeadToHeadRecord {
  opponent: string
  opponentId: number | null
  opponentLogo: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  // True when this opponent is also scheduled to face AC SED again in the
  // current active stage (used so we can keep one-time opponents we'll
  // rematch alongside the 2+ played opponents).
  upcomingInCurrentStage: boolean
}

export async function GET() {
  try {
    // Identify the active stage so we can also surface one-time opponents
    // we're about to face again in this phase.
    const activeTournament = await prisma.tournament.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
      include: { stages: { orderBy: { orderIndex: 'desc' } } },
    })
    const activeStageId = activeTournament?.stages[0]?.id ?? null

    const upcomingOpponentIds = new Set<number>()
    if (activeStageId !== null) {
      const upcoming = await prisma.match.findMany({
        where: {
          stageId: activeStageId,
          homeScore: null,
          OR: [
            { homeTeam: { name: ACSED_TEAM_NAME } },
            { awayTeam: { name: ACSED_TEAM_NAME } },
          ],
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      })
      for (const m of upcoming) {
        const isHome = m.homeTeam?.name === ACSED_TEAM_NAME
        const opponentId = isHome ? m.awayTeamId : m.homeTeamId
        if (opponentId) upcomingOpponentIds.add(opponentId)
      }
    }

    // Get all matches where AC SED played
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { homeTeam: { name: ACSED_TEAM_NAME } },
          { awayTeam: { name: ACSED_TEAM_NAME } }
        ],
        homeScore: { not: null }, // Only played matches
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    })

    // Aggregate results by opponent
    const recordsByOpponent = new Map<string, HeadToHeadRecord>()

    for (const match of matches) {
      const isHome = match.homeTeam?.name === ACSED_TEAM_NAME
      const opponentTeam = isHome ? match.awayTeam : match.homeTeam
      const opponent = opponentTeam?.name

      if (!opponent || opponent === ACSED_TEAM_NAME) continue

      const acsedScore = isHome ? (match.homeScore ?? 0) : (match.awayScore ?? 0)
      const opponentScore = isHome ? (match.awayScore ?? 0) : (match.homeScore ?? 0)

      if (!recordsByOpponent.has(opponent)) {
        recordsByOpponent.set(opponent, {
          opponent,
          opponentId: opponentTeam?.id ?? null,
          opponentLogo: opponentTeam?.logoUrl ?? null,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          upcomingInCurrentStage: opponentTeam?.id
            ? upcomingOpponentIds.has(opponentTeam.id)
            : false,
        })
      }

      const record = recordsByOpponent.get(opponent)!
      record.played++
      record.goalsFor += acsedScore
      record.goalsAgainst += opponentScore

      if (acsedScore > opponentScore) {
        record.won++
      } else if (acsedScore < opponentScore) {
        record.lost++
      } else {
        record.drawn++
      }
    }

    // Include opponents we've played 2+ times, plus those we've played only
    // once but are scheduled to face again in the current stage (so the
    // upcoming rematch shows up with its prior history).
    const headToHead = Array.from(recordsByOpponent.values())
      .filter(record => record.played >= 2 || (record.played >= 1 && record.upcomingInCurrentStage))
      .sort((a, b) => b.played - a.played)

    return NextResponse.json(headToHead)
  } catch (err) {
    console.error('Head to head error:', err)
    return NextResponse.json({ error: 'Failed to fetch head to head stats' }, { status: 500 })
  }
}
