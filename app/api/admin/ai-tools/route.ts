import { NextResponse } from 'next/server'
import { WHATSAPP_TOOL_KEYS, WHATSAPP_TOOL_DESCRIPTIONS } from '@/lib/ai-whatsapp-tool-keys'

export async function GET() {
  const tools = WHATSAPP_TOOL_KEYS.map(key => ({
    key,
    description: WHATSAPP_TOOL_DESCRIPTIONS[key],
  }))
  return NextResponse.json({ tools })
}
