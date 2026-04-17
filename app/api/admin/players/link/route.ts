import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlayerMatchEventsForMatch } from '@/lib/player-match-sync'

// GET - Get unlinked scraped players and roster players
export async function GET() {
  try {
    // Get all roster players with their leaguePlayerId
    const allRosterPlayers = await prisma.player.findMany({
      select: { leaguePlayerId: true }
    })

    // Get IDs of scraped players that are already linked
    const linkedScrapedPlayerIds = allRosterPlayers
      .filter(p => p.leaguePlayerId !== null)
      .map(p => p.leaguePlayerId!)

    // Get scraped AC SED players that are NOT linked to any roster player
    const unlinkedScraped = await prisma.scrapedPlayer.findMany({
      where: {
        teamName: {
          contains: 'AC Sed',
          mode: 'insensitive'
        },
        id: {
          notIn: linkedScrapedPlayerIds
        }
      },
      include: {
        _count: {
          select: {
            goals: true,
            cards: true
          }
        }
      },
      orderBy: {
        lastName: 'asc'
      }
    })

    // Get roster players that are not linked to any scraped player
    const unlinkedRoster = await prisma.player.findMany({
      where: {
        leaguePlayerId: null,
        active: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Get all unlinked scraped players for the dropdown (any team)
    const allUnlinkedScraped = await prisma.scrapedPlayer.findMany({
      where: {
        id: {
          notIn: linkedScrapedPlayerIds
        }
      },
      orderBy: {
        lastName: 'asc'
      }
    })

    return NextResponse.json({
      unlinkedScraped,
      unlinkedRoster,
      allUnlinkedScraped
    })
  } catch (err) {
    console.error('Error fetching link data:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}

// POST - Link a roster player to a scraped player
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { rosterPlayerId, scrapedPlayerId } = body

    if (!rosterPlayerId || !scrapedPlayerId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Update the roster player with the league player ID
    await prisma.player.update({
      where: { id: rosterPlayerId },
      data: { leaguePlayerId: scrapedPlayerId }
    })

    // Update all goals and cards to link to this roster player
    await Promise.all([
      prisma.matchGoal.updateMany({
        where: { leaguePlayerId: scrapedPlayerId },
        data: { rosterPlayerId }
      }),
      prisma.matchCard.updateMany({
        where: { leaguePlayerId: scrapedPlayerId },
        data: { rosterPlayerId }
      })
    ])

    // Propagar agregados (goals/yellowCards/redCard) a PlayerMatch en los matches afectados.
    const affectedMatches = await prisma.$queryRaw<{ matchId: number }[]>`
      SELECT DISTINCT "matchId" FROM "MatchGoal" WHERE "rosterPlayerId" = ${rosterPlayerId}
      UNION
      SELECT DISTINCT "matchId" FROM "MatchCard" WHERE "rosterPlayerId" = ${rosterPlayerId}
    `
    for (const { matchId } of affectedMatches) {
      await syncPlayerMatchEventsForMatch(matchId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error linking players:', err)
    return NextResponse.json({ error: 'Failed to link players' }, { status: 500 })
  }
}
