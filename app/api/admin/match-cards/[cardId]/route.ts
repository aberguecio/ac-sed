import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlayerMatchEventsForMatch } from '@/lib/player-match-sync'

// PATCH /api/admin/match-cards/[cardId] — Reassign the player who got a card.
// Mirrors /api/admin/match-goals/[goalId]: updates leaguePlayerId +
// rosterPlayerId, locks the match against scraper overwrites, and resyncs
// the per-player aggregate so card counts on PlayerMatch stay in sync.
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
    const body = (await req.json()) as { leaguePlayerId?: number }

    if (!('leaguePlayerId' in body) || typeof body.leaguePlayerId !== 'number') {
      return NextResponse.json({ error: 'leaguePlayerId is required' }, { status: 400 })
    }

    const existingCard = await prisma.matchCard.findUnique({
      where: { id },
      select: { matchId: true },
    })
    if (!existingCard) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const rosterPlayer = await prisma.player.findUnique({
      where: { leaguePlayerId: body.leaguePlayerId },
      select: { id: true },
    })

    const card = await prisma.matchCard.update({
      where: { id },
      data: {
        leaguePlayerId: body.leaguePlayerId,
        rosterPlayerId: rosterPlayer?.id ?? null,
      },
      include: { scrapedPlayer: true },
    })

    await prisma.match.update({
      where: { id: existingCard.matchId },
      data: { eventsLocked: true },
    })

    await syncPlayerMatchEventsForMatch(existingCard.matchId)

    return NextResponse.json(card)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
