import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CHANNEL_KEYS } from '@/lib/ai-config'

export async function GET() {
  const rows = await prisma.aiChannelConfig.findMany()
  // Stable order matching CHANNEL_KEYS
  const sorted = CHANNEL_KEYS.map(k => rows.find(r => r.channel === k)).filter(Boolean)
  return NextResponse.json(sorted)
}
