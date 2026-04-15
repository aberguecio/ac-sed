import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseAttendanceMessage, matchParsedEntries } from '@/lib/attendance-parser'

// POST - Parse a WhatsApp attendance message against known players+aliases
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const players = await prisma.player.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        aliases: { select: { id: true, alias: true } },
      },
    })

    const entries = parseAttendanceMessage(text)
    const results = matchParsedEntries(entries, players)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error parsing attendance:', error)
    return NextResponse.json({ error: 'Error parsing attendance' }, { status: 500 })
  }
}
