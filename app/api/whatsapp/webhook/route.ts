import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getWhatsappProvider,
  mapPollOption,
  normalizeInboundPhone,
  resolvePollVote,
} from '@/lib/whatsapp'

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const provider = getWhatsappProvider()

  // --- DEBUG: capturamos el body crudo antes de nada para poder inspeccionarlo.
  // Clonamos el request porque el body sólo se puede leer una vez.
  const rawBody = await req.clone().text()
  const hasKey = !!req.headers.get('x-integration-key')
  console.log('[whatsapp webhook] POST received', {
    hasIntegrationKey: hasKey,
    bodyPreview: rawBody.slice(0, 1500),
  })

  if (!provider.verifySignature(req)) {
    console.warn('[whatsapp webhook] signature verification FAILED')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vote = await provider.parsePollVote(req)
  if (!vote) {
    // Evento no relacionado con encuestas (mensaje de texto libre, sticker,
    // notificación del sistema, etc.). Responder 200 para que Evolution no
    // reintente.
    console.log('[whatsapp webhook] parsePollVote returned null — not a poll event')
    return NextResponse.json({ ok: true, handled: false })
  }

  console.log('[whatsapp webhook] parsed vote', vote)

  const existing = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: vote.eventId },
    select: { id: true },
  })
  if (existing) {
    console.log('[whatsapp webhook] duplicate eventId', vote.eventId)
    return NextResponse.json({ ok: true, duplicate: true })
  }

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

  console.log('[whatsapp webhook] updating attendance', {
    playerId: resolved.playerId,
    matchId: resolved.matchId,
    status,
  })

  const { playerId, matchId } = resolved

  await prisma.$transaction(async tx => {
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
    if (matchId != null) {
      await tx.playerMatch.update({
        where: { playerId_matchId: { playerId, matchId } },
        data: { attendanceStatus: status },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
