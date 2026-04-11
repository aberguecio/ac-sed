import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
