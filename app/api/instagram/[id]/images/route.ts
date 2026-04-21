import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'
import { isACSED } from '@/lib/team-utils'
import { getMatchContext } from '@/lib/ai'
import {
  generateResultImage,
  generateStandingsImage,
  generatePromoImage,
  composeCustomImage,
} from '@/lib/ig-image-generator'
import path from 'path'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const postId = parseInt(id)

  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { images: true },
  })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const contentType = req.headers.get('content-type') ?? ''

    // Custom image upload (FormData with file)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const composed = await composeCustomImage(buffer)

      const key = `instagram/${postId}/custom-${Date.now()}.jpeg`
      const imageUrl = await uploadImageToS3(composed, key, 'image/jpeg')

      const nextOrder = post.images.length
      const image = await prisma.instagramPostImage.create({
        data: {
          postId,
          imageUrl,
          backgroundUrl: null,
          orderIndex: nextOrder,
        },
      })

      return NextResponse.json(image)
    }

    // Generated image (JSON body)
    const body = await req.json()
    const { imageType, backgroundUrl } = body as {
      imageType: 'result' | 'standings' | 'promo'
      backgroundUrl?: string
    }

    if (!imageType) {
      return NextResponse.json({ error: 'imageType required' }, { status: 400 })
    }

    // Resolve background
    const bgSource = backgroundUrl
      ? backgroundUrl.startsWith('/')
        ? path.join(process.cwd(), 'public', backgroundUrl)
        : backgroundUrl
      : null

    // Load match data
    const match = post.matchId
      ? await prisma.match.findUnique({
          where: { id: post.matchId },
          include: { homeTeam: true, awayTeam: true },
        })
      : null

    if ((imageType === 'result' || imageType === 'promo' || imageType === 'standings') && !match) {
      return NextResponse.json({ error: 'Post needs a linked match for this image type' }, { status: 400 })
    }

    let imageBuffer: Buffer

    if (imageType === 'result' && match) {
      const homeTeam = {
        id: match.homeTeam?.id || 0,
        name: match.homeTeam?.name || 'TBD',
        logoUrl: match.homeTeam?.logoUrl || null,
        score: match.homeScore,
      }
      const awayTeam = {
        id: match.awayTeam?.id || 0,
        name: match.awayTeam?.name || 'TBD',
        logoUrl: match.awayTeam?.logoUrl || null,
        score: match.awayScore,
      }
      imageBuffer = await generateResultImage(bgSource, homeTeam, awayTeam)
    } else if (imageType === 'standings' && match) {
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

      // Get roster players to map leaguePlayerId to roster names
      const allPlayers = await prisma.player.findMany({
        where: { leaguePlayerId: { not: null } },
        select: { leaguePlayerId: true, name: true },
      })
      const leagueToPlayer = new Map(allPlayers.map(p => [p.leaguePlayerId!, p]))

      const acsedGoals = context.goals
        .filter((g: any) => isACSED(g.teamName))
        .map((g: any) => {
          const rosterPlayer = leagueToPlayer.get(g.leaguePlayerId)
          const name = rosterPlayer?.name || `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`
          return {
            name,
            goals: 1,
            minute: g.minute,
          }
        })

      // Consolidate goals per player
      const scorerMap = new Map<string, { name: string; goals: number; minute: number | null }>()
      for (const g of acsedGoals) {
        const existing = scorerMap.get(g.name)
        if (existing) {
          existing.goals++
        } else {
          scorerMap.set(g.name, { name: g.name, goals: 1, minute: g.minute })
        }
      }

      // Get assists from goals
      const acsedAssists = context.goals
        .filter((g: any) => isACSED(g.teamName) && g.assistLeaguePlayerId)
        .map((g: any) => {
          const rosterPlayer = leagueToPlayer.get(g.assistLeaguePlayerId)
          const name = rosterPlayer?.name || (g.assistPlayer ? `${g.assistPlayer.firstName} ${g.assistPlayer.lastName}` : 'Desconocido')
          return { name, assists: 1 }
        })

      // Consolidate assists per player
      const assistMap = new Map<string, { name: string; assists: number }>()
      for (const a of acsedAssists) {
        const existing = assistMap.get(a.name)
        if (existing) {
          existing.assists++
        } else {
          assistMap.set(a.name, { name: a.name, assists: 1 })
        }
      }

      imageBuffer = await generateStandingsImage(
        bgSource,
        standings,
        Array.from(scorerMap.values()),
        Array.from(assistMap.values())
      )
    } else if (imageType === 'promo' && match) {
      const homeTeam = {
        id: match.homeTeam?.id || 0,
        name: match.homeTeam?.name || 'TBD',
        logoUrl: match.homeTeam?.logoUrl || null,
      }
      const awayTeam = {
        id: match.awayTeam?.id || 0,
        name: match.awayTeam?.name || 'TBD',
        logoUrl: match.awayTeam?.logoUrl || null,
      }
      imageBuffer = await generatePromoImage(bgSource, homeTeam, awayTeam, match.date, match.venue)
    } else {
      return NextResponse.json({ error: 'Invalid imageType' }, { status: 400 })
    }

    const key = `instagram/${postId}/${imageType}-${Date.now()}.jpeg`
    const imageUrl = await uploadImageToS3(imageBuffer, key, 'image/jpeg')

    const nextOrder = post.images.length
    const image = await prisma.instagramPostImage.create({
      data: {
        postId,
        imageUrl,
        backgroundUrl: backgroundUrl ?? null,
        orderIndex: nextOrder,
      },
    })

    return NextResponse.json(image)
  } catch (err) {
    console.error('Error generating Instagram image:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = req.nextUrl
  const imageId = searchParams.get('imageId')
  if (!imageId) return NextResponse.json({ error: 'imageId required' }, { status: 400 })

  await prisma.instagramPostImage.delete({ where: { id: parseInt(imageId) } })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = req.nextUrl
  const imageId = searchParams.get('imageId')
  if (!imageId) return NextResponse.json({ error: 'imageId required' }, { status: 400 })

  const body = await req.json()
  const updated = await prisma.instagramPostImage.update({
    where: { id: parseInt(imageId) },
    data: { orderIndex: body.orderIndex },
  })

  return NextResponse.json(updated)
}
