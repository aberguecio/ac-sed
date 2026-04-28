import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { invalidateAiConfig, CHANNEL_KEYS, type ChannelKey } from '@/lib/ai-config'
import { WHATSAPP_TOOL_KEYS } from '@/lib/ai-whatsapp-tool-keys'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params
  if (!CHANNEL_KEYS.includes(channel as ChannelKey)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    provider,
    model,
    maxTokens,
    temperature,
    systemPromptOverride,
    maxSteps,
    enabledTools,
  } = body as Record<string, unknown>

  // Validation
  if (provider !== undefined && provider !== 'openai' && provider !== 'anthropic') {
    return NextResponse.json({ error: 'provider must be openai|anthropic' }, { status: 400 })
  }
  if (model !== undefined && (typeof model !== 'string' || model.length === 0 || model.length > 100)) {
    return NextResponse.json({ error: 'invalid model' }, { status: 400 })
  }
  if (maxTokens !== undefined) {
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32768) {
      return NextResponse.json({ error: 'maxTokens must be 1..32768' }, { status: 400 })
    }
  }
  if (temperature !== undefined) {
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return NextResponse.json({ error: 'temperature must be 0..2' }, { status: 400 })
    }
  }
  if (maxSteps !== undefined && maxSteps !== null) {
    if (typeof maxSteps !== 'number' || !Number.isFinite(maxSteps) || maxSteps < 1 || maxSteps > 50) {
      return NextResponse.json({ error: 'maxSteps must be 1..50' }, { status: 400 })
    }
  }
  if (enabledTools !== undefined) {
    if (!Array.isArray(enabledTools) || enabledTools.some(k => typeof k !== 'string')) {
      return NextResponse.json({ error: 'enabledTools must be string[]' }, { status: 400 })
    }
    if (channel === 'whatsapp') {
      const allowed = new Set(WHATSAPP_TOOL_KEYS as readonly string[])
      const bad = enabledTools.filter((k: string) => !allowed.has(k))
      if (bad.length > 0) {
        return NextResponse.json({ error: `unknown tool keys: ${bad.join(', ')}` }, { status: 400 })
      }
    }
  }

  const updated = await prisma.aiChannelConfig.update({
    where: { channel },
    data: {
      ...(provider !== undefined ? { provider: provider as string } : {}),
      ...(model !== undefined ? { model: model as string } : {}),
      ...(maxTokens !== undefined ? { maxTokens: maxTokens as number } : {}),
      ...(temperature !== undefined ? { temperature: temperature as number } : {}),
      ...(systemPromptOverride !== undefined
        ? { systemPromptOverride: systemPromptOverride === '' ? null : (systemPromptOverride as string | null) }
        : {}),
      ...(maxSteps !== undefined ? { maxSteps: maxSteps as number | null } : {}),
      ...(enabledTools !== undefined ? { enabledTools: enabledTools as string[] } : {}),
    },
  })

  invalidateAiConfig(channel as ChannelKey)
  return NextResponse.json(updated)
}
