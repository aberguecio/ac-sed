import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewsletterEmail } from '@/lib/aws'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const articleId = parseInt(id)

  if (isNaN(articleId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const article = await prisma.newsArticle.findUnique({ where: { id: articleId } })

  if (!article) {
    return NextResponse.json({ error: 'Noticia no encontrada' }, { status: 404 })
  }

  if (!article.published) {
    return NextResponse.json({ error: 'La noticia debe estar publicada antes de enviar el newsletter' }, { status: 400 })
  }

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { active: true },
    select: { email: true, unsubscribeToken: true },
  })

  if (subscribers.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No hay suscriptores activos' })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

  const sent = await sendNewsletterEmail(
    { title: article.title, slug: article.slug, content: article.content, imageUrl: article.imageUrl },
    subscribers,
    siteUrl
  )

  await prisma.newsArticle.update({
    where: { id: articleId },
    data: { emailSentAt: new Date() },
  })

  return NextResponse.json({ sent })
}
