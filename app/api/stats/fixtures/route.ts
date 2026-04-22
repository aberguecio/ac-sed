import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tournamentId = Number(searchParams.get('tournamentId'))
    const stageId = Number(searchParams.get('stageId'))
    const upToDate = searchParams.get('upToDate')

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const standing = await prisma.standing.findFirst({
      where: { tournamentId, stageId },
    })

    if (!standing) {
      return NextResponse.json([], { status: 200 })
    }

    const groupId = standing.groupId

    let upToDateObj: Date | null = null
    if (upToDate) {
      upToDateObj = new Date(upToDate)
      upToDateObj.setDate(upToDateObj.getDate() + 1)
    }

    const matches = await prisma.match.findMany({
      where: { tournamentId, stageId, groupId },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'asc' },
    })

    const fixtures = matches.map((m) => {
      const shouldHideScore = upToDateObj !== null && m.date > upToDateObj

      return {
        id: m.id,
        date: m.date,
        homeTeam: m.homeTeam?.name ?? 'TBD',
        homeTeamId: m.homeTeam?.id ?? null,
        homeTeamLogo: m.homeTeam?.logoUrl ?? null,
        awayTeam: m.awayTeam?.name ?? 'TBD',
        awayTeamId: m.awayTeam?.id ?? null,
        awayTeamLogo: m.awayTeam?.logoUrl ?? null,
        homeScore: shouldHideScore ? null : m.homeScore,
        awayScore: shouldHideScore ? null : m.awayScore,
        roundName: m.roundName,
      }
    })

    return NextResponse.json(fixtures)
  } catch (err) {
    console.error('Fixtures error:', err)
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 500 })
  }
}
