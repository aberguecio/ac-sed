import { prisma } from '@/lib/db'
import { normalizeChileanPhone } from '@/lib/phone-utils'
import { isACSED } from '@/lib/team-utils'

export type AttendanceVote = 'CONFIRMED' | 'DECLINED' | 'LATE' | 'VISITING'

export const POLL_OPTIONS = ['Sí', 'No', 'Llego tarde', 'Voy de visita'] as const
export type PollOption = (typeof POLL_OPTIONS)[number]

const OPTION_TO_STATUS: Record<PollOption, AttendanceVote> = {
  'Sí': 'CONFIRMED',
  'No': 'DECLINED',
  'Llego tarde': 'LATE',
  'Voy de visita': 'VISITING',
}

export function mapPollOption(option: string | null | undefined): AttendanceVote | null {
  if (!option) return null
  return OPTION_TO_STATUS[option as PollOption] ?? null
}

export interface ParsedPollVote {
  from: string
  pollMessageId: string
  selectedOption: string
  timestamp: Date
  eventId: string
}

export interface WhatsappProvider {
  sendPoll(
    to: string,
    title: string,
    options: readonly string[],
    typingMs: number
  ): Promise<{ id: string }>
  sendText(to: string, body: string, typingMs?: number): Promise<{ id: string }>
  parsePollVote(req: Request): Promise<ParsedPollVote | null>
  verifySignature(req: Request): boolean
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

function stripWhatsappJid(jid: string): string {
  return jid.split('@')[0] ?? jid
}

// Evolution v2 poll-vote payloads expose the decrypted choice in one of two
// paths depending on build. Tries both, case-insensitively.
function extractSelectedOption(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  const viaPollUpdates = Array.isArray(d.pollUpdates) && d.pollUpdates.length > 0
    ? (d.pollUpdates[0] as Record<string, unknown>)
    : null
  const viaMessage = d.message && typeof d.message === 'object'
    ? ((d.message as Record<string, unknown>).pollUpdateMessage as Record<string, unknown> | undefined)
    : undefined

  const candidates: unknown[] = []
  if (viaPollUpdates) {
    const vote = (viaPollUpdates.vote ?? viaPollUpdates.voteMessage) as Record<string, unknown> | undefined
    if (vote) candidates.push((vote.selectedOptions as unknown[] | undefined)?.[0])
  }
  if (viaMessage) {
    const vote = viaMessage.vote as Record<string, unknown> | undefined
    if (vote) candidates.push((vote.selectedOptions as unknown[] | undefined)?.[0])
  }

  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}

function extractPollCreationId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  const message = d.message as Record<string, unknown> | undefined
  const pollUpdate = message?.pollUpdateMessage as Record<string, unknown> | undefined
  const key = pollUpdate?.pollCreationMessageKey as Record<string, unknown> | undefined
  const id = key?.id
  if (typeof id === 'string' && id.length > 0) return id

  const viaPollUpdates = Array.isArray(d.pollUpdates) && d.pollUpdates.length > 0
    ? (d.pollUpdates[0] as Record<string, unknown>)
    : null
  const altKey = viaPollUpdates?.pollCreationMessageKey as Record<string, unknown> | undefined
  const altId = altKey?.id
  return typeof altId === 'string' && altId.length > 0 ? altId : null
}

class EvolutionProvider implements WhatsappProvider {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly instance: string
  private readonly webhookSecret: string

  constructor() {
    this.baseUrl = requireEnv('EVOLUTION_API_URL').replace(/\/+$/, '')
    this.apiKey = requireEnv('EVOLUTION_API_KEY')
    this.instance = requireEnv('EVOLUTION_INSTANCE')
    this.webhookSecret = requireEnv('WHATSAPP_WEBHOOK_SECRET')
  }

