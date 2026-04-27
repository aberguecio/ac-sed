import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'
import { composeCustomImage } from '@/lib/ig-image-generator'
import { attachComposedImage, type ComposableImageType } from '@/lib/ig-image-pipeline'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const postId = parseInt(id)

  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { images: true },
  })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const contentType = req.headers.get('content-type') ?? ''

    // Custom image upload (FormData with file)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const composed = await composeCustomImage(buffer)

      const key = `instagram/${postId}/custom-${Date.now()}.jpeg`
      const imageUrl = await uploadImageToS3(composed, key, 'image/jpeg')

      const nextOrder = post.images.length
      const image = await prisma.instagramPostImage.create({
        data: {
          postId,
          imageUrl,
          backgroundUrl: null,
          orderIndex: nextOrder,
        },
      })

      return NextResponse.json(image)
    }

    // Generated image (JSON body)
    const body = await req.json()
    const { imageType, backgroundUrl } = body as {
      imageType: ComposableImageType
      backgroundUrl?: string
    }

    if (!imageType) {
      return NextResponse.json({ error: 'imageType required' }, { status: 400 })
    }

    if (!post.matchId) {
      return NextResponse.json({ error: 'Post needs a linked match for this image type' }, { status: 400 })
    }

    const match = await prisma.match.findUnique({
      where: { id: post.matchId },
      include: { homeTeam: true, awayTeam: true },
    })
    if (!match) {
      return NextResponse.json({ error: 'Linked match not found' }, { status: 400 })
    }

    const image = await attachComposedImage({
      postId,
      imageType,
      match,
      backgroundUrl,
      orderIndex: post.images.length,
    })

    return NextResponse.json(image)
  } catch (err) {
    console.error('Error generating Instagram image:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = req.nextUrl
  const imageId = searchParams.get('imageId')
  if (!imageId) return NextResponse.json({ error: 'imageId required' }, { status: 400 })

  await prisma.instagramPostImage.delete({ where: { id: parseInt(imageId) } })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = req.nextUrl
  const imageId = searchParams.get('imageId')
  if (!imageId) return NextResponse.json({ error: 'imageId required' }, { status: 400 })

  const body = await req.json()
  const updated = await prisma.instagramPostImage.update({
    where: { id: parseInt(imageId) },
    data: { orderIndex: body.orderIndex },
  })

  return NextResponse.json(updated)
}
