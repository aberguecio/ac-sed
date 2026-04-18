import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PUBLIC_PLAYER_SELECT, sanitizePlayerInput, isP2002 } from '@/lib/player-utils'

export async function GET(req: NextRequest) {
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'

  // Solo contar asistencia de partidos del año en curso que ya se jugaron.
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [players, attendance] = await Promise.all([
    prisma.player.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
      select: PUBLIC_PLAYER_SELECT,
    }),
    prisma.playerMatch.groupBy({
      by: ['playerId', 'attendanceStatus'],
      where: {
        match: {
          date: { gte: startOfYear, lt: now },
        },
      },
      _count: { _all: true },
    }),
  ])

  // attended = CONFIRMED + LATE (el jugador efectivamente fue al partido)
  const statsByPlayer = new Map<number, { attended: number; total: number }>()
  for (const row of attendance) {
    const s = statsByPlayer.get(row.playerId) ?? { attended: 0, total: 0 }
    s.total += row._count._all
    if (row.attendanceStatus === 'CONFIRMED' || row.attendanceStatus === 'LATE') {
      s.attended += row._count._all
    }
    statsByPlayer.set(row.playerId, s)
  }

  const enriched = players.map(p => {
    const s = statsByPlayer.get(p.id) ?? { attended: 0, total: 0 }
    return { ...p, attended: s.attended, totalMatches: s.total }
  })

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const data = sanitizePlayerInput(body)
  if (data instanceof Response) return data
  if (typeof data.name !== 'string' || data.name.trim() === '') {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  try {
    const player = await prisma.player.create({ data: { ...data, name: data.name } })
    return NextResponse.json(player, { status: 201 })
  } catch (err: unknown) {
    if (isP2002(err)) {
      return NextResponse.json({ error: 'Teléfono ya registrado' }, { status: 409 })
    }
    throw err
  }
}
