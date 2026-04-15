import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { postToInstagram } from '@/lib/instagram'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const articleId = parseInt(id)

  if (isNaN(articleId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
  })

  if (!article) {
    return NextResponse.json({ error: 'Noticia no encontrada' }, { status: 404 })
  }

  if (!article.published) {
    return NextResponse.json(
      { error: 'La noticia debe estar publicada antes de compartir en Instagram' },
      { status: 400 }
    )
  }

  if (!article.imageUrl) {
    return NextResponse.json(
      { error: 'La noticia necesita una imagen para publicar en Instagram' },
      { status: 400 }
    )
  }

  if (article.instagramPostId) {
    return NextResponse.json(
      { error: 'Esta noticia ya fue publicada en Instagram', postId: article.instagramPostId },
      { status: 409 }
    )
  }

  const postId = await postToInstagram(article.title, article.content, article.imageUrl)

  await prisma.newsArticle.update({
    where: { id: articleId },
    data: { instagramPostId: postId, instagramPostedAt: new Date() },
  })

  return NextResponse.json({ postId })
}
