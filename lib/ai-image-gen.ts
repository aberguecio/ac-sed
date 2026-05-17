import OpenAI, { toFile } from 'openai'
import { GoogleGenAI } from '@google/genai'
import type { AiChannelConfig } from '@prisma/client'
import { SED_EDITORIAL_PROMPT } from '@/lib/ai-config'

export type ImageGenInput = {
  refs: Buffer[]
  userPrompt: string
  cfg: AiChannelConfig
}

export type ImageGenResult = {
  buffer: Buffer
  contentType: string
  provider: string
  model: string
  finalPrompt: string
}

function buildFinalPrompt(cfg: AiChannelConfig, userPrompt: string): string {
  const system = cfg.systemPromptOverride?.trim() || SED_EDITORIAL_PROMPT
  const trimmed = userPrompt.trim()
  return trimmed ? `${system}\n\nUser request: ${trimmed}` : system
}

async function generateOpenAI({ refs, cfg, finalPrompt }: { refs: Buffer[]; cfg: AiChannelConfig; finalPrompt: string }): Promise<ImageGenResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  const client = new OpenAI({ apiKey })

  const size = '1024x1024' as const

  if (refs.length > 0) {
    const images = await Promise.all(
      refs.map((buf, i) => toFile(buf, `ref-${i}.png`, { type: 'image/png' }))
    )
    const res = await client.images.edit({
      model: cfg.model,
      image: images,
      prompt: finalPrompt,
      size,
      n: 1,
    })
    const b64 = res.data?.[0]?.b64_json
    if (!b64) throw new Error('OpenAI returned no image data')
    return {
      buffer: Buffer.from(b64, 'base64'),
      contentType: 'image/png',
      provider: 'openai',
      model: cfg.model,
      finalPrompt,
    }
  }

  const res = await client.images.generate({
    model: cfg.model,
    prompt: finalPrompt,
    size,
    n: 1,
  })
  const b64 = res.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image data')
  return {
    buffer: Buffer.from(b64, 'base64'),
    contentType: 'image/png',
    provider: 'openai',
    model: cfg.model,
    finalPrompt,
  }
}

async function generateGemini({ refs, cfg, finalPrompt }: { refs: Buffer[]; cfg: AiChannelConfig; finalPrompt: string }): Promise<ImageGenResult> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set')
  const client = new GoogleGenAI({ apiKey })

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
  for (const buf of refs) {
    parts.push({ inlineData: { mimeType: 'image/png', data: buf.toString('base64') } })
  }
  parts.push({ text: finalPrompt })

  const res = await client.models.generateContent({
    model: cfg.model,
    contents: [{ role: 'user', parts }],
  })

  const candidate = res.candidates?.[0]
  const imagePart = candidate?.content?.parts?.find(p => p.inlineData?.data)
  const b64 = imagePart?.inlineData?.data
  if (!b64) {
    const textOut = candidate?.content?.parts?.find(p => p.text)?.text
    throw new Error(`Gemini returned no image data${textOut ? ` (text: ${textOut.slice(0, 200)})` : ''}`)
  }
  return {
    buffer: Buffer.from(b64, 'base64'),
    contentType: imagePart.inlineData?.mimeType ?? 'image/png',
    provider: 'gemini',
    model: cfg.model,
    finalPrompt,
  }
}

export async function generateBackground(input: ImageGenInput): Promise<ImageGenResult> {
  const { cfg, refs, userPrompt } = input
  const finalPrompt = buildFinalPrompt(cfg, userPrompt)

  if (cfg.provider === 'gemini') {
    return generateGemini({ refs, cfg, finalPrompt })
  }
  if (cfg.provider === 'openai') {
    return generateOpenAI({ refs, cfg, finalPrompt })
  }
  throw new Error(`Provider "${cfg.provider}" is not supported for image generation. Use 'openai' or 'gemini'.`)
}
