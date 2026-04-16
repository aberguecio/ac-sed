import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { listTemplates } from '@/lib/ig-image-generator'

export async function GET() {
  const [templates, backgrounds] = await Promise.all([
    listTemplates(),
    prisma.instagramBackground.findMany({ orderBy: { createdAt: 'desc' } }),
  ])

  return NextResponse.json({ templates, backgrounds })
}
