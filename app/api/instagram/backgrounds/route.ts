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

export async function PATCH(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const data: {
    name?: string
    usageCount?: number
    autoEligible?: boolean
    showOnHome?: boolean
  } = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    data.name = body.name.trim()
  }
  if ('usageCount' in body) {
    if (!Number.isInteger(body.usageCount) || body.usageCount < 0) {
      return NextResponse.json({ error: 'usageCount must be a non-negative integer' }, { status: 400 })
    }
    data.usageCount = body.usageCount
  }
  if ('autoEligible' in body) {
    if (typeof body.autoEligible !== 'boolean') {
      return NextResponse.json({ error: 'autoEligible must be boolean' }, { status: 400 })
    }
    data.autoEligible = body.autoEligible
  }
  if ('showOnHome' in body) {
    if (typeof body.showOnHome !== 'boolean') {
      return NextResponse.json({ error: 'showOnHome must be boolean' }, { status: 400 })
    }
    data.showOnHome = body.showOnHome
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 })
  }

  const updated = await prisma.instagramBackground.update({
    where: { id: parseInt(id) },
    data,
  })
  return NextResponse.json(updated)
}
