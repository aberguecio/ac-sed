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
import { getBotConfig } from '@/lib/bot-config'

const GROUP_SUMMARY_DELAY_MS = 5 * 60 * 1000
const AI_RATE_LIMIT_MS = 10 * 1000
const AI_REPLY_TYPING_MS = 2500

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const provider = getWhatsappProvider()

  if (!provider.verifySignature(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: true, handled: false })
  }

  const vote = provider.parsePollVote(payload)
  if (vote) return handlePollVote(vote)

  // TEMP DEBUG — dump raw message object for incoming-text events so we can
  // find where Evolution puts mention metadata in LID-mode groups.
  const p = payload as { event?: string; data?: { message?: unknown; key?: unknown } }
  if (p?.event === 'messages.upsert') {
    console.log('[whatsapp webhook] raw messages.upsert', JSON.stringify({
      key: p.data?.key,
      message: p.data?.message,
    }, null, 2))
  }

  const text = provider.parseIncomingText(payload)
  if (text) {
    const result = await handleIncomingText(text)
    return NextResponse.json(result)
  }

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
  if (text.fromMe) return { ok: true, handled: false, reason: 'self' }

  const groupJid = process.env.WHATSAPP_ATTENDANCE_GROUP_JID
  const isTargetGroup = !!groupJid && text.remoteJid === groupJid
  const isDM = !text.isGroup

  // DMs are gated by the admin-panel toggle; group messages always pass this check.
  if (!isTargetGroup) {
    if (!isDM) return { ok: true, handled: false, reason: 'not-target-group' }
    const config = await getBotConfig()
    if (!config.aiAllowDms) return { ok: true, handled: false, reason: 'dm-disabled' }
  }

  // Mention requirement only applies in the group. In DM debug mode any message counts.
  if (text.isGroup) {
    const botJid = process.env.WHATSAPP_BOT_JID
    if (!botJid) return { ok: true, handled: false, reason: 'bot-jid-unset' }
    const botId = botJid.split('@')[0] ?? ''
    const mentionedFormally = text.mentionedJid.includes(botJid)
    const mentionedInText = botId.length > 0 && new RegExp(`@${botId}\\b`).test(text.text)
    if (!mentionedFormally && !mentionedInText) {
      return { ok: true, handled: false, reason: 'not-mentioned' }
    }
  }

  const existing = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: text.eventId },
    select: { id: true },
  })
  if (existing) return { ok: true, duplicate: true }

  const rateLimitKey = text.senderJid ?? text.remoteJid
  if (rateLimitKey) {
    const recent = await prisma.whatsappMessage.findFirst({
      where: {
        senderJid: rateLimitKey,
        direction: 'INBOUND',
        createdAt: { gte: new Date(Date.now() - AI_RATE_LIMIT_MS) },
      },
      select: { id: true },
    })
    if (recent) return { ok: true, handled: false, reason: 'rate-limited' }
  }

  const senderForLookup = text.senderJid ?? (isDM ? text.remoteJid : null)
  const phone = senderForLookup ? normalizeInboundPhone(stripJidToPhone(senderForLookup)) : null
  const player = phone
    ? await prisma.player.findFirst({
        where: { phoneNumber: phone },
        select: { id: true },
      })
    : null

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

  let answer: string
  try {
    const result = await answerGroupQuestion(text.text)
    answer = result.answer
  } catch (err) {
    console.error('[whatsapp ai] generation failed', err)
    return { ok: true, handled: false, reason: 'ai-error' }
  }

  if (!answer) return { ok: true, handled: false, reason: 'empty-answer' }

  try {
    const sent = await getWhatsappProvider().sendText(text.remoteJid, answer, AI_REPLY_TYPING_MS)
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
