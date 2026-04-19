import { NextResponse } from 'next/server'
import { getBotConfig, setBotConfig } from '@/lib/bot-config'

export async function GET() {
  const config = await getBotConfig()
  return NextResponse.json(config)
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const raw = body as { aiAllowDms?: unknown }
  if (typeof raw.aiAllowDms !== 'boolean') {
    return NextResponse.json({ error: 'aiAllowDms must be boolean' }, { status: 400 })
  }

  const config = await setBotConfig({ aiAllowDms: raw.aiAllowDms })
  return NextResponse.json(config)
}
