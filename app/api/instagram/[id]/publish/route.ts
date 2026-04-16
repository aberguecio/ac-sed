import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishSinglePost, publishCarouselPost } from '@/lib/instagram'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const postId = parseInt(id)

  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { images: { orderBy: { orderIndex: 'asc' } } },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.status !== 'draft') {
    return NextResponse.json({ error: 'Solo se pueden publicar posts en estado borrador' }, { status: 400 })
  }
  if (post.images.length === 0) {
    return NextResponse.json({ error: 'El post necesita al menos una imagen' }, { status: 400 })
  }

  // Set status to publishing
  await prisma.instagramPost.update({
    where: { id: postId },
    data: { status: 'publishing' },
  })

  try {
    let mediaId: string

    if (post.images.length === 1) {
      const result = await publishSinglePost(post.images[0].imageUrl, post.caption)
      mediaId = result.mediaId
    } else {
      const imageUrls = post.images.map(img => img.imageUrl)
      const result = await publishCarouselPost(imageUrls, post.caption)
      mediaId = result.mediaId
    }

    const updated = await prisma.instagramPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        igMediaId: mediaId,
        publishedAt: new Date(),
        errorMessage: null,
      },
      include: { images: { orderBy: { orderIndex: 'asc' } } },
    })

    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.instagramPost.update({
      where: { id: postId },
      data: { status: 'failed', errorMessage: message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
