import { NextRequest, NextResponse } from 'next/server'
import { generateVsImage } from '@/lib/vs-image-generator'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'

export async function POST(request: NextRequest) {
  try {
    const { matchId } = await request.json()

    if (!matchId) {
      return NextResponse.json({ error: 'Match ID required' }, { status: 400 })
    }

    // Get match with team info
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
      }
    })

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // Prepare team info
    const homeTeam = {
      id: match.homeTeam?.id || 0,
      name: match.homeTeam?.name || 'TBD',
      logoUrl: match.homeTeam?.logoUrl || null,
      score: match.homeScore
    }

    const awayTeam = {
      id: match.awayTeam?.id || 0,
      name: match.awayTeam?.name || 'TBD',
      logoUrl: match.awayTeam?.logoUrl || null,
      score: match.awayScore
    }

    // Generate the VS image
    const imageBuffer = await generateVsImage(homeTeam, awayTeam)

    // Upload to S3
    const fileName = `news/vs-${match.id}-${Date.now()}.png`
    const imageUrl = await uploadImageToS3(imageBuffer, fileName, 'image/png')

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error('Error generating VS image:', error)
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )
  }
}