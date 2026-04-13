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
        homeTeamRef: true,
        awayTeamRef: true,
      }
    })

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // Prepare team info - use Team entity if available, otherwise fallback to string
    const homeTeam = {
      id: match.homeTeamRef?.id || 0,
      name: match.homeTeamRef?.name || match.homeTeam,
      logoUrl: match.homeTeamRef?.logoUrl || null,
      score: match.homeScore
    }

    const awayTeam = {
      id: match.awayTeamRef?.id || 0,
      name: match.awayTeamRef?.name || match.awayTeam,
      logoUrl: match.awayTeamRef?.logoUrl || null,
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