import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { renormalizeGoalOrder } from '@/lib/goal-sequence'

type PatchBody = {
  rosterPlayerId?: number | null
  leaguePlayerId?: number | null
  assistRosterPlayerId?: number | null
  assistLeaguePlayerId?: number | null
  minute?: number | null
}

// Regulation plus stoppage plus extra time, with room to spare. The league
// never sends a minute, so every value here was typed by a human.
const MAX_MINUTE = 200

// Resolve the (leaguePlayerId, rosterPlayerId) pair for a roster-driven
// assignment. When the client sends a rosterPlayerId, look up the linked
// Liga B id (may be null for parche players). When the client sends a
// leaguePlayerId, look up the matching roster player.
async function resolvePair(
  body: PatchBody,
  rosterKey: 'rosterPlayerId' | 'assistRosterPlayerId',
  leagueKey: 'leaguePlayerId' | 'assistLeaguePlayerId',
): Promise<{ rosterPlayerId: number | null; leaguePlayerId: number | null } | null> {
  if (rosterKey in body) {
    const rosterPlayerId = body[rosterKey] ?? null
    if (rosterPlayerId == null) {
      return { rosterPlayerId: null, leaguePlayerId: null }
    }
    const player = await prisma.player.findUnique({
      where: { id: rosterPlayerId },
      select: { id: true, leaguePlayerId: true },
    })
    if (!player) return null
    return { rosterPlayerId: player.id, leaguePlayerId: player.leaguePlayerId }
  }
  if (leagueKey in body) {
    const leaguePlayerId = body[leagueKey] ?? null
    if (leaguePlayerId == null) {
      return { rosterPlayerId: null, leaguePlayerId: null }
    }
    const roster = await prisma.player.findUnique({
      where: { leaguePlayerId },
      select: { id: true },
    })
    return { rosterPlayerId: roster?.id ?? null, leaguePlayerId }
  }
  return null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const { goalId } = await params
  const id = parseInt(goalId)

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid goal ID' }, { status: 400 })
  }

  try {
    const body = (await req.json()) as PatchBody

    const hasScorer = 'rosterPlayerId' in body || 'leaguePlayerId' in body
    const hasAssist = 'assistRosterPlayerId' in body || 'assistLeaguePlayerId' in body
    const hasMinute = 'minute' in body
    if (!hasScorer && !hasAssist && !hasMinute) {
      return NextResponse.json(
        { error: 'At least one of rosterPlayerId / leaguePlayerId / assist* / minute required' },
        { status: 400 },
      )
    }

    if (hasMinute && body.minute !== null) {
      const minute = body.minute
      if (typeof minute !== 'number' || !Number.isInteger(minute) || minute < 0 || minute > MAX_MINUTE) {
        return NextResponse.json(
          { error: `minute debe ser un entero entre 0 y ${MAX_MINUTE}, o null` },
          { status: 400 },
        )
      }
    }

    const existingGoal = await prisma.matchGoal.findUnique({
      where: { id },
      select: { matchId: true },
    })
    if (!existingGoal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const updateData: {
      leaguePlayerId?: number | null
      rosterPlayerId?: number | null
      assistLeaguePlayerId?: number | null
      assistRosterPlayerId?: number | null
      minute?: number | null
    } = {}

    if (hasMinute) {
      updateData.minute = body.minute ?? null
    }

    if (hasScorer) {
      const pair = await resolvePair(body, 'rosterPlayerId', 'leaguePlayerId')
      if (!pair) {
        return NextResponse.json({ error: 'Roster player not found' }, { status: 404 })
      }
      if (pair.rosterPlayerId == null && pair.leaguePlayerId == null) {
        return NextResponse.json(
          { error: 'Goal scorer cannot be cleared; assign a player' },
          { status: 400 },
        )
      }
      updateData.rosterPlayerId = pair.rosterPlayerId
      updateData.leaguePlayerId = pair.leaguePlayerId
    }

    if (hasAssist) {
      const pair = await resolvePair(body, 'assistRosterPlayerId', 'assistLeaguePlayerId')
      if (!pair) {
        return NextResponse.json({ error: 'Roster player not found' }, { status: 404 })
      }
      updateData.assistRosterPlayerId = pair.rosterPlayerId
      updateData.assistLeaguePlayerId = pair.leaguePlayerId
    }

    const goal = await prisma.matchGoal.update({
      where: { id },
      data: updateData,
      include: {
        scrapedPlayer: true,
        assistPlayer: true,
        rosterPlayer: true,
        assistRosterPlayer: true,
      },
    })

    await prisma.match.update({
      where: { id: existingGoal.matchId },
      data: { eventsLocked: true },
    })

    // A minute decides where its goal sits, so setting or clearing one moves
    // it — and the minute-less goals dragged around it have to stay put.
    if (hasMinute) {
      await renormalizeGoalOrder(existingGoal.matchId)
    }

    return NextResponse.json(goal)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
