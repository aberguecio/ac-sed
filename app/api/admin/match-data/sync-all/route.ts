import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlayerMatchEventsForMatch } from '@/lib/player-match-sync'

// One-shot de migración: sincroniza PlayerMatch desde MatchGoal/MatchCard para TODOS los partidos.
// Idempotente: puede correrse múltiples veces sin efectos secundarios.
export async function POST() {
  const matches = await prisma.match.findMany({ select: { id: true } })

  let totalUpdated = 0
  let totalCreated = 0

  for (const match of matches) {
    const result = await syncPlayerMatchEventsForMatch(match.id)
    totalUpdated += result.updated
    totalCreated += result.created
  }

  return NextResponse.json({
    matchesProcessed: matches.length,
    totalUpdated,
    totalCreated,
  })
}
