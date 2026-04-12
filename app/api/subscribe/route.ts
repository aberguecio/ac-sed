import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const email: string = (body.email ?? '').trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } })

  if (existing) {
    if (existing.active) {
      return NextResponse.json({ message: 'Ya estás suscrito' }, { status: 200 })
    }
    // Reactivate
    await prisma.newsletterSubscriber.update({ where: { email }, data: { active: true } })
    return NextResponse.json({ message: '¡Bienvenido de vuelta! Tu suscripción fue reactivada.' })
  }

  await prisma.newsletterSubscriber.create({ data: { email } })
  return NextResponse.json({ message: '¡Suscripción exitosa! Te avisaremos de las próximas noticias.' })
}
