import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const analyses = await prisma.tournamentAnalysis.findMany({
      orderBy: { generatedAt: 'desc' },
    })
    return NextResponse.json(analyses)
  } catch (err) {
    console.error('Error fetching analyses:', err)
    return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
  }
}