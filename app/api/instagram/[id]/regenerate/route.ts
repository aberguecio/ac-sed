import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateInstagramCaption } from '@/lib/ai'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await prisma.instagramPost.findUnique({
    where: { id: parseInt(id) },
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!post.match) {
    return NextResponse.json({ error: 'El post no tiene partido asociado para regenerar' }, { status: 400 })
  }

  const caption = await generateInstagramCaption(
    post.match,
    post.postType as 'result' | 'promo' | 'custom'
  )

  const updated = await prisma.instagramPost.update({
    where: { id: parseInt(id) },
    data: {
      caption,
      aiProvider: process.env.AI_PROVIDER ?? 'openai',
      generatedAt: new Date(),
    },
    include: {
      images: { orderBy: { orderIndex: 'asc' } },
      match: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  })

  return NextResponse.json(updated)
}
