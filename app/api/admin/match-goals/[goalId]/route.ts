import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlayerMatchEventsForMatch } from '@/lib/player-match-sync'

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

    // Prepare update data
    const updateData: {
      leaguePlayerId?: number
      assistLeaguePlayerId?: number | null
    } = {}

    if ('leaguePlayerId' in body) {
      updateData.leaguePlayerId = body.leaguePlayerId
    }
    if ('assistLeaguePlayerId' in body) {
      updateData.assistLeaguePlayerId = body.assistLeaguePlayerId
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

    // Sync aggregated assists to PlayerMatch
    await syncPlayerMatchEventsForMatch(existingGoal.matchId)

    return NextResponse.json(goal)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
