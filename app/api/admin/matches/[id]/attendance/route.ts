import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET - Get attendance records for a match
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const matchId = parseInt(id)
    if (isNaN(matchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const attendance = await prisma.matchAttendance.findMany({
      where: { matchId },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            number: true,
            photoUrl: true,
            aliases: { select: { id: true, alias: true } },
          },
        },
      },
      orderBy: { player: { number: 'asc' } },
    })

    return NextResponse.json(attendance)
  } catch (error) {
    console.error('Error fetching attendance:', error)
    return NextResponse.json({ error: 'Error fetching attendance' }, { status: 500 })
  }
}

// POST - Save attendance for a match (replaces existing records)
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const matchId = parseInt(id)
    if (isNaN(matchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { attendees } = await req.json() as {
      attendees: Array<{ playerId: number; notes?: string }>
    }

    if (!Array.isArray(attendees)) {
      return NextResponse.json({ error: 'attendees must be an array' }, { status: 400 })
    }

    // Delete existing attendance and re-insert
    await prisma.$transaction([
      prisma.matchAttendance.deleteMany({ where: { matchId } }),
      prisma.matchAttendance.createMany({
        data: attendees.map(({ playerId, notes }) => ({
          matchId,
          playerId,
          notes: notes ?? null,
        })),
        skipDuplicates: true,
      }),
    ])

    const saved = await prisma.matchAttendance.findMany({
      where: { matchId },
      include: { player: { select: { id: true, name: true, number: true } } },
    })

    return NextResponse.json(saved)
  } catch (error) {
    console.error('Error saving attendance:', error)
    return NextResponse.json({ error: 'Error saving attendance' }, { status: 500 })
  }
}

// DELETE - Clear all attendance for a match
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const matchId = parseInt(id)
    if (isNaN(matchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    await prisma.matchAttendance.deleteMany({ where: { matchId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting attendance:', error)
    return NextResponse.json({ error: 'Error deleting attendance' }, { status: 500 })
  }
}
