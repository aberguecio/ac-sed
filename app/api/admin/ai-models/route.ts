import { NextRequest, NextResponse } from 'next/server'

const FIVE_MIN = 5 * 60 * 1000

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

const OPENAI_FALLBACK = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']

const CHAT_MODEL_RE = /^(gpt-|o1-|o3-|o4-|chatgpt-)/i

let openaiCache: { at: number; models: string[] } | null = null

async function fetchOpenAiModels(): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Avoid Next caching the upstream call; we manage our own TTL.
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (!Array.isArray(body.data)) return null
    const ids = body.data
      .map((m: { id: string }) => m.id)
      .filter((id: string) => CHAT_MODEL_RE.test(id))
      .sort()
    return ids
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider') ?? 'openai'

  if (provider === 'anthropic') {
    return NextResponse.json({ provider, source: 'static', models: ANTHROPIC_MODELS })
  }

  if (provider !== 'openai') {
    return NextResponse.json({ error: 'unknown provider' }, { status: 400 })
  }

  const now = Date.now()
  if (openaiCache && now - openaiCache.at < FIVE_MIN) {
    return NextResponse.json({ provider, source: 'live-cached', models: openaiCache.models })
  }

  const live = await fetchOpenAiModels()
  if (live && live.length > 0) {
    openaiCache = { at: now, models: live }
    return NextResponse.json({ provider, source: 'live', models: live })
  }

  return NextResponse.json({ provider, source: 'fallback', models: OPENAI_FALLBACK })
}
