import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const articleId = parseInt(id)
  if (isNaN(articleId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, slug: true, emailSentAt: true },
  })
  if (!article) {
    return NextResponse.json({ error: 'Noticia no encontrada' }, { status: 404 })
  }

  const sends = await prisma.newsletterSend.findMany({
    where: { articleId },
    orderBy: { sentAt: 'desc' },
    include: {
      subscriber: { select: { email: true } },
      clicks: {
        orderBy: { clickedAt: 'asc' },
        select: { id: true, clickedAt: true, ip: true, userAgent: true },
      },
    },
  })

  const summary = sends.reduce(
    (acc, s) => {
      acc.sentTo++
      acc.totalOpens += s.openCount
      acc.totalClicks += s.clickCount
      if (s.firstOpenedAt) acc.openedBy++
      if (s.firstClickedAt) acc.clickedBy++
      return acc
    },
    { sentTo: 0, openedBy: 0, totalOpens: 0, clickedBy: 0, totalClicks: 0 }
  )

  return NextResponse.json({
    article,
    summary,
    sends: sends.map((s) => ({
      id: s.id,
      email: s.subscriber.email,
      sentAt: s.sentAt,
      firstOpenedAt: s.firstOpenedAt,
      openCount: s.openCount,
      firstClickedAt: s.firstClickedAt,
      clickCount: s.clickCount,
      clicks: s.clicks,
    })),
  })
}
