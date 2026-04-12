import { NextRequest, NextResponse } from 'next/server'
import { uploadImageToS3 } from '@/lib/aws'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const articleId = formData.get('articleId') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido. Usa JPG, PNG o WebP.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'El archivo supera los 5MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type.split('/')[1]
  const timestamp = Date.now()
  const prefix = articleId ? `news/${articleId}` : 'news/general'
  const key = `${prefix}/${timestamp}.${ext}`

  const url = await uploadImageToS3(buffer, key, file.type)
  return NextResponse.json({ url })
}
