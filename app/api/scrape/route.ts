import { NextResponse } from 'next/server'
import { runScraper } from '@/lib/scraper'
import { generateMatchNews } from '@/lib/ai'
import { prisma } from '@/lib/db'
import slugify from 'slugify'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { tournamentId, stageId } = body

    const options = tournamentId && stageId ? { tournamentId, stageId } : undefined
    const { newMatches, logId } = await runScraper('manual', options)

    const articles = []
    for (const match of newMatches) {
      try {
        const { title, content } = await generateMatchNews(match)
        const baseSlug = slugify(title, { lower: true, strict: true })
        const slug = `${baseSlug}-${Date.now()}`
        const article = await prisma.newsArticle.create({
          data: {
            title,
            slug,
            content,
            matchId: match.id,
            aiProvider: process.env.AI_PROVIDER ?? 'openai',
            published: false,
          },
        })
        articles.push(article)
      } catch (err) {
        console.error('Error generating news for match', match.id, err)
      }
    }

    return NextResponse.json({ success: true, logId, newMatches: newMatches.length, articlesGenerated: articles.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
