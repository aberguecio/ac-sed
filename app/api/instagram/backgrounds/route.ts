import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadImageToS3 } from '@/lib/aws'

export async function GET() {
  const backgrounds = await prisma.instagramBackground.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ backgrounds })
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string) || 'Fondo'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop() || 'jpeg'
  const key = `instagram/backgrounds/${Date.now()}.${ext}`
  const imageUrl = await uploadImageToS3(buffer, key, file.type || 'image/jpeg')

  const bg = await prisma.instagramBackground.create({
    data: { name, imageUrl },
  })

  return NextResponse.json(bg)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.instagramBackground.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}
