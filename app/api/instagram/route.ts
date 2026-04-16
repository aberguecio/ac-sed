import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const perPage = parseInt(searchParams.get('perPage') ?? '50')

  const [posts, total] = await Promise.all([
    prisma.instagramPost.findMany({
      orderBy: { generatedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        match: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    }),
    prisma.instagramPost.count(),
  ])

  return NextResponse.json({ posts, total, page, pages: Math.ceil(total / perPage) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { caption, postType, matchId } = body

    if (!caption) {
      return NextResponse.json({ error: 'Caption is required' }, { status: 400 })
    }

    const post = await prisma.instagramPost.create({
      data: {
        caption,
        postType: postType ?? 'custom',
        matchId: matchId ? parseInt(matchId) : null,
        aiProvider: 'manual',
        status: 'draft',
      },
      include: {
        images: true,
        match: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json(post)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
