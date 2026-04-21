import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// PATCH /api/admin/matches/[id] - Update match context
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const matchId = parseInt(id)

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 })
  }

  try {
    const body = await req.json() as { context?: string | null; eventsLocked?: boolean }

    if (!('context' in body) && !('eventsLocked' in body)) {
      return NextResponse.json({ error: 'context or eventsLocked field required' }, { status: 400 })
    }

    const updateData: { context?: string | null; eventsLocked?: boolean } = {}

    if ('context' in body) {
      const { context } = body
      // Validate context length (max 5000 characters)
      if (context && typeof context === 'string' && context.length > 5000) {
        return NextResponse.json({ error: 'context máximo 5000 caracteres' }, { status: 400 })
      }
      updateData.context = context || null
    }

    if ('eventsLocked' in body) {
      if (typeof body.eventsLocked !== 'boolean') {
        return NextResponse.json({ error: 'eventsLocked debe ser boolean' }, { status: 400 })
      }
      updateData.eventsLocked = body.eventsLocked
    }

    const match = await prisma.match.update({
      where: { id: matchId },
      data: updateData,
    })

    return NextResponse.json(match)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
