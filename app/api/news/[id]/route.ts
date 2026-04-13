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
      match: true,
    },
  })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If article has a match, get the AI context
  let aiContext = null
  if (article.match) {
    const context = await getMatchContext(article.match)

    // Format context for display
    aiContext = {
      matchDate: article.match.date,
      matchInfo: `${article.match.homeTeam} ${article.match.homeScore ?? '?'} - ${article.match.awayScore ?? '?'} ${article.match.awayTeam}`,
      previousMatchesCount: context.previousMatches.length,
      previousMatches: context.previousMatches.map(m => ({
        date: m.date.toLocaleDateString('es-CL'),
        match: `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`,
      })),
      upcomingMatchesCount: context.upcomingMatches.length,
      upcomingMatches: context.upcomingMatches.map(m => ({
        date: m.date.toLocaleDateString('es-CL'),
        match: `${m.homeTeam} vs ${m.awayTeam}`,
      })),
      standingsCount: context.standingsRows.length,
      standings: context.standingsRows.map(s =>
        `${s.position}. ${s.teamName} - ${s.points}pts (G:${s.won} E:${s.drawn} P:${s.lost})`
      ),
      otherResultsCount: context.otherMatchesInRound.length,
      otherResults: context.otherMatchesInRound.map(m =>
        `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`
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
