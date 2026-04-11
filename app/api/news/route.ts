import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const perPage = parseInt(searchParams.get('perPage') ?? '9')
  const all = searchParams.get('all') === 'true'

  const where = all ? {} : { published: true }
  const [articles, total] = await Promise.all([
    prisma.newsArticle.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.newsArticle.count({ where }),
  ])

  return NextResponse.json({ articles, total, page, pages: Math.ceil(total / perPage) })
}
