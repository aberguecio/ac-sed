import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await prisma.newsArticle.findUnique({
    where: { id: parseInt(id) },
    select: { id: true, title: true, content: true, generatedAt: true, match: { select: { date: true } } },
  })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(article)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const article = await prisma.newsArticle.update({
    where: { id: parseInt(id) },
    data: body,
  })
  return NextResponse.json(article)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.newsArticle.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}
