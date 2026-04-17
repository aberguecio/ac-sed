import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PUBLIC_PLAYER_SELECT, sanitizePlayerInput, isP2002 } from '@/lib/player-utils'

export async function GET() {
  const players = await prisma.player.findMany({
    where: { active: true },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    select: PUBLIC_PLAYER_SELECT,
  })
  return NextResponse.json(players)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const data = sanitizePlayerInput(body)
  if (data instanceof Response) return data
  try {
    const player = await prisma.player.create({ data })
    return NextResponse.json(player, { status: 201 })
  } catch (err: unknown) {
    if (isP2002(err)) {
      return NextResponse.json({ error: 'Teléfono ya registrado' }, { status: 409 })
    }
    throw err
  }
}
