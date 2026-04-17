import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { AttendanceStatus } from '@prisma/client'

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'DECLINED', 'LATE', 'NO_SHOW'] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId: playerIdStr } = await params
  const matchId = parseInt(id)
  const playerId = parseInt(playerIdStr)
  if (!Number.isFinite(matchId) || !Number.isFinite(playerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await req.json() as Record<string, unknown>
  const update: {
    attendanceStatus?: AttendanceStatus
    rating?: number | null
    notes?: string | null
    goals?: number
    yellowCards?: number
    redCard?: boolean
  } = {}

  if ('attendanceStatus' in body) {
    if (!VALID_STATUSES.includes(body.attendanceStatus as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: 'attendanceStatus inválido' }, { status: 400 })
    }
    update.attendanceStatus = body.attendanceStatus as AttendanceStatus
  }

  if ('rating' in body) {
    const r = body.rating
    if (r === null) {
      update.rating = null
    } else if (typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 10) {
      update.rating = r
    } else {
      return NextResponse.json({ error: 'rating debe ser entero 1-10 o null' }, { status: 400 })
    }
  }

  if ('notes' in body) {
    const n = body.notes
    if (n === null || n === '') {
      update.notes = null
    } else if (typeof n === 'string' && n.length <= 1000) {
      update.notes = n
    } else {
      return NextResponse.json({ error: 'notes máximo 1000 caracteres' }, { status: 400 })
    }
  }

  if ('goals' in body) {
    const g = body.goals
    if (typeof g === 'number' && Number.isInteger(g) && g >= 0 && g <= 20) {
      update.goals = g
    } else {
      return NextResponse.json({ error: 'goals debe ser entero 0-20' }, { status: 400 })
    }
  }

  if ('yellowCards' in body) {
    const y = body.yellowCards
    if (y === 0 || y === 1 || y === 2) {
      update.yellowCards = y
    } else {
      return NextResponse.json({ error: 'yellowCards debe ser 0, 1 o 2' }, { status: 400 })
    }
  }

  if ('redCard' in body) {
    if (typeof body.redCard !== 'boolean') {
      return NextResponse.json({ error: 'redCard debe ser boolean' }, { status: 400 })
    }
    update.redCard = body.redCard
  }

  // Invariante: si el estado resultante tendría yellowCards=2 y redCard=false → rechazar.
  const existing = await prisma.playerMatch.findUnique({
    where: { playerId_matchId: { playerId, matchId } },
  })
  const nextYellow = update.yellowCards ?? existing?.yellowCards ?? 0
  const nextRed = update.redCard ?? existing?.redCard ?? false
  if (nextYellow === 2 && !nextRed) {
    return NextResponse.json({ error: 'Doble amarilla implica roja' }, { status: 400 })
  }

  const row = await prisma.playerMatch.upsert({
    where: { playerId_matchId: { playerId, matchId } },
    create: {
      playerId,
      matchId,
      attendanceStatus: update.attendanceStatus ?? 'PENDING',
      rating: update.rating ?? null,
      notes: update.notes ?? null,
      goals: update.goals ?? 0,
      yellowCards: update.yellowCards ?? 0,
      redCard: update.redCard ?? false,
    },
    update,
  })

  return NextResponse.json(row)
}
