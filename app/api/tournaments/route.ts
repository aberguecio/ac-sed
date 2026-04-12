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

    console.log('Tournament stages map:', Array.from(tournamentStagesMap.entries()).map(([tid, stages]) => ({
      tournamentId: tid,
      stageIds: Array.from(stages)
    })))

    // Map to tournament names
    const tournaments = Array.from(tournamentStagesMap.entries()).map(([tournamentId, stageIdsSet]) => {
      // Determine tournament name based on ID
      let name = 'Torneo Desconocido'
      if (tournamentId === 201) name = 'Apertura 2026'
      else if (tournamentId === 191) name = 'Clausura 2025'
      else if (tournamentId === 178) name = 'Apertura 2025'
      else if (tournamentId === 172) name = 'Clausura 2024'
      else name = `Torneo ${tournamentId}`

      // Convert Set to sorted array
      const stageIds = Array.from(stageIdsSet).sort((a, b) => a - b)

      const stages = stageIds.map((stageId, index) => {
        // Determine stage name
        let stageName = `Fase ${index + 1}`

        return {
          id: stageId,
          name: stageName
        }
      })

      console.log(`Tournament ${tournamentId} (${name}): ${stages.length} stages`, stages)

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
