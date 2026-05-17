import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import { prisma } from '@/lib/db'
import { WHATSAPP_TOOL_KEYS } from '@/lib/ai-whatsapp-tool-keys'
import type { AiChannelConfig } from '@prisma/client'

export type ChannelKey = 'newsletter' | 'instagram' | 'whatsapp' | 'instagram_image'
export type Provider = 'openai' | 'anthropic' | 'deepseek' | 'minimax' | 'gemini'

export const PROVIDERS: Provider[] = ['openai', 'anthropic', 'deepseek', 'minimax', 'gemini']

// Image-generation channels don't go through the `ai` SDK; they're handled by
// `lib/ai-image-gen.ts`. Kept here so the same AiChannelConfig table powers
// both flows and the admin UI surfaces them automatically.
export const IMAGE_CHANNEL_KEYS: ChannelKey[] = ['instagram_image']
export function isImageChannel(channel: string): boolean {
  return (IMAGE_CHANNEL_KEYS as string[]).includes(channel)
}

export const SED_EDITORIAL_PROMPT = `You are generating a SQUARE 1080x1080 background image for an Instagram post about AC SED, a Chilean amateur football team.

Editorial rules — strictly follow:
- Reserve a clean, low-detail negative-space band at the TOP (at least 180px tall) and at the BOTTOM (at least 180px tall) for text overlays that will be composed on top. The center can be busier.
- DO NOT include any text, letters, numbers, scoreboards, logos, captions, or watermarks anywhere in the image. Text will be added later in post-processing.
- Preserve the AC SED palette where applicable: navy #1B2A4B, wheat #E8C77A, cream #F5EEDA. Avoid neon, oversaturated reds, or branded football team colors that aren't ours.
- Mood: epic, cinematic, sports-editorial. Slight motion blur, dramatic lighting, golden hour or stadium night lights when fitting.
- When reference images are provided, treat them as the visual source: keep the players/jerseys recognisable but reinterpret the scene per the user prompt. Combine elements naturally if multiple refs are given.
- Output must be a single coherent background — not a collage of unrelated tiles.`

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

export const CHANNEL_KEYS: ChannelKey[] = ['newsletter', 'instagram', 'whatsapp', 'instagram_image']

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

  if (cfg.provider === 'gemini') {
    throw new Error('Gemini is only supported for image channels; route through lib/ai-image-gen.ts')
  }
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
  systemPromptOverride?: string
}

export const DEFAULT_CHANNELS: DefaultChannel[] = [
  { channel: 'newsletter', provider: 'openai', model: 'gpt-4o-mini', maxTokens: 800, temperature: 0.7, maxSteps: null, enabledTools: [] },
  { channel: 'instagram',  provider: 'openai', model: 'gpt-4o-mini', maxTokens: 300, temperature: 0.9, maxSteps: null, enabledTools: [] },
  { channel: 'whatsapp',   provider: 'openai', model: 'gpt-4o-mini', maxTokens: 600, temperature: 0.5, maxSteps: 15, enabledTools: [...WHATSAPP_TOOL_KEYS] },
  // Image-gen channel for AI background generation in Instagram. maxTokens /
  // temperature are unused but kept to satisfy the shared schema; image-gen
  // happens in lib/ai-image-gen.ts, not via the `ai` SDK. The editorial prompt
  // ships as the default systemPromptOverride so it's tunable from /admin/ai-config.
  { channel: 'instagram_image', provider: 'openai', model: 'gpt-image-1', maxTokens: 0, temperature: 0, maxSteps: null, enabledTools: [], systemPromptOverride: SED_EDITORIAL_PROMPT },
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
