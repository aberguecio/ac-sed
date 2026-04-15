import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACSED_TEAM_ID } from '@/lib/team-utils'

export async function GET() {
  const subscribers = await prisma.newsletterSubscriber.findMany({
    orderBy: { subscribedAt: 'desc' },
    select: { id: true, email: true, subscribedAt: true, active: true },
  })

  // Get AC SED player emails
  const playerEmails = await prisma.scrapedPlayer.findMany({
    where: {
      teamId: ACSED_TEAM_ID,
      email: { not: null }
    },
    select: { email: true, firstName: true, lastName: true },
  })

  // Get subscriber emails to check which players are already subscribed
  const subscriberEmails = new Set(subscribers.map((s: { email: string }) => s.email.toLowerCase()))

  // Combine both lists, but only include players that are NOT already subscribers
  const allEmails = [
    ...subscribers.map((s: { id: number; email: string; subscribedAt: Date; active: boolean }) => {
      // Check if this subscriber is also a player
      const playerInfo = playerEmails.find((p: { email: string | null }) =>
        p.email && p.email.toLowerCase() === s.email.toLowerCase()
      )
      return {
        id: s.id,
        email: s.email,
        subscribedAt: s.subscribedAt,
        active: s.active,
        source: playerInfo ? ('player' as const) : ('newsletter' as const),
        isSubscribed: true,
        playerName: playerInfo ? `${playerInfo.firstName} ${playerInfo.lastName}`.trim() : undefined
      }
    }),
    // Only include players that are NOT already subscribers (mark them as inactive)
    ...playerEmails
      .filter((p: { email: string | null }) => !subscriberEmails.has(p.email!.toLowerCase()))
      .map((p: { email: string | null; firstName: string; lastName: string }, i: number) => ({
        id: -1 - i, // Negative IDs to avoid conflicts
        email: p.email!,
        subscribedAt: new Date().toISOString(),
        active: false, // Not subscribed = inactive
        source: 'player' as const,
        playerName: `${p.firstName} ${p.lastName}`.trim(),
        isSubscribed: false
      }))
  ]

  const total = allEmails.length
  const active = allEmails.filter((s: { active: boolean }) => s.active).length

  return NextResponse.json({ subscribers: allEmails, total, active })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const email: string = (body.email ?? '').trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  // Check if already exists
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Ya está suscrito' }, { status: 400 })
  }

  await prisma.newsletterSubscriber.create({ data: { email } })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '')

  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  await prisma.newsletterSubscriber.update({
    where: { id },
    data: { active: true },
  })

  return NextResponse.json({ ok: true })
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
