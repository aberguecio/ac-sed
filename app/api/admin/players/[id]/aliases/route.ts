import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET - List aliases for a player
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const playerId = parseInt(id)
    if (isNaN(playerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const aliases = await prisma.playerAlias.findMany({
      where: { playerId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(aliases)
  } catch (error) {
    console.error('Error fetching aliases:', error)
    return NextResponse.json({ error: 'Error fetching aliases' }, { status: 500 })
  }
}

// POST - Add alias to a player
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const playerId = parseInt(id)
    if (isNaN(playerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { alias } = await req.json()
    if (!alias || typeof alias !== 'string' || alias.trim().length === 0) {
      return NextResponse.json({ error: 'alias is required' }, { status: 400 })
    }

    const created = await prisma.playerAlias.create({
      data: { playerId, alias: alias.trim() },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Alias already exists for this player' }, { status: 409 })
    }
    console.error('Error creating alias:', error)
    return NextResponse.json({ error: 'Error creating alias' }, { status: 500 })
  }
}
