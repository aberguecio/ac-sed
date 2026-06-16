import { prisma } from '@/lib/db'

const IG_API_BASE = 'https://graph.instagram.com'
// Long-lived Instagram tokens last 60 days. Used as the optimistic expiry
// estimate when an admin pastes a token by hand (the refresh cron later
// replaces it with the exact value Instagram returns).
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

export type InstagramConfig = {
  id: number
  accessToken: string | null
  tokenExpiresAt: Date | null
  lastRefreshAt: Date | null
  lastRefreshError: string | null
  updatedAt: Date
}

export async function getInstagramConfig(): Promise<InstagramConfig> {
  return prisma.instagramConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
}

/**
 * Resolve the token the API layer should use: DB first, env var as fallback.
 * The env fallback keeps things working until an admin saves a token in the UI.
 */
export async function getInstagramToken(): Promise<string> {
  const cfg = await getInstagramConfig()
  const token = cfg.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN no configurado (cargalo en Admin → Configuración)')
  }
  return token
}

/**
 * Persist a token pasted by an admin. Expiry is estimated at 60 days out; the
 * refresh cron overwrites it with Instagram's exact `expires_in` on its next
 * run (which also requires the token to be >24h old).
 */
export async function setInstagramToken(token: string, expiresAt?: Date): Promise<InstagramConfig> {
  const tokenExpiresAt = expiresAt ?? new Date(Date.now() + SIXTY_DAYS_MS)
  return prisma.instagramConfig.upsert({
    where: { id: 1 },
    create: { id: 1, accessToken: token, tokenExpiresAt, lastRefreshError: null },
    update: { accessToken: token, tokenExpiresAt, lastRefreshError: null },
  })
}

export type RefreshResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: 'no-token' | 'expired' | 'api-error'; message: string }

/**
 * Extend the long-lived token's life by 60 days via Instagram's
 * `ig_refresh_token` grant. Requires a still-valid token that is at least 24h
 * old. A fully expired token cannot be refreshed — it must be re-issued by hand
 * through the admin UI.
 */
export async function refreshInstagramToken(): Promise<RefreshResult> {
  const cfg = await getInstagramConfig()
  const token = cfg.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null
  if (!token) return { ok: false, reason: 'no-token', message: 'No hay token configurado' }

  if (cfg.tokenExpiresAt && cfg.tokenExpiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: 'expired',
      message: `Token vencido el ${cfg.tokenExpiresAt.toISOString()}; regeneralo manualmente`,
    }
  }

  const url = `${IG_API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({} as Record<string, unknown>))

  if (!res.ok || (data as { error?: { message?: string } }).error) {
    const message =
      (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    await prisma.instagramConfig.update({
      where: { id: 1 },
      data: { lastRefreshAt: new Date(), lastRefreshError: message.slice(0, 500) },
    })
    return { ok: false, reason: 'api-error', message }
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 60 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + expiresInSec * 1000)
  await prisma.instagramConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      accessToken: data.access_token as string,
      tokenExpiresAt: expiresAt,
      lastRefreshAt: new Date(),
      lastRefreshError: null,
    },
    update: {
      accessToken: data.access_token as string,
      tokenExpiresAt: expiresAt,
      lastRefreshAt: new Date(),
      lastRefreshError: null,
    },
  })
  return { ok: true, expiresAt }
}
