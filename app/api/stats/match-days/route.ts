import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tournamentId = Number(searchParams.get('tournamentId'))
    const stageId = Number(searchParams.get('stageId'))

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Get all matches for this stage, ordered by date
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        stageId,
      },
      orderBy: { date: 'asc' },
      select: { date: true },
    })

    // Extract unique dates (match days) and convert to just the date part
    const uniqueDates = Array.from(
      new Set(
        matches.map((m) => m.date.toISOString().split('T')[0])
      )
    ).map((dateStr, index) => ({
      matchDay: index + 1,
      date: dateStr,
    }))

    return NextResponse.json(uniqueDates)
  } catch (err) {
    console.error('Match days error:', err)
    return NextResponse.json({ error: 'Failed to fetch match days' }, { status: 500 })
  }
}
