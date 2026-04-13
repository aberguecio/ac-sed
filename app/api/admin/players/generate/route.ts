import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST - Generate a new roster player from a scraped player
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { scrapedPlayerId } = body

    if (!scrapedPlayerId) {
      return NextResponse.json({ error: 'Missing scrapedPlayerId' }, { status: 400 })
    }

    // Check if a player with this leaguePlayerId already exists
    const existingPlayer = await prisma.player.findUnique({
      where: { leaguePlayerId: scrapedPlayerId }
    })

    if (existingPlayer) {
      return NextResponse.json({
        error: 'Este jugador ya fue generado anteriormente',
        player: existingPlayer
      }, { status: 400 })
    }

    // Get the scraped player
    const scrapedPlayer = await prisma.scrapedPlayer.findUnique({
      where: { id: scrapedPlayerId }
    })

    if (!scrapedPlayer) {
      return NextResponse.json({ error: 'Scraped player not found' }, { status: 404 })
    }

    // Create a new roster player with the scraped player's name
    const fullName = `${scrapedPlayer.firstName} ${scrapedPlayer.lastName}`.trim()

    // Generate random stats between 30 and 65
    const randomStat = () => Math.floor(Math.random() * 36) + 30 // Random between 30-65

    const newPlayer = await prisma.player.create({
      data: {
        name: fullName,
        leaguePlayerId: scrapedPlayerId,
        active: true,
        statRitmo: randomStat(),
        statDisparo: randomStat(),
        statPase: randomStat(),
        statRegate: randomStat(),
        statDefensa: randomStat(),
        statFisico: randomStat(),
      }
    })

    // Link all goals and cards to this new roster player
    await Promise.all([
      prisma.matchGoal.updateMany({
        where: { leaguePlayerId: scrapedPlayerId },
        data: { rosterPlayerId: newPlayer.id }
      }),
      prisma.matchCard.updateMany({
        where: { leaguePlayerId: scrapedPlayerId },
        data: { rosterPlayerId: newPlayer.id }
      })
    ])

    return NextResponse.json({ success: true, player: newPlayer })
  } catch (err) {
    console.error('Error generating player:', err)
    return NextResponse.json({ error: 'Failed to generate player' }, { status: 500 })
  }
}
