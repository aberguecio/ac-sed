import { NextResponse } from 'next/server'
import { runScraper } from '@/lib/scraper'
import { generateMatchNews } from '@/lib/ai'
import { prisma } from '@/lib/db'
import slugify from 'slugify'
import { generateVsImage } from '@/lib/vs-image-generator'
import { uploadImageToS3 } from '@/lib/aws'

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

        // Fetch match with team relations for news generation
        const matchWithTeams = await prisma.match.findUnique({
          where: { id: match.id },
          include: {
            homeTeam: true,
            awayTeam: true,
          }
        })

        if (!matchWithTeams) {
          console.log(`Match ${match.id} not found, skipping...`)
          continue
        }

        const { title, content } = await generateMatchNews(matchWithTeams)
        const baseSlug = slugify(title, { lower: true, strict: true })
        const slug = `${baseSlug}-${Date.now()}`

        // Generate VS image
        let imageUrl: string | null = null
        try {
          const homeTeam = {
            id: matchWithTeams.homeTeam?.id || 0,
            name: matchWithTeams.homeTeam?.name || 'TBD',
            logoUrl: matchWithTeams.homeTeam?.logoUrl || null,
            score: matchWithTeams.homeScore
          }

          const awayTeam = {
            id: matchWithTeams.awayTeam?.id || 0,
            name: matchWithTeams.awayTeam?.name || 'TBD',
            logoUrl: matchWithTeams.awayTeam?.logoUrl || null,
            score: matchWithTeams.awayScore
          }

          const imageBuffer = await generateVsImage(homeTeam, awayTeam)
          const fileName = `news/vs-${match.id}-${Date.now()}.png`
          imageUrl = await uploadImageToS3(imageBuffer, fileName, 'image/png')
          console.log(`VS image generated for match ${match.id}: ${imageUrl}`)
        } catch (imageError) {
          console.error(`Error generating VS image for match ${match.id}:`, imageError)
          // Continue without image - don't fail the whole news generation
        }

        const article = await prisma.newsArticle.create({
          data: {
            title,
            slug,
            content,
            matchId: match.id,
            aiProvider: process.env.AI_PROVIDER ?? 'openai',
            imageUrl,
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
