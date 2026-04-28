import path from 'path'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'
import { isACSED } from '@/lib/team-utils'
import { getMatchContext } from '@/lib/ai'
import {
  generateResultImage,
  generateStandingsImage,
  generatePromoImage,
} from '@/lib/ig-image-generator'
import type { InstagramPostImage, Match, Team } from '@prisma/client'

export type ComposableImageType = 'result' | 'standings' | 'promo'

type MatchWithTeams = Match & { homeTeam: Team | null; awayTeam: Team | null }

function resolveBackgroundSource(backgroundUrl: string | null | undefined): string | null {
  if (!backgroundUrl) return null
  return backgroundUrl.startsWith('/')
    ? path.join(process.cwd(), 'public', backgroundUrl)
    : backgroundUrl
}

async function buildResultBuffer(bg: string | null, match: MatchWithTeams) {
  return generateResultImage(
    bg,
    {
      id: match.homeTeam?.id || 0,
      name: match.homeTeam?.name || 'TBD',
      logoUrl: match.homeTeam?.logoUrl || null,
      score: match.homeScore,
    },
    {
      id: match.awayTeam?.id || 0,
      name: match.awayTeam?.name || 'TBD',
      logoUrl: match.awayTeam?.logoUrl || null,
      score: match.awayScore,
    },
  )
}

async function buildPromoBuffer(bg: string | null, match: MatchWithTeams) {
  return generatePromoImage(
    bg,
    {
      id: match.homeTeam?.id || 0,
      name: match.homeTeam?.name || 'TBD',
      logoUrl: match.homeTeam?.logoUrl || null,
    },
    {
      id: match.awayTeam?.id || 0,
      name: match.awayTeam?.name || 'TBD',
      logoUrl: match.awayTeam?.logoUrl || null,
    },
    match.date,
    match.venue,
  )
}

async function buildStandingsBuffer(bg: string | null, match: MatchWithTeams) {
  const context = await getMatchContext(match)
  const standings = context.standingsRows.map((row: any) => ({
    position: row.position,
    teamName: row.teamName,
    played: row.won + row.drawn + row.lost,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    points: row.points,
    isACSED: isACSED(row.teamName),
  }))

  const allPlayers = await prisma.player.findMany({
    where: { leaguePlayerId: { not: null } },
    select: { leaguePlayerId: true, name: true },
  })
  const leagueToPlayer = new Map(allPlayers.map(p => [p.leaguePlayerId!, p]))

  const scorerMap = new Map<string, { name: string; goals: number; minute: number | null }>()
  for (const g of context.goals.filter((g: any) => isACSED(g.teamName))) {
    const rosterPlayer = leagueToPlayer.get(g.leaguePlayerId)
    const name = rosterPlayer?.name || `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`
    const existing = scorerMap.get(name)
    if (existing) existing.goals++
    else scorerMap.set(name, { name, goals: 1, minute: g.minute })
  }

  const assistMap = new Map<string, { name: string; assists: number }>()
  for (const a of context.goals.filter((g: any) => isACSED(g.teamName) && g.assistLeaguePlayerId)) {
    const rosterPlayer = leagueToPlayer.get(a.assistLeaguePlayerId as number)
    const name = rosterPlayer?.name || (a.assistPlayer ? `${a.assistPlayer.firstName} ${a.assistPlayer.lastName}` : 'Desconocido')
    const existing = assistMap.get(name)
    if (existing) existing.assists++
    else assistMap.set(name, { name, assists: 1 })
  }

  return generateStandingsImage(
    bg,
    standings,
    Array.from(scorerMap.values()),
    Array.from(assistMap.values()),
  )
}

/**
 * Compose an IG image, upload it to S3, and create an InstagramPostImage row
 * linked to the post. Used by both the manual API route and the cron handlers
 * so they stay in sync.
 */
export async function attachComposedImage(opts: {
  postId: number
  imageType: ComposableImageType
  match: MatchWithTeams
  backgroundUrl?: string | null
  orderIndex?: number
}): Promise<InstagramPostImage> {
  const { postId, imageType, match, backgroundUrl } = opts
  const bg = resolveBackgroundSource(backgroundUrl)

  let buffer: Buffer
  if (imageType === 'result') buffer = await buildResultBuffer(bg, match)
  else if (imageType === 'promo') buffer = await buildPromoBuffer(bg, match)
  else buffer = await buildStandingsBuffer(bg, match)

  const key = `instagram/${postId}/${imageType}-${Date.now()}.jpeg`
  const imageUrl = await uploadImageToS3(buffer, key, 'image/jpeg')

  let orderIndex = opts.orderIndex
  if (orderIndex === undefined) {
    const count = await prisma.instagramPostImage.count({ where: { postId } })
    orderIndex = count
  }

  return prisma.instagramPostImage.create({
    data: {
      postId,
      imageUrl,
      backgroundUrl: backgroundUrl ?? null,
      orderIndex,
    },
  })
}
