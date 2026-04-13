import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const player = await prisma.player.update({
    where: { id: parseInt(id) },
    data: body,
  })
  return NextResponse.json(player)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Delete the player completely from the roster
  // This will allow the scraped player to be generated/linked again
  // Goals and cards will remain linked to the scraped player (onDelete: SetNull)
  await prisma.player.delete({
    where: { id: parseInt(id) },
  })
  return NextResponse.json({ success: true })
}
