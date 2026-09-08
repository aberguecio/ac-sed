import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { applyGoalSequence } from '@/lib/goal-sequence'

/**
 * PUT /api/admin/matches/[id]/goal-order — store the order of a match's goals.
 *
 * Body: `{ goalIds: number[] }`, the full sequence top to bottom. The whole
 * sequence travels rather than a single move because reordering rewrites
 * `orderIndex` on several rows at once, and a partial update would leave the
 * match half-sorted.
 *
 * A goal with a `minute` is placed by its minute and cannot be dragged, so a
 * sequence that moves one is rejected: that means a stale page, not an
 * intention.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 })
  }

  try {
    const body = (await req.json()) as { goalIds?: unknown }

    if (!Array.isArray(body.goalIds) || !body.goalIds.every(v => Number.isInteger(v))) {
      return NextResponse.json({ error: 'goalIds debe ser un array de enteros' }, { status: 400 })
    }

    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } })
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const result = await applyGoalSequence(matchId, body.goalIds as number[])
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    // Same convention as editing a scorer: a hand-set order is manual event
    // data, so the match stops being overwritten by the scraper.
    await prisma.match.update({ where: { id: matchId }, data: { eventsLocked: true } })

    return NextResponse.json({ success: true, updated: result.written })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
