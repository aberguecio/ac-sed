import { prisma } from '@/lib/db'
import { sendAttendancePoll, POLL_OPTIONS } from '@/lib/whatsapp'
import { ACSED_TEAM_ID } from '@/lib/team-utils'

export type BroadcastResult = {
  matchId: number
  sent: number
  skipped: number
  failed: Array<{ playerId: number; reason: string }>
  total: number
}

export type InitializeResult = {
  matchId: number
  created: number
  total: number
}

function jitterMs(): number {
  return 3000 + Math.floor(Math.random() * 7001)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Returns the next scheduled AC SED match (date >= now), or null if none.
export async function findNextAcsedMatch() {
  return prisma.match.findFirst({
    where: {
      date: { gte: new Date() },
      OR: [{ homeTeamId: ACSED_TEAM_ID }, { awayTeamId: ACSED_TEAM_ID }],
    },
    orderBy: { date: 'asc' },
  })
}

// Creates a PENDING PlayerMatch row for every active player (regardless of
// phone number). Idempotent via skipDuplicates.
export async function initializeAttendance(matchId: number): Promise<InitializeResult> {
  const activePlayers = await prisma.player.findMany({
    where: { active: true },
    select: { id: true },
  })

  const r = await prisma.playerMatch.createMany({
    data: activePlayers.map(p => ({
      playerId: p.id,
      matchId,
      attendanceStatus: 'PENDING' as const,
    })),
    skipDuplicates: true,
  })

  return { matchId, created: r.count, total: activePlayers.length }
}

// Initializes attendance and sends the WhatsApp poll to every PENDING player
// that has a phone number. Sequential with 3–10 s jitter to drive the
// "typing…" indicator.
export async function runAttendanceBroadcast(matchId: number): Promise<BroadcastResult> {
  await initializeAttendance(matchId)

  const candidates = await prisma.player.findMany({
    where: { active: true, phoneNumber: { not: null } },
    select: { id: true },
  })

  if (candidates.length === 0) {
    return { matchId, sent: 0, skipped: 0, failed: [], total: 0 }
  }

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

    // Hot recheck: if the player already replied via webhook while we were
    // looping, skip them.
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

    if (i < pending.length - 1) await sleep(typingMs)
  }

  return { matchId, sent, skipped, failed, total: pending.length }
}
