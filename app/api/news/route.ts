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
        instagramPostedAt: true,
      },
    }),
    prisma.newsArticle.count({ where }),
  ])

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
