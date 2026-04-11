import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateMatchNews } from '@/lib/ai'
import slugify from 'slugify'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await prisma.newsArticle.findUnique({
    where: { id: parseInt(id) },
    include: { match: true },
  })
  if (!article?.match) {
    return NextResponse.json({ error: 'Article or match not found' }, { status: 404 })
  }

  const { title, content } = await generateMatchNews(article.match)
  const baseSlug = slugify(title, { lower: true, strict: true })
  const slug = `${baseSlug}-${Date.now()}`

  const updated = await prisma.newsArticle.update({
    where: { id: parseInt(id) },
    data: {
      title,
      slug,
      content,
      aiProvider: process.env.AI_PROVIDER ?? 'openai',
      generatedAt: new Date(),
    },
  })
  return NextResponse.json(updated)
}
