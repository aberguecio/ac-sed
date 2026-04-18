import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlayerMatchEventsForMatch } from '@/lib/player-match-sync'

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

  const result = await syncPlayerMatchEventsForMatch(matchId)
  return NextResponse.json(result)
}
