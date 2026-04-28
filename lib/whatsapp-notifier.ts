import { isACSED } from '@/lib/team-utils'
import { getWhatsappProvider } from '@/lib/whatsapp'
import type { Match, Team, NewsArticle, InstagramPost } from '@prisma/client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')

function groupJid(): string | null {
  return process.env.WHATSAPP_ATTENDANCE_GROUP_JID ?? null
}

/**
 * Send a plain-text message to the AC SED group. All notifier helpers go
 * through here so they share the same fire-and-forget semantics: if the
 * Evolution API call fails, we log and swallow — never block the caller.
 */
async function notifyGroup(text: string, source: string): Promise<void> {
  const to = groupJid()
  if (!to) {
    console.log(`[whatsapp-notifier] ${source}: no group jid configured, skipping`)
    return
  }
  try {
    const provider = getWhatsappProvider()
    await provider.sendText(to, text)
    console.log(`[whatsapp-notifier] ${source}: sent to ${to}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[whatsapp-notifier] ${source}: failed`, message.slice(0, 200))
  }
}

// ---------- AI out-of-credit detection ----------

const OUT_OF_CREDIT_PATTERNS: RegExp[] = [
  /insufficient[_\s]?quota/i,
  /credit\s*balance.{0,40}(low|exhausted|insufficient)/i,
  /you[' ]?(have)?\s*exceeded.{0,40}(quota|credit)/i,
  /payment\s*required/i,
  /balance.{0,20}(insufficient|exhausted)/i,
  /quota.{0,20}exceeded/i,
  /billing.{0,20}(hard|limit)/i,
]

export function isOutOfCreditError(err: unknown): boolean {
  if (!err) return false
  const e = err as { status?: number; statusCode?: number; message?: string; cause?: { message?: string } }
  const status = e.status ?? e.statusCode
  if (status === 402) return true // payment required, used by some OpenAI-compat hosts
  const blob = `${e.message ?? ''} ${e.cause?.message ?? ''} ${JSON.stringify(err).slice(0, 1000)}`
  return OUT_OF_CREDIT_PATTERNS.some(re => re.test(blob))
}

const lastNotifiedAt = new Map<string, number>()
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000 // don't spam the group more than once per 30min per channel

export async function notifyAiOutOfCredits(opts: {
  channel: string
  provider: string
  model: string
  error: unknown
}): Promise<void> {
  const key = `${opts.provider}:${opts.channel}`
  const now = Date.now()
  const last = lastNotifiedAt.get(key)
  if (last && now - last < NOTIFY_COOLDOWN_MS) return
  lastNotifiedAt.set(key, now)

  const errMsg = opts.error instanceof Error ? opts.error.message : String(opts.error)
  const summary = errMsg.split('\n')[0].slice(0, 160)
  const body =
    `🚨 Sin saldo en *${opts.provider.toUpperCase()}* (canal: ${opts.channel}, modelo ${opts.model}).\n` +
    `Recargá el plan o cambiá el canal a otro provider en /admin/ai-config.\n` +
    `Error: ${summary}`
  await notifyGroup(body, `ai-out-of-credits:${key}`)
}

// ---------- Match scraped ----------

type MatchWithTeams = Match & { homeTeam: Team | null; awayTeam: Team | null }

function matchLine(match: MatchWithTeams): string {
  const home = match.homeTeam?.name ?? 'TBD'
  const away = match.awayTeam?.name ?? 'TBD'
  if (match.homeScore !== null && match.awayScore !== null) {
    return `${home} ${match.homeScore} - ${match.awayScore} ${away}`
  }
  return `${home} vs ${away}`
}

export async function notifyMatchScraped(match: MatchWithTeams): Promise<void> {
  const line = matchLine(match)
  const acsedIsHome = isACSED(match.homeTeam?.name)
  const rival = acsedIsHome ? match.awayTeam?.name : match.homeTeam?.name
  const hasResult = match.homeScore !== null && match.awayScore !== null
  const link = SITE_URL ? `\n${SITE_URL}/admin/matches/${match.id}/info` : ''

  const headline = hasResult
    ? `🏟️ Partido cargado: ${line}`
    : `🗓️ Nuevo partido en el calendario vs ${rival ?? 'rival'}`

  await notifyGroup(`${headline}${link}`, `match-scraped:${match.id}`)
}

// ---------- News published ----------

type NewsForNotification = Pick<NewsArticle, 'id' | 'title' | 'slug'>

export async function notifyNewsPublished(article: NewsForNotification): Promise<void> {
  const link = SITE_URL ? `${SITE_URL}/news/${article.slug}` : `noticia #${article.id}`
  const body = `📰 Nueva noticia publicada: *${article.title}*\n${link}`
  await notifyGroup(body, `news-published:${article.id}`)
}

// ---------- Instagram published ----------

type InstagramForNotification = Pick<InstagramPost, 'id' | 'igMediaId' | 'postType'>

export async function notifyInstagramPublished(post: InstagramForNotification): Promise<void> {
  // The IG Graph API doesn't always return a permalink in our wrapper; we
  // surface the raw media id so the user can find the post (and link to the
  // public account profile as a fallback).
  const profile = 'https://instagram.com/ac.sed_2023'
  const lines = [
    `📸 Nuevo post en Instagram (${post.postType}).`,
    profile,
  ]
  if (post.igMediaId) lines.push(`media id: ${post.igMediaId}`)
  await notifyGroup(lines.join('\n'), `ig-published:${post.id}`)
}
