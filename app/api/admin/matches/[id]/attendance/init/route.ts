import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Bootstrap idempotente: crea PlayerMatch(PENDING) para cada active player que no tenga fila.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Invalid match id' }, { status: 400 })
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const activePlayers = await prisma.player.findMany({
    where: { active: true },
    select: { id: true },
  })

  const result = await prisma.playerMatch.createMany({
    data: activePlayers.map(p => ({
      playerId: p.id,
      matchId,
      attendanceStatus: 'PENDING' as const,
    })),
    skipDuplicates: true,
  })

  return NextResponse.json({ created: result.count, total: activePlayers.length })
}
