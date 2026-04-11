import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const players = await prisma.player.findMany({
    where: { active: true },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(players)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const player = await prisma.player.create({ data: body })
  return NextResponse.json(player, { status: 201 })
}
