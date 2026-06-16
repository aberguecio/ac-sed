import { NextResponse } from 'next/server'
import {
  getInstagramConfig,
  setInstagramToken,
  refreshInstagramToken,
} from '@/lib/instagram-config'

function maskToken(token: string | null): string | null {
  if (!token) return null
  if (token.length <= 10) return '••••'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

export async function GET() {
  const cfg = await getInstagramConfig()
  const effective = cfg.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null
  return NextResponse.json({
    configured: !!effective,
    source: cfg.accessToken ? 'db' : effective ? 'env' : 'none',
    tokenPreview: maskToken(cfg.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null),
    tokenExpiresAt: cfg.tokenExpiresAt,
    lastRefreshAt: cfg.lastRefreshAt,
    lastRefreshError: cfg.lastRefreshError,
  })
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const raw = body as { token?: unknown; action?: unknown }

  if (raw.action === 'refresh') {
    const result = await refreshInstagramToken()
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })
    return NextResponse.json({ ok: true, tokenExpiresAt: result.expiresAt })
  }

  if (typeof raw.token !== 'string' || raw.token.trim().length < 20) {
    return NextResponse.json({ error: 'token inválido' }, { status: 400 })
  }

  const cfg = await setInstagramToken(raw.token.trim())
  return NextResponse.json({ ok: true, tokenExpiresAt: cfg.tokenExpiresAt })
}
