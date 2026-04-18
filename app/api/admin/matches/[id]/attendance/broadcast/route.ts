import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendAttendancePoll, POLL_OPTIONS } from '@/lib/whatsapp'

// Dispara encuesta de asistencia por WhatsApp a todos los jugadores activos con
// teléfono cuya asistencia está en PENDING. Idempotente: re-click salta a quienes
// ya respondieron. Ejecuta secuencialmente con jitter 3–10 s (el delay también
// dispara el indicador de "escribiendo…" en el chat).

function jitterMs(): number {
  return 3000 + Math.floor(Math.random() * 7001)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: 'Invalid match id' }, { status: 400 })
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const candidates = await prisma.player.findMany({
    where: { active: true, phoneNumber: { not: null } },
    select: { id: true },
  })

  if (candidates.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: [], total: 0 })
  }

  await prisma.playerMatch.createMany({
    data: candidates.map(p => ({
      playerId: p.id,
      matchId,
      attendanceStatus: 'PENDING' as const,
    })),
    skipDuplicates: true,
  })

  const pending = await prisma.playerMatch.findMany({
    where: {
      matchId,
      attendanceStatus: 'PENDING',
      playerId: { in: candidates.map(c => c.id) },
    },
    select: { playerId: true },
  })

  let sent = 0
  let skipped = 0
  const failed: Array<{ playerId: number; reason: string }> = []

  for (let i = 0; i < pending.length; i++) {
    const { playerId } = pending[i]

    // Re-chequeo en caliente: si el jugador ya respondió (vía webhook) mientras
    // el loop estaba corriendo, lo saltamos.
    const fresh = await prisma.playerMatch.findUnique({
      where: { playerId_matchId: { playerId, matchId } },
      select: { attendanceStatus: true },
    })
    if (!fresh || fresh.attendanceStatus !== 'PENDING') {
      skipped++
      continue
    }

    const typingMs = jitterMs()
    const result = await sendAttendancePoll(playerId, matchId, typingMs)

    if (!result.ok) {
      failed.push({ playerId, reason: result.reason })
    } else {
      await prisma.whatsappMessage.create({
        data: {
          playerId,
          matchId,
          direction: 'OUTBOUND',
          content: JSON.stringify({ title: result.title, options: POLL_OPTIONS }),
          providerMessageId: result.providerMessageId,
          timestamp: new Date(),
        },
      })
      sent++
    }

    // No dormir después del último envío.
    if (i < pending.length - 1) await sleep(typingMs)
  }

  return NextResponse.json({
    sent,
    skipped,
    failed,
    total: pending.length,
  })
}
