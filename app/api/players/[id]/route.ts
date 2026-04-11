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
  await prisma.player.update({
    where: { id: parseInt(id) },
    data: { active: false },
  })
  return NextResponse.json({ success: true })
}
