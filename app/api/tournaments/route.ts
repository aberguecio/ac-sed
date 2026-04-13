import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get all unique tournament/stage combinations from standings (scraped data)
    const allStandings = await prisma.standing.findMany({
      select: {
        tournamentId: true,
        stageId: true,
      },
      orderBy: [
        { tournamentId: 'desc' },
        { stageId: 'asc' }
      ]
    })

    // Group by tournament and collect unique stages
    const tournamentStagesMap = new Map<number, Set<number>>()

    allStandings.forEach((s) => {
      if (!tournamentStagesMap.has(s.tournamentId)) {
        tournamentStagesMap.set(s.tournamentId, new Set())
      }
      tournamentStagesMap.get(s.tournamentId)!.add(s.stageId)
    })

    // Get tournament and stage names from database
    const tournamentIds = Array.from(tournamentStagesMap.keys())
    const tournamentsFromDB = await prisma.tournament.findMany({
      where: { id: { in: tournamentIds } }
    })

    const allStageIds = Array.from(tournamentStagesMap.values()).flatMap(set => Array.from(set))
    const stagesFromDB = await prisma.stage.findMany({
      where: { id: { in: allStageIds } }
    })

    // Create lookup maps
    const tournamentNameMap = new Map(tournamentsFromDB.map(t => [t.id, t.name]))
    const stageNameMap = new Map(stagesFromDB.map(s => [s.id, s.name]))

    // Map to tournament objects with proper names
    const tournaments = Array.from(tournamentStagesMap.entries()).map(([tournamentId, stageIdsSet]) => {
      const name = tournamentNameMap.get(tournamentId) || `Torneo ${tournamentId}`

      // Convert Set to sorted array
      const stageIds = Array.from(stageIdsSet).sort((a, b) => a - b)

      const stages = stageIds.map((stageId) => ({
        id: stageId,
        name: stageNameMap.get(stageId) || `Fase ${stageId}`
      }))

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
