import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PUBLIC_PLAYER_SELECT } from '@/lib/player-utils'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Invalid match id' }, { status: 400 })
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  })
  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const [players, playerMatches] = await Promise.all([
    prisma.player.findMany({
      where: { active: true },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
      select: {
        ...PUBLIC_PLAYER_SELECT,
        phoneNumber: true, // admin puede ver el teléfono
      },
    }),
    prisma.playerMatch.findMany({ where: { matchId } }),
  ])

  const byPlayerId = new Map(playerMatches.map(pm => [pm.playerId, pm]))
  const rows = players.map(player => ({
    player,
    playerMatch: byPlayerId.get(player.id) ?? null,
  }))

  return NextResponse.json({ match, rows })
}
