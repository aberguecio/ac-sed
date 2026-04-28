import { NextRequest, NextResponse } from 'next/server'

const FIVE_MIN = 5 * 60 * 1000

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

const OPENAI_FALLBACK = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']
const DEEPSEEK_FALLBACK = ['deepseek-chat', 'deepseek-reasoner']
const MINIMAX_MODELS = ['MiniMax-M2', 'MiniMax-Text-01', 'abab6.5s-chat']

const CHAT_MODEL_RE = /^(gpt-|o1-|o3-|o4-|chatgpt-)/i

type LiveCache = Record<string, { at: number; models: string[] }>
const cache: LiveCache = {}

async function fetchJsonModelList(url: string, apiKey: string | undefined, filter?: (id: string) => boolean) {
  if (!apiKey) return null
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (!Array.isArray(body.data)) return null
    const ids = body.data
      .map((m: { id: string }) => m.id)
      .filter((id: string) => typeof id === 'string' && (filter ? filter(id) : true))
      .sort()
    return ids
  } catch {
    return null
  }
}

function cached(provider: string) {
  const hit = cache[provider]
  if (hit && Date.now() - hit.at < FIVE_MIN) return hit.models
  return null
}

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider') ?? 'openai'

  if (provider === 'anthropic') {
    return NextResponse.json({ provider, source: 'static', models: ANTHROPIC_MODELS })
  }

  if (provider === 'minimax') {
    return NextResponse.json({ provider, source: 'static', models: MINIMAX_MODELS })
  }

  if (provider === 'deepseek') {
    const hit = cached(provider)
    if (hit) return NextResponse.json({ provider, source: 'live-cached', models: hit })
    const apiKey = process.env.DEEPSEEK_API_KEY
    const live = await fetchJsonModelList('https://api.deepseek.com/v1/models', apiKey)
    if (live && live.length > 0) {
      cache[provider] = { at: Date.now(), models: live }
      return NextResponse.json({ provider, source: 'live', models: live })
    }
    return NextResponse.json({ provider, source: 'fallback', models: DEEPSEEK_FALLBACK })
  }

  if (provider === 'openai') {
    const hit = cached(provider)
    if (hit) return NextResponse.json({ provider, source: 'live-cached', models: hit })
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY
    const live = await fetchJsonModelList('https://api.openai.com/v1/models', apiKey, id => CHAT_MODEL_RE.test(id))
    if (live && live.length > 0) {
      cache[provider] = { at: Date.now(), models: live }
      return NextResponse.json({ provider, source: 'live', models: live })
    }
    return NextResponse.json({ provider, source: 'fallback', models: OPENAI_FALLBACK })
  }

  return NextResponse.json({ error: 'unknown provider' }, { status: 400 })
}
