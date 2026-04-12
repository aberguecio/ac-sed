import { NextResponse } from 'next/server'
import { runScraper } from '@/lib/scraper'
import { generateMatchNews } from '@/lib/ai'
import { prisma } from '@/lib/db'
import slugify from 'slugify'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { tournamentId, stageId } = body

    // Build options based on what was provided
    let options: { tournamentId?: number; stageId?: number } | undefined
    if (tournamentId && stageId) {
      // Both provided: scrape specific stage
      options = { tournamentId, stageId }
    } else if (tournamentId) {
      // Only tournament: scrape all stages of that tournament
      options = { tournamentId }
    }
    // If neither provided, options remains undefined (scrape active tournament)

    const { newMatches, logId } = await runScraper('manual', options)

    // Only generate news for matches that have been played (have scores)
    const playedMatches = newMatches.filter(m => m.homeScore !== null && m.awayScore !== null)
    console.log(`Generating news for ${playedMatches.length} played matches out of ${newMatches.length} total new matches`)

    const articles = []
    for (const match of playedMatches) {
      try {
        // Check if news already exists for this match
        const existingNews = await prisma.newsArticle.findFirst({
          where: { matchId: match.id }
        })

        if (existingNews) {
          console.log(`News already exists for match ${match.id}, skipping...`)
          continue
        }

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
