import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ACSED_TEAM_NAME = 'AC Sed'

interface HeadToHeadRecord {
  opponent: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
}

export async function GET() {
  try {
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
      const opponent = isHome ? match.awayTeam?.name : match.homeTeam?.name

      if (!opponent || opponent === ACSED_TEAM_NAME) continue

      const acsedScore = isHome ? (match.homeScore ?? 0) : (match.awayScore ?? 0)
      const opponentScore = isHome ? (match.awayScore ?? 0) : (match.homeScore ?? 0)

      if (!recordsByOpponent.has(opponent)) {
        recordsByOpponent.set(opponent, {
          opponent,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
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

    // Convert to array, filter for 2+ matches, and sort by total matches played
    const headToHead = Array.from(recordsByOpponent.values())
      .filter(record => record.played >= 2)
      .sort((a, b) => b.played - a.played)

    return NextResponse.json(headToHead)
  } catch (err) {
    console.error('Head to head error:', err)
    return NextResponse.json({ error: 'Failed to fetch head to head stats' }, { status: 500 })
  }
}
