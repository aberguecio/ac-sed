import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// PATCH /api/admin/match-goals/[goalId] - Update goal assist information
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
    const body = await req.json() as {
      leaguePlayerId?: number
      assistLeaguePlayerId?: number | null
    }

    // Validate that at least one field is provided
    if (!('leaguePlayerId' in body) && !('assistLeaguePlayerId' in body)) {
      return NextResponse.json(
        { error: 'At least one field required (leaguePlayerId or assistLeaguePlayerId)' },
        { status: 400 }
      )
    }

    // Get the goal to validate it exists and get matchId for sync
    const existingGoal = await prisma.matchGoal.findUnique({
      where: { id },
      select: { matchId: true },
    })

    if (!existingGoal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Prepare update data - update BOTH leaguePlayerId AND rosterPlayerId
    const updateData: {
      leaguePlayerId?: number
      rosterPlayerId?: number | null
      assistLeaguePlayerId?: number | null
      assistRosterPlayerId?: number | null
    } = {}

    if ('leaguePlayerId' in body) {
      updateData.leaguePlayerId = body.leaguePlayerId
      // Find roster player with this leaguePlayerId
      const rosterPlayer = await prisma.player.findUnique({
        where: { leaguePlayerId: body.leaguePlayerId },
        select: { id: true },
      })
      updateData.rosterPlayerId = rosterPlayer?.id || null
    }
    if ('assistLeaguePlayerId' in body) {
      updateData.assistLeaguePlayerId = body.assistLeaguePlayerId
      // Find roster player with this leaguePlayerId
      if (body.assistLeaguePlayerId) {
        const assistRosterPlayer = await prisma.player.findUnique({
          where: { leaguePlayerId: body.assistLeaguePlayerId },
          select: { id: true },
        })
        updateData.assistRosterPlayerId = assistRosterPlayer?.id || null
      } else {
        updateData.assistRosterPlayerId = null
      }
    }

    // Update the goal
    const goal = await prisma.matchGoal.update({
      where: { id },
      data: updateData,
      include: {
        scrapedPlayer: true,
        assistPlayer: true,
      },
    })

    // Mark match as locked to prevent scraper from overwriting
    await prisma.match.update({
      where: { id: existingGoal.matchId },
      data: { eventsLocked: true },
    })

    return NextResponse.json(goal)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
