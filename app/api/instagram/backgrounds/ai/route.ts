import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'
import { getAiConfig } from '@/lib/ai-config'
import { generateBackground } from '@/lib/ai-image-gen'

const MAX_REFS = 3

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    referenceIds?: unknown
    prompt?: unknown
    name?: unknown
  } | null

  if (!body) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  const referenceIds = Array.isArray(body.referenceIds)
    ? body.referenceIds.filter((n): n is number => Number.isInteger(n))
    : []
  if (referenceIds.length > MAX_REFS) {
    return NextResponse.json({ error: `up to ${MAX_REFS} references allowed` }, { status: 400 })
  }

  const cfg = await getAiConfig('instagram_image')

  const refRows = referenceIds.length > 0
    ? await prisma.instagramBackground.findMany({
        where: { id: { in: referenceIds } },
        select: { id: true, imageUrl: true },
      })
    : []

  if (refRows.length !== referenceIds.length) {
    return NextResponse.json({ error: 'one or more referenceIds not found' }, { status: 400 })
  }

  // Preserve the request order so refs match what the admin selected.
  const refsById = new Map(refRows.map(r => [r.id, r.imageUrl]))
  const refUrls = referenceIds.map(id => refsById.get(id)!).filter(Boolean)

  const refBuffers: Buffer[] = []
  for (const url of refUrls) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ab = await res.arrayBuffer()
      refBuffers.push(Buffer.from(ab))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return NextResponse.json({ error: `failed to fetch reference: ${message}` }, { status: 500 })
    }
  }

  let result
  try {
    result = await generateBackground({ refs: refBuffers, userPrompt: prompt, cfg })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'image generation failed'
    console.error('[ai-bg] generation error:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const ext = result.contentType === 'image/jpeg' ? 'jpeg' : 'png'
  const key = `instagram/backgrounds/ai-${Date.now()}.${ext}`
  const imageUrl = await uploadImageToS3(result.buffer, key, result.contentType)

  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : `AI · ${new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}`

  const bg = await prisma.instagramBackground.create({
    data: {
      name,
      imageUrl,
      aiPrompt: result.finalPrompt,
      aiProvider: result.provider,
      aiModel: result.model,
      aiReferenceIds: referenceIds,
      generatedAt: new Date(),
    },
  })

  console.log(`[ai-bg] generated id=${bg.id} provider=${result.provider} model=${result.model} refs=${referenceIds.length}`)
  return NextResponse.json(bg)
}
