import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getWhatsappProvider,
  mapPollOption,
  normalizeInboundPhone,
  resolvePollVote,
} from '@/lib/whatsapp'
import { scheduleGroupSummary } from '@/lib/attendance-notifier'
import { answerGroupQuestion } from '@/lib/ai-whatsapp-agent'

const GROUP_SUMMARY_DELAY_MS = 5 * 60 * 1000
const AI_RATE_LIMIT_MS = 10 * 1000
const AI_REPLY_TYPING_MS = 2500

// DEBUG flag — when true, the AI bot also answers 1:1 DMs (no group/mention
// required). Flip back to false once the bot is verified end-to-end.
const AI_DEBUG_ALLOW_DM = true

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const provider = getWhatsappProvider()

  const sigOk = provider.verifySignature(req)
  console.log('[whatsapp webhook] POST received', {
    sigOk,
    contentType: req.headers.get('content-type'),
  })
  if (!sigOk) {
    console.warn('[whatsapp webhook] signature verification failed')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch (err) {
    console.warn('[whatsapp webhook] invalid JSON body', err)
    return NextResponse.json({ ok: true, handled: false })
  }

  const event = (payload as { event?: unknown })?.event
  console.log('[whatsapp webhook] payload event', {
    event,
    payloadPreview: JSON.stringify(payload).slice(0, 800),
  })

  const vote = provider.parsePollVote(payload)
  if (vote) {
    console.log('[whatsapp webhook] -> poll vote branch', { eventId: vote.eventId })
    return handlePollVote(vote)
  }

  const text = provider.parseIncomingText(payload)
  if (text) {
    console.log('[whatsapp webhook] -> incoming text branch', {
      eventId: text.eventId,
      remoteJid: text.remoteJid,
      isGroup: text.isGroup,
      fromMe: text.fromMe,
    })
    const result = await handleIncomingText(text)
    return NextResponse.json(result)
  }

  console.log('[whatsapp webhook] -> no parser matched, returning 200 noop')
  return NextResponse.json({ ok: true, handled: false })
}

type PollVote = NonNullable<ReturnType<ReturnType<typeof getWhatsappProvider>['parsePollVote']>>

