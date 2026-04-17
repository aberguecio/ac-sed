import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sanitizePlayerInput, isP2002 } from '@/lib/player-utils'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data = sanitizePlayerInput(body)
  if (data instanceof Response) return data
  try {
    const player = await prisma.player.update({
      where: { id: parseInt(id) },
      data,
    })
    return NextResponse.json(player)
  } catch (err: unknown) {
    if (isP2002(err)) {
      return NextResponse.json({ error: 'Teléfono ya registrado' }, { status: 409 })
    }
    throw err
  }
}

// Soft-delete: preserva asistencia histórica (PlayerMatch usa onDelete: Restrict).
// El Player queda oculto (active=false) pero sus filas en PlayerMatch, goals, cards quedan intactas.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.player.update({
    where: { id: parseInt(id) },
    data: { active: false },
  })
  return NextResponse.json({ success: true })
}
