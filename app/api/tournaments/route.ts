import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get all unique tournament/stage combinations from standings (scraped data)
    const standings = await prisma.standing.findMany({
      select: {
        tournamentId: true,
        stageId: true,
        groupId: true,
        groupName: true,
      },
      distinct: ['tournamentId', 'stageId'],
      orderBy: [
        { tournamentId: 'desc' },
        { stageId: 'desc' }
      ]
    })

    // Get unique tournaments
    const uniqueTournaments = new Map<number, Set<number>>()

    standings.forEach((s) => {
      if (!uniqueTournaments.has(s.tournamentId)) {
        uniqueTournaments.set(s.tournamentId, new Set())
      }
      uniqueTournaments.get(s.tournamentId)!.add(s.stageId)
    })

    // Map to tournament names (you can enhance this with actual names from API later)
    const tournaments = Array.from(uniqueTournaments.entries()).map(([tournamentId, stageIds]) => {
      // Determine tournament name based on ID
      let name = 'Torneo Desconocido'
      if (tournamentId === 201) name = 'Apertura 2026'
      else if (tournamentId === 191) name = 'Clausura 2025'
      else if (tournamentId === 178) name = 'Apertura 2025'
      else if (tournamentId === 172) name = 'Clausura 2024'
      else name = `Torneo ${tournamentId}`

      const stages = Array.from(stageIds).map((stageId, index) => {
        // Determine stage name
        let stageName = `Fase ${index + 1}`
        // You can add more specific mappings here if needed

        return {
          id: stageId,
          name: stageName
        }
      })

      return {
        id: tournamentId,
        name,
        stages
      }
    })

    return NextResponse.json(tournaments)
  } catch (err) {
    console.error('Error fetching tournaments:', err)
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 })
  }
}
