import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: Promise<{ id: string; aliasId: string }> }

// DELETE - Remove an alias from a player
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { aliasId } = await params
    const id = parseInt(aliasId)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid aliasId' }, { status: 400 })

    await prisma.playerAlias.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting alias:', error)
    return NextResponse.json({ error: 'Error deleting alias' }, { status: 500 })
  }
}
