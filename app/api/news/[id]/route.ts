import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMatchContext } from '@/lib/ai'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await prisma.newsArticle.findUnique({
    where: { id: parseInt(id) },
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      generatedAt: true,
      matchId: true,
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
        }
      },
    },
  })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If article has a match, get the AI context
  let aiContext = null
  if (article.match) {
    const context = await getMatchContext(article.match)

    const homeTeamName = article.match.homeTeam?.name ?? 'TBD'
    const awayTeamName = article.match.awayTeam?.name ?? 'TBD'

    // Format context for display
    aiContext = {
      matchDate: article.match.date,
      matchInfo: `${homeTeamName} ${article.match.homeScore ?? '?'} - ${article.match.awayScore ?? '?'} ${awayTeamName}`,

      // Goals
      goalsCount: context.goals.length,
      goals: context.goals.map((g: any) => ({
        minute: g.minute,
        player: g.scrapedPlayer ? `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}` : 'Desconocido',
        team: g.teamName,
      })),

      // Cards
      cardsCount: context.cards.length,
      cards: context.cards.map((c: any) => ({
        minute: c.minute,
        type: c.cardType,
        player: c.scrapedPlayer ? `${c.scrapedPlayer.firstName} ${c.scrapedPlayer.lastName}` : 'Desconocido',
        team: c.teamName,
      })),

      // Previous matches
      previousMatchesCount: context.previousMatches.length,
      previousMatches: context.previousMatches.map((m: any) => ({
        date: m.date.toLocaleDateString('es-CL'),
        match: `${m.homeTeam?.name ?? 'TBD'} ${m.homeScore}-${m.awayScore} ${m.awayTeam?.name ?? 'TBD'}`,
      })),

      // Upcoming matches
      upcomingMatchesCount: context.upcomingMatches.length,
      upcomingMatches: context.upcomingMatches.map((m: any) => ({
        date: m.date.toLocaleDateString('es-CL'),
        match: `${m.homeTeam?.name ?? 'TBD'} vs ${m.awayTeam?.name ?? 'TBD'}`,
      })),

      // Standings
      standingsCount: context.standingsRows.length,
      standings: context.standingsRows.map((s: any) =>
        `${s.position}. ${s.teamName} - ${s.points}pts (G:${s.won} E:${s.drawn} P:${s.lost})`
      ),

      // Other results in the same round
      otherResultsCount: context.otherMatchesInRound.length,
      otherResults: context.otherMatchesInRound.map((m: any) =>
        `${m.homeTeam?.name ?? 'TBD'} ${m.homeScore}-${m.awayScore} ${m.awayTeam?.name ?? 'TBD'}`
      ),
    }
  }

  return NextResponse.json({ ...article, aiContext })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const article = await prisma.newsArticle.update({
    where: { id: parseInt(id) },
    data: body,
  })
  return NextResponse.json(article)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.newsArticle.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}
