import { NextRequest, NextResponse } from 'next/server'
import { runScraper } from '@/lib/scraper'
import { generateMatchNews } from '@/lib/ai'
import { prisma } from '@/lib/db'
import slugify from 'slugify'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { newMatches } = await runScraper('scheduler')

    for (const match of newMatches) {
      try {
        // Fetch match with team relations for news generation
        const matchWithTeams = await prisma.match.findUnique({
          where: { id: match.id },
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })

        if (!matchWithTeams) continue

        const { title, content } = await generateMatchNews(matchWithTeams)
        const baseSlug = slugify(title, { lower: true, strict: true })
        const slug = `${baseSlug}-${Date.now()}`
        await prisma.newsArticle.create({
          data: {
            title,
            slug,
            content,
            matchId: match.id,
            aiProvider: process.env.AI_PROVIDER ?? 'openai',
            published: false,
          },
        })
      } catch (err) {
        console.error('Cron: error generating news for match', match.id, err)
      }
    }

    return NextResponse.json({ success: true, newMatches: newMatches.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
