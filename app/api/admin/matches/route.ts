import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'

// GET - List all AC SED matches ordered by date desc
export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { homeTeamId: ACSED_TEAM_ID },
          { awayTeamId: ACSED_TEAM_ID },
        ],
      },
      include: {
        homeTeam: { select: { id: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, name: true, logoUrl: true } },
        _count: { select: { attendance: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(matches)
  } catch (error) {
    console.error('Error fetching matches:', error)
    return NextResponse.json({ error: 'Error fetching matches' }, { status: 500 })
  }
}
