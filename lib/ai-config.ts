import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import { prisma } from '@/lib/db'
import { WHATSAPP_TOOL_KEYS } from '@/lib/ai-whatsapp-tool-keys'
import type { AiChannelConfig } from '@prisma/client'

export type ChannelKey = 'newsletter' | 'instagram' | 'whatsapp'
export type Provider = 'openai' | 'anthropic' | 'deepseek' | 'minimax'

export const PROVIDERS: Provider[] = ['openai', 'anthropic', 'deepseek', 'minimax']

/**
 * Strip reasoning/chain-of-thought blocks that some models (deepseek-reasoner,
 * MiniMax-M2 family, etc.) inline into the response as <think>...</think>.
 * The ai-sdk does not split these out for OpenAI-compatible providers, so we
 * sanitise the final text before returning it to users.
 */
export function cleanModelText(s: string): string {
  return s
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()
}

export const CHANNEL_KEYS: ChannelKey[] = ['newsletter', 'instagram', 'whatsapp']

const cache = new Map<ChannelKey, AiChannelConfig>()

export async function getAiConfig(channel: ChannelKey): Promise<AiChannelConfig> {
  const hit = cache.get(channel)
  if (hit) return hit
  const row = await prisma.aiChannelConfig.findUnique({ where: { channel } })
  if (!row) {
    // Defensive fallback: if the seed didn't run for some reason, materialise
    // the default on demand instead of crashing the AI call.
    const def = DEFAULT_CHANNELS.find(d => d.channel === channel)
    if (!def) throw new Error(`No default for AI channel "${channel}"`)
    const created = await prisma.aiChannelConfig.create({ data: def })
    cache.set(channel, created)
    return created
  }
  cache.set(channel, row)
  return row
}

export function invalidateAiConfig(channel?: ChannelKey) {
  if (channel) cache.delete(channel)
  else cache.clear()
}

/**
 * Build an `ai`-sdk LanguageModel for the given channel config. Uses env
 * keys (per provider) — not editable from the admin UI by design.
 */
export function getModelForChannel(cfg: AiChannelConfig): LanguageModel {
  const settings = { structuredOutputs: false } as const

  if (cfg.provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    return apiKey ? createAnthropic({ apiKey })(cfg.model) : anthropic(cfg.model)
  }
  // DeepSeek and MiniMax expose OpenAI-compatible chat completions endpoints,
  // so we route them through createOpenAI() with their respective baseURL.
  if (cfg.provider === 'deepseek') {
    return createOpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY ?? 'dummy',
    })(cfg.model, settings)
  }
  if (cfg.provider === 'minimax') {
    return createOpenAI({
      baseURL: 'https://api.minimax.io/v1',
      apiKey: process.env.MINIMAX_API_KEY ?? 'dummy',
    })(cfg.model, settings)
  }
  // openai (default)
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL
  if (baseURL) {
    return createOpenAI({ baseURL, apiKey: apiKey ?? 'dummy' })(cfg.model, settings)
  }
  return apiKey
    ? createOpenAI({ apiKey })(cfg.model, settings)
    : openai(cfg.model, settings)
}

type DefaultChannel = {
  channel: ChannelKey
  provider: Provider
  model: string
  maxTokens: number
  temperature: number
  maxSteps: number | null
  enabledTools: string[]
}

export const DEFAULT_CHANNELS: DefaultChannel[] = [
  { channel: 'newsletter', provider: 'openai', model: 'gpt-4o-mini', maxTokens: 800, temperature: 0.7, maxSteps: null, enabledTools: [] },
  { channel: 'instagram',  provider: 'openai', model: 'gpt-4o-mini', maxTokens: 300, temperature: 0.9, maxSteps: null, enabledTools: [] },
  { channel: 'whatsapp',   provider: 'openai', model: 'gpt-4o-mini', maxTokens: 600, temperature: 0.5, maxSteps: 15, enabledTools: [...WHATSAPP_TOOL_KEYS] },
]

export async function seedAiChannelDefaults() {
  for (const def of DEFAULT_CHANNELS) {
    await prisma.aiChannelConfig.upsert({
      where: { channel: def.channel },
      update: {},
      create: def,
    })
  }
  invalidateAiConfig()
}
