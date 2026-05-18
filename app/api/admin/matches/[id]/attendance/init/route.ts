import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { initializeAttendance } from '@/lib/attendance'

// Bootstrap idempotente: crea PlayerMatch(PENDING) para cada active player
// que no tenga fila. Comparte la lógica con runAttendanceBroadcast.
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

  const result = await initializeAttendance(matchId)
  return NextResponse.json({ created: result.created, total: result.total })
}
