import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const withAliases = req.nextUrl.searchParams.get('withAliases') === '1'
  const players = await prisma.player.findMany({
    where: { active: true },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    include: withAliases ? { aliases: { select: { id: true, alias: true }, orderBy: { createdAt: 'asc' } } } : undefined,
  })
  return NextResponse.json(players)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const player = await prisma.player.create({ data: body })
  return NextResponse.json(player, { status: 201 })
}