  async sendPoll(
    to: string,
    title: string,
    options: readonly string[],
    typingMs: number
  ): Promise<{ id: string }> {
    const url = `${this.baseUrl}/message/sendPoll/${encodeURIComponent(this.instance)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({
        number: to,
        name: title,
        selectableCount: 1,
        values: options,
        delay: typingMs,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Evolution sendPoll ${res.status}: ${text.slice(0, 300)}`)
    }
    const body = (await res.json()) as Record<string, unknown>
    const key = body?.key as Record<string, unknown> | undefined
    const id = (key?.id ?? body?.messageId ?? body?.id) as string | undefined
    if (!id) throw new Error('Evolution sendPoll: no message id in response')
    return { id }
  }

  async sendText(to: string, body: string, typingMs?: number): Promise<{ id: string }> {
    const url = `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`
    const payload: Record<string, unknown> = { number: to, text: body }
    if (typingMs && typingMs > 0) payload.delay = typingMs
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Evolution sendText ${res.status}: ${text.slice(0, 300)}`)
    }
    const resp = (await res.json()) as Record<string, unknown>
    const key = resp?.key as Record<string, unknown> | undefined
    const id = (key?.id ?? resp?.messageId ?? resp?.id) as string | undefined
    if (!id) throw new Error('Evolution sendText: no message id in response')
    return { id }
  }

  async parsePollVote(req: Request): Promise<ParsedPollVote | null> {
    let payload: Record<string, unknown>
    try {
      payload = (await req.json()) as Record<string, unknown>
    } catch {
      return null
    }
    const data = payload.data as Record<string, unknown> | undefined
    if (!data) return null

    const pollMessageId = extractPollCreationId(data)
    const selectedOption = extractSelectedOption(data)
    if (!pollMessageId || !selectedOption) return null

    const key = data.key as Record<string, unknown> | undefined
    const remoteJid = key?.remoteJid
    const eventId = key?.id
    if (typeof remoteJid !== 'string' || typeof eventId !== 'string') return null

    const tsRaw = data.messageTimestamp
    const tsSec = typeof tsRaw === 'number'
      ? tsRaw
      : typeof tsRaw === 'string' ? parseInt(tsRaw, 10) : NaN
    const timestamp = Number.isFinite(tsSec) ? new Date(tsSec * 1000) : new Date()

    return {
      from: stripWhatsappJid(remoteJid),
      pollMessageId,
      selectedOption,
      timestamp,
      eventId,
    }
  }

  verifySignature(req: Request): boolean {
    const received = req.headers.get('x-integration-key') ?? ''
    const expected = this.webhookSecret
    if (received.length !== expected.length) return false
    // Constant-time compare para evitar leak de info vía timing.
    let diff = 0
    for (let i = 0; i < received.length; i++) {
      diff |= received.charCodeAt(i) ^ expected.charCodeAt(i)
    }
    return diff === 0
  }
}

let providerSingleton: WhatsappProvider | null = null
export function getWhatsappProvider(): WhatsappProvider {
  if (!providerSingleton) providerSingleton = new EvolutionProvider()
  return providerSingleton
}

function formatMatchWhen(when: Date): string {
  const day = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Santiago',
  }).format(when)
  const time = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago',
  }).format(when)
  return `${day} a las ${time}`
}

export function buildPollTitle(rivalName: string, when: Date, _venue: string | null): string {
  return `¿Asistes al partido contra ${rivalName} el ${formatMatchWhen(when)}?`
}

export async function sendAttendancePoll(
  playerId: number,
  matchId: number,
  typingMs: number
): Promise<{ ok: true; providerMessageId: string; title: string } | { ok: false; reason: string }> {
  const [player, match] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, phoneNumber: true, name: true },
    }),
    prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    }),
  ])

  if (!player) return { ok: false, reason: 'player not found' }
  if (!match) return { ok: false, reason: 'match not found' }
  if (!player.phoneNumber) return { ok: false, reason: 'no phone' }

  const rival = isACSED(match.homeTeam?.name) ? match.awayTeam : match.homeTeam
  const rivalName = rival?.name ?? 'rival'
  const title = buildPollTitle(rivalName, match.date, match.venue)

  const provider = getWhatsappProvider()
  try {
    const { id } = await provider.sendPoll(player.phoneNumber, title, POLL_OPTIONS, typingMs)
    return { ok: true, providerMessageId: id, title }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, reason }
  }
}

// Devuelve un playerId y matchId a partir del id del poll original (OUTBOUND),
// verificando además que el teléfono del votante coincida con el del jugador al
// que se envió. null si no se resuelve.
export async function resolvePollVote(
  pollMessageId: string,
  voterPhone: string
): Promise<{ playerId: number; matchId: number | null } | null> {
  const original = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: pollMessageId },
    select: {
      playerId: true,
      matchId: true,
      direction: true,
      player: { select: { phoneNumber: true } },
    },
  })
  if (!original || original.direction !== 'OUTBOUND') return null
  if (original.player.phoneNumber !== voterPhone) return null
  return { playerId: original.playerId, matchId: original.matchId }
}

export function normalizeInboundPhone(raw: string): string | null {
  return normalizeChileanPhone(raw)
}

type SummaryRow = {
  status: AttendanceVote
  number: number | null
  display: string
}

function pickDisplayName(name: string, nicknames: string[]): string {
  return nicknames[0] ?? name.split(' ')[0] ?? name
}

function sortForSummary(a: SummaryRow, b: SummaryRow): number {
  const order: Record<AttendanceVote, number> = {
    CONFIRMED: 0, LATE: 1, VISITING: 2, DECLINED: 3,
  }
  if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
  const na = a.number ?? 9999
  const nb = b.number ?? 9999
  if (na !== nb) return na - nb
  return a.display.localeCompare(b.display, 'es')
}

export function buildGroupSummaryMessage(
  rivalName: string,
  when: Date,
  venue: string | null,
  rows: SummaryRow[]
): string {
  const header = `Partido vs ${rivalName} - ${formatMatchWhen(when)}`
  const venueLine = venue ? `\nCancha: ${venue}` : ''
  if (rows.length === 0) {
    return `${header}${venueLine}\n\nAún no hay asistentes confirmados.`
  }
  const sorted = [...rows].sort(sortForSummary)
  const lines = sorted.map((r, i) => {
    const suffix =
      r.status === 'LATE' ? ' (llega tarde)' :
      r.status === 'VISITING' ? ' (de visita)' : ''
    return `${i + 1}. ${r.display}${suffix}`
  })
  return `${header}${venueLine}\n\nAsistentes (${sorted.length}):\n${lines.join('\n')}`
}

export async function sendAttendanceSummaryToGroup(
  matchId: number
): Promise<{ ok: true; providerMessageId: string; body: string } | { ok: false; reason: string }> {
  const groupJid = process.env.WHATSAPP_ATTENDANCE_GROUP_JID
  if (!groupJid) return { ok: false, reason: 'no group jid' }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      playerMatches: {
        where: { attendanceStatus: { in: ['CONFIRMED', 'LATE', 'VISITING'] } },
        select: {
          attendanceStatus: true,
          player: { select: { name: true, nicknames: true, number: true } },
        },
      },
    },
  })
  if (!match) return { ok: false, reason: 'match not found' }

  const rival = isACSED(match.homeTeam?.name) ? match.awayTeam : match.homeTeam
  const rivalName = rival?.name ?? 'rival'

  const rows: SummaryRow[] = match.playerMatches.map(pm => ({
    status: pm.attendanceStatus as AttendanceVote,
    number: pm.player.number,
    display: pickDisplayName(pm.player.name, pm.player.nicknames),
  }))

  const body = buildGroupSummaryMessage(rivalName, match.date, match.venue, rows)

  const provider = getWhatsappProvider()
  const typingMs = 3000 + Math.floor(Math.random() * 2001) // 3000–5000ms
  try {
    const { id } = await provider.sendText(groupJid, body, typingMs)
    return { ok: true, providerMessageId: id, body }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, reason }
  }
}
