import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: token },
  })

  if (!subscriber) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  await prisma.newsletterSubscriber.update({
    where: { unsubscribeToken: token },
    data: { active: false },
  })

  return NextResponse.redirect(new URL('/unsubscribe?success=1', req.url))
}
