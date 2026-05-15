import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import slugify from 'slugify'

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
      select: {
        id: true, title: true, slug: true, published: true, featured: true,
        generatedAt: true, aiProvider: true, imageUrl: true, emailSentAt: true,
      },
    }),
    prisma.newsArticle.count({ where }),
  ])

  // Admin list needs newsletter tracking summary per article. Skip the
  // extra query for the public list — those callers never use it.
  if (all && articles.length > 0) {
    const sends = await prisma.newsletterSend.findMany({
      where: { articleId: { in: articles.map((a) => a.id) } },
      select: {
        articleId: true,
        openCount: true,
        clickCount: true,
        firstOpenedAt: true,
        firstClickedAt: true,
      },
    })
    const statsByArticle = new Map<number, {
      sentTo: number
      openedBy: number
      totalOpens: number
      clickedBy: number
      totalClicks: number
    }>()
    for (const s of sends) {
      const row = statsByArticle.get(s.articleId) ?? {
        sentTo: 0, openedBy: 0, totalOpens: 0, clickedBy: 0, totalClicks: 0,
      }
      row.sentTo++
      row.totalOpens += s.openCount
      row.totalClicks += s.clickCount
      if (s.firstOpenedAt) row.openedBy++
      if (s.firstClickedAt) row.clickedBy++
      statsByArticle.set(s.articleId, row)
    }
    const articlesWithStats = articles.map((a) => ({
      ...a,
      newsletterStats: statsByArticle.get(a.id) ?? null,
    }))
    return NextResponse.json({
      articles: articlesWithStats,
      total,
      page,
      pages: Math.ceil(total / perPage),
    })
  }

  return NextResponse.json({ articles, total, page, pages: Math.ceil(total / perPage) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, content, generatedAt, imageUrl } = body

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 })
    }

    // Generate slug
    const baseSlug = slugify(title, { lower: true, strict: true })
    const slug = `${baseSlug}-${Date.now()}`

    // Create article
    const article = await prisma.newsArticle.create({
      data: {
        title,
        slug,
        content,
        imageUrl: imageUrl || null,
        generatedAt: generatedAt ? new Date(generatedAt) : new Date(),
        aiProvider: 'manual',
        published: false,
      },
    })

    return NextResponse.json(article)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
