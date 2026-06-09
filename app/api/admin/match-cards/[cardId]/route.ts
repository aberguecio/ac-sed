import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type PatchBody = {
  rosterPlayerId?: number | null
  leaguePlayerId?: number | null
}

// PATCH /api/admin/match-cards/[cardId] — Reassign the player who got a card.
// Accepts either rosterPlayerId (preferred, supports roster-only parches) or
// leaguePlayerId (legacy). Resolves the other side from the Player record and
// locks the match against scraper overwrites.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params
  const id = parseInt(cardId)

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid card ID' }, { status: 400 })
  }

  try {
    const body = (await req.json()) as PatchBody

    if (!('rosterPlayerId' in body) && !('leaguePlayerId' in body)) {
      return NextResponse.json(
        { error: 'rosterPlayerId or leaguePlayerId required' },
        { status: 400 },
      )
    }

    const existingCard = await prisma.matchCard.findUnique({
      where: { id },
      select: { matchId: true },
    })
    if (!existingCard) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    let rosterPlayerId: number | null = null
    let leaguePlayerId: number | null = null

    if ('rosterPlayerId' in body) {
      if (body.rosterPlayerId == null) {
        return NextResponse.json(
          { error: 'Card holder cannot be cleared; assign a player' },
          { status: 400 },
        )
      }
      const player = await prisma.player.findUnique({
        where: { id: body.rosterPlayerId },
        select: { id: true, leaguePlayerId: true },
      })
      if (!player) {
        return NextResponse.json({ error: 'Roster player not found' }, { status: 404 })
      }
      rosterPlayerId = player.id
      leaguePlayerId = player.leaguePlayerId
    } else if ('leaguePlayerId' in body) {
      if (typeof body.leaguePlayerId !== 'number') {
        return NextResponse.json({ error: 'leaguePlayerId required' }, { status: 400 })
      }
      const roster = await prisma.player.findUnique({
        where: { leaguePlayerId: body.leaguePlayerId },
        select: { id: true },
      })
      rosterPlayerId = roster?.id ?? null
      leaguePlayerId = body.leaguePlayerId
    }

    const card = await prisma.matchCard.update({
      where: { id },
      data: {
        leaguePlayerId,
        rosterPlayerId,
      },
      include: { scrapedPlayer: true, rosterPlayer: true },
    })

    await prisma.match.update({
      where: { id: existingCard.matchId },
      data: { eventsLocked: true },
    })

    return NextResponse.json(card)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
