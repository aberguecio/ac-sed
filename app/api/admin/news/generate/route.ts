import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateMatchNews } from '@/lib/ai'
import slugify from 'slugify'

// POST /api/admin/news/generate - Generate news for a specific match
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { matchId } = body

    if (!matchId || !Number.isFinite(matchId)) {
      return NextResponse.json({ error: 'Invalid matchId' }, { status: 400 })
    }

    // Get match with teams
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    })

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // Check if match has score
    if (match.homeScore === null || match.awayScore === null) {
      return NextResponse.json(
        { error: 'No se puede generar noticia: el partido no tiene resultado aún' },
        { status: 400 }
      )
    }

    // Generate news using AI
    const { title, content } = await generateMatchNews(match)

    // Check if a news article already exists for this match
    const existingArticle = await prisma.newsArticle.findFirst({
      where: { matchId },
    })

    if (existingArticle) {
      // Update existing article
      const updated = await prisma.newsArticle.update({
        where: { id: existingArticle.id },
        data: {
          title,
          content,
          aiProvider: 'claude-sonnet-4-5',
          generatedAt: new Date(),
        },
      })
      return NextResponse.json({ article: updated, updated: true })
    } else {
      // Create new article
      const slug = slugify(title, { lower: true, strict: true, locale: 'es' })
      const article = await prisma.newsArticle.create({
        data: {
          title,
          slug,
          content,
          matchId,
          aiProvider: 'claude-sonnet-4-5',
          published: false,
          featured: false,
        },
      })
      return NextResponse.json({ article, updated: false })
    }
  } catch (err) {
    console.error('Error generating news:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
