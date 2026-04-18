import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getWhatsappProvider,
  mapPollOption,
  normalizeInboundPhone,
  resolvePollVote,
} from '@/lib/whatsapp'
import { scheduleGroupSummary } from '@/lib/attendance-notifier'

const GROUP_SUMMARY_DELAY_MS = 5 * 60 * 1000

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const provider = getWhatsappProvider()

  if (!provider.verifySignature(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vote = await provider.parsePollVote(req)
  if (!vote) {
    // Evento no relacionado con encuestas (mensaje de texto libre, sticker,
    // notificación del sistema, etc.). Responder 200 para que Evolution no
    // reintente.
    return NextResponse.json({ ok: true, handled: false })
  }

  const existing = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: vote.eventId },
    select: { id: true },
  })
  if (existing) return NextResponse.json({ ok: true, duplicate: true })

  const phone = normalizeInboundPhone(vote.from)
  if (!phone) {
    console.warn('[whatsapp webhook] invalid phone', vote.from)
    return NextResponse.json({ ok: true, handled: false })
  }

  const resolved = await resolvePollVote(vote.pollMessageId, phone)
  if (!resolved) {
    console.warn('[whatsapp webhook] unresolved poll vote', {
      pollMessageId: vote.pollMessageId,
      phone,
    })
    return NextResponse.json({ ok: true, handled: false })
  }

  const status = mapPollOption(vote.selectedOption)
  if (!status) {
    console.warn('[whatsapp webhook] unknown poll option', vote.selectedOption)
    return NextResponse.json({ ok: true, handled: false })
  }

  console.log('[whatsapp webhook] vote applied', {
    playerId: resolved.playerId,
    matchId: resolved.matchId,
    status,
  })

  const { playerId, matchId } = resolved

  const scheduleSummary = await prisma.$transaction(async tx => {
    await tx.whatsappMessage.create({
      data: {
        playerId,
        matchId,
        direction: 'INBOUND',
        content: vote.selectedOption,
        providerMessageId: vote.eventId,
        timestamp: vote.timestamp,
      },
    })
    if (matchId == null) return false

    await tx.playerMatch.update({
      where: { playerId_matchId: { playerId, matchId } },
      data: { attendanceStatus: status },
    })

    const match = await tx.match.findUnique({
      where: { id: matchId },
      select: { date: true },
    })
    if (!match || match.date <= new Date()) return false

    await tx.match.update({
      where: { id: matchId },
      data: { notifyGroupAt: new Date(Date.now() + GROUP_SUMMARY_DELAY_MS) },
    })
    return true
  })

  if (scheduleSummary && matchId != null) {
    scheduleGroupSummary(matchId, GROUP_SUMMARY_DELAY_MS)
  }

  return NextResponse.json({ ok: true })
}
