import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'

export async function GET() {
  const acsedFilter = {
    OR: [
      { homeTeamId: ACSED_TEAM_ID },
      { awayTeamId: ACSED_TEAM_ID },
    ],
  }

  const matches = await prisma.match.findMany({
    where: { homeScore: { not: null }, ...acsedFilter },
    orderBy: { date: 'desc' },
    take: 30,
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  })

  // Also include upcoming matches (no score yet) for promo posts
  const upcoming = await prisma.match.findMany({
    where: { homeScore: null, date: { gte: new Date() }, ...acsedFilter },
    orderBy: { date: 'asc' },
    take: 10,
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  })

  return NextResponse.json({ played: matches, upcoming })
}