async function handlePollVote(vote: PollVote): Promise<Response> {
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

type IncomingText = NonNullable<ReturnType<ReturnType<typeof getWhatsappProvider>['parseIncomingText']>>

async function handleIncomingText(text: IncomingText): Promise<Record<string, unknown>> {
  const groupJid = process.env.WHATSAPP_ATTENDANCE_GROUP_JID
  const botJid = process.env.WHATSAPP_BOT_JID

  console.log('[whatsapp ai] handleIncomingText', {
    eventId: text.eventId,
    remoteJid: text.remoteJid,
    senderJid: text.senderJid,
    isGroup: text.isGroup,
    fromMe: text.fromMe,
    mentionedJid: text.mentionedJid,
    textPreview: text.text.slice(0, 200),
    expectedGroupJid: groupJid ?? '(unset)',
    expectedBotJid: botJid ?? '(unset)',
    debugAllowDM: AI_DEBUG_ALLOW_DM,
  })

  if (text.fromMe) {
    console.log('[whatsapp ai] skip: fromMe (avoid loop)')
    return { ok: true, handled: false, reason: 'self' }
  }

  const isTargetGroup = !!groupJid && text.remoteJid === groupJid
  const isDM = !text.isGroup

  if (!isTargetGroup && !(AI_DEBUG_ALLOW_DM && isDM)) {
    console.log('[whatsapp ai] skip: not target group and DM debug disabled', {
      remoteJid: text.remoteJid,
      isGroup: text.isGroup,
    })
    return { ok: true, handled: false, reason: 'not-target-group' }
  }

  // En grupos exigimos mención al bot. En DMs (modo debug) cualquier mensaje cuenta.
  if (text.isGroup) {
    if (!botJid) {
      console.warn('[whatsapp ai] skip: WHATSAPP_BOT_JID not configured (group requires mention)')
      return { ok: true, handled: false, reason: 'bot-jid-missing' }
    }
    if (!text.mentionedJid.includes(botJid)) {
      console.log('[whatsapp ai] skip: bot not mentioned', {
        mentionedJid: text.mentionedJid,
        botJid,
      })
      return { ok: true, handled: false, reason: 'not-mentioned' }
    }
  } else {
    console.log('[whatsapp ai] DM path (debug mode) — skipping mention check')
  }

  // Idempotencia: si ya procesamos este providerMessageId, salir.
  const existing = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: text.eventId },
    select: { id: true },
  })
  if (existing) {
    console.log('[whatsapp ai] skip: duplicate providerMessageId', text.eventId)
    return { ok: true, duplicate: true }
  }

  // Rate limit por sender (10s) — protege contra spam y loops.
  // En DMs el "sender" efectivo es el remoteJid (no hay participant).
  const rateLimitKey = text.senderJid ?? text.remoteJid
  if (rateLimitKey) {
    const recent = await prisma.whatsappMessage.findFirst({
      where: {
        senderJid: rateLimitKey,
        direction: 'INBOUND',
        createdAt: { gte: new Date(Date.now() - AI_RATE_LIMIT_MS) },
      },
      select: { id: true, createdAt: true },
    })
    if (recent) {
      console.log('[whatsapp ai] skip: rate-limited', {
        rateLimitKey,
        previousAt: recent.createdAt,
      })
      return { ok: true, handled: false, reason: 'rate-limited' }
    }
  }

  // Resolver player si existe (best-effort).
  const senderForLookup = text.senderJid ?? (isDM ? text.remoteJid : null)
  const phone = senderForLookup ? normalizeInboundPhone(stripJidToPhone(senderForLookup)) : null
  const player = phone
    ? await prisma.player.findFirst({
        where: { phoneNumber: phone },
        select: { id: true, name: true },
      })
    : null
  console.log('[whatsapp ai] sender resolution', {
    senderForLookup,
    phone,
    matchedPlayer: player ? { id: player.id, name: player.name } : null,
  })

  // Persistir la pregunta antes de llamar al modelo (asegura idempotencia
  // aunque la generación falle o tarde).
  await prisma.whatsappMessage.create({
    data: {
      playerId: player?.id ?? null,
      groupJid: text.isGroup ? text.remoteJid : null,
      senderJid: rateLimitKey,
      direction: 'INBOUND',
      content: text.text,
      providerMessageId: text.eventId,
      timestamp: text.timestamp,
    },
  })
  console.log('[whatsapp ai] inbound persisted, calling model…', { question: text.text })

  let answer: string
  try {
    const startedAt = Date.now()
    const result = await answerGroupQuestion(text.text)
    answer = result.answer
    console.log('[whatsapp ai] model returned', {
      ms: Date.now() - startedAt,
      sender: rateLimitKey,
      toolCalls: result.toolCalls,
      finishReason: result.finishReason,
      answerLength: answer.length,
      answerPreview: answer.slice(0, 200),
    })
  } catch (err) {
    console.error('[whatsapp ai] generation failed', err)
    return { ok: true, handled: false, reason: 'ai-error' }
  }

  if (!answer) {
    console.warn('[whatsapp ai] skip: empty answer from model')
    return { ok: true, handled: false, reason: 'empty-answer' }
  }

  // Responder al mismo destinatario que envió el mensaje (grupo o DM).
  const replyTo = text.remoteJid
  try {
    console.log('[whatsapp ai] sending reply', { replyTo, length: answer.length })
    const sent = await getWhatsappProvider().sendText(replyTo, answer, AI_REPLY_TYPING_MS)
    await prisma.whatsappMessage.create({
      data: {
        playerId: null,
        groupJid: text.isGroup ? text.remoteJid : null,
        senderJid: null,
        direction: 'OUTBOUND',
        content: answer,
        providerMessageId: sent.id,
        timestamp: new Date(),
      },
    })
    console.log('[whatsapp ai] reply sent + persisted', { providerMessageId: sent.id })
  } catch (err) {
    console.error('[whatsapp ai] send failed', err)
    return { ok: true, handled: false, reason: 'send-error' }
  }

  return { ok: true, handled: true }
}

function stripJidToPhone(jid: string): string {
  const at = jid.indexOf('@')
  return at === -1 ? jid : jid.slice(0, at)
}
