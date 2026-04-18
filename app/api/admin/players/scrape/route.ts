import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID, ACSED_TEAM_NAME } from '@/lib/team-utils'



const LIGAB_API = 'https://api.ligab.cl/v1'

interface TeamPlayerEntry {
  playerId: number
  teamId: number
  inRoster: boolean
  isCaptain: boolean
}

interface LigaBPlayer {
  id: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  run?: string | null
}

// POST - Fetch AC SED players from Liga B API and upsert into ScrapedPlayer
export async function POST() {
  try {
    const teamPlayersRes = await fetch(`${LIGAB_API}/teams/${ACSED_TEAM_ID}/players`)
    if (!teamPlayersRes.ok) {
      return NextResponse.json(
        { error: `Liga B API error: ${teamPlayersRes.status}` },
        { status: 502 }
      )
    }
    const teamPlayers: TeamPlayerEntry[] = await teamPlayersRes.json()

    // Ensure AC SED Team row exists so ScrapedPlayer.teamId FK resolves
    await prisma.team.upsert({
      where: { id: ACSED_TEAM_ID },
      create: { id: ACSED_TEAM_ID, name: ACSED_TEAM_NAME },
      update: {},
    })

    const existing = await prisma.scrapedPlayer.findMany({
      where: { id: { in: teamPlayers.map((p) => p.playerId) } },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((p) => p.id))

    const details = await Promise.all(
      teamPlayers.map(async (entry): Promise<LigaBPlayer | null> => {
        try {
          const res = await fetch(`${LIGAB_API}/players/${entry.playerId}`)
          if (!res.ok) return null
          return (await res.json()) as LigaBPlayer
        } catch {
          return null
        }
      })
    )

    let created = 0
    let updated = 0
    const failed: number[] = []

    for (let i = 0; i < teamPlayers.length; i++) {
      const entry = teamPlayers[i]
      const data = details[i]
      if (!data) {
        failed.push(entry.playerId)
        continue
      }

      await prisma.scrapedPlayer.upsert({
        where: { id: entry.playerId },
        create: {
          id: entry.playerId,
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          email: data.email ?? null,
          run: data.run ?? null,
          teamId: ACSED_TEAM_ID,
        },
        update: {
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          email: data.email ?? null,
          run: data.run ?? null,
          teamId: ACSED_TEAM_ID,
          updatedAt: new Date(),
        },
      })

      if (existingIds.has(entry.playerId)) updated++
      else created++
    }

    return NextResponse.json({
      success: true,
      total: teamPlayers.length,
      created,
      updated,
      failed,
    })
  } catch (err) {
    console.error('Error scraping AC SED players:', err)
    return NextResponse.json({ error: 'Failed to scrape players' }, { status: 500 })
  }
}
