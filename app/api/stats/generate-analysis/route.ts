import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateCoachAnalysis } from '@/lib/coach-analysis'
import crypto from 'crypto'

const ACSED_TEAM_NAME = 'AC Sed'

export async function POST(request: Request) {
  try {
    const { tournamentId, stageId, groupId, dataHash, standingsData, fixtures, teamScorers, matchesPlayed, matchesRemaining } = await request.json()

    if (!tournamentId || !stageId || !groupId || !dataHash) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Check if already exists
    const existing = await prisma.tournamentAnalysis.findFirst({
      where: { tournamentId, stageId, groupId, dataHash }
    })

    if (existing) {
      return NextResponse.json({ analysis: existing.content })
    }

    // Get top scorers for the analysis (for this tournament)
    const topScorersAll = await prisma.leagueScorer.findMany({
      where: { tournamentId },
      orderBy: { goals: 'desc' },
    })

    // Get historical matches from our database for upcoming rivals
    const upcomingRivals = fixtures
      .filter((f: any) => !f.homeScore && !f.awayScore)
      .slice(0, matchesRemaining)
      .map((f: any) => f.homeTeam === ACSED_TEAM_NAME ? f.awayTeam : f.homeTeam)

    // Get historical matches against upcoming rivals (from ANY tournament/stage)
    const previousMatches = upcomingRivals.length > 0
      ? await prisma.match.findMany({
          where: {
            OR: upcomingRivals.flatMap((rival: string) => [
              { homeTeam: ACSED_TEAM_NAME, awayTeam: rival },
              { homeTeam: rival, awayTeam: ACSED_TEAM_NAME }
            ]),
            homeScore: { not: null },
            awayScore: { not: null },
            // Exclude current tournament/stage (we want historical data)
            NOT: {
              tournamentId,
              stageId
            }
          },
          orderBy: { date: 'desc' },
          take: 10
        })
      : []

    // Generate new analysis
    const analysis = await generateCoachAnalysis({
      standings: standingsData,
      fixtures,
      teamScorers,
      matchesPlayed,
      matchesRemaining,
      topScorersAll: topScorersAll.map((s) => ({
        player: {
          firstName: s.playerName.split(' ')[0],
          lastName: s.playerName.split(' ').slice(1).join(' ')
        },
        team: { name: s.teamName },
        goals: s.goals,
      })),
      previousMatches,
    })

    // Save to cache
    const existingAnalysis = await prisma.tournamentAnalysis.findFirst({
      where: { tournamentId, stageId, groupId }
    })

    if (existingAnalysis) {
      await prisma.tournamentAnalysis.update({
        where: { id: existingAnalysis.id },
        data: {
          content: analysis,
          dataHash,
          generatedAt: new Date(),
          aiProvider: process.env.AI_PROVIDER ?? 'openai',
        }
      })
    } else {
      await prisma.tournamentAnalysis.create({
        data: {
          tournamentId,
          stageId,
          groupId,
          content: analysis,
          dataHash,
          aiProvider: process.env.AI_PROVIDER ?? 'openai',
        }
      })
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Error generating analysis:', err)
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 })
  }
}
