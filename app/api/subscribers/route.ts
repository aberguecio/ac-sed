import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const subscribers = await prisma.newsletterSubscriber.findMany({
    orderBy: { subscribedAt: 'desc' },
    select: { id: true, email: true, subscribedAt: true, active: true },
  })
  const total = subscribers.length
  const active = subscribers.filter((s) => s.active).length
  return NextResponse.json({ subscribers, total, active })
}

export async function DELETE(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '')

  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  await prisma.newsletterSubscriber.update({
    where: { id },
    data: { active: false },
  })

  return NextResponse.json({ ok: true })
}
