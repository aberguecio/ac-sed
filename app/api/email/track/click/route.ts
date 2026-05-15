import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function clientIp(req: NextRequest): string | null {
  // Vercel/Cloudflare/nginx all set one of these. Prefer the leftmost
  // entry in x-forwarded-for (the original client).
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip')
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/news`, 302)
  }

  try {
    const send = await prisma.newsletterSend.findUnique({
      where: { token },
      include: { article: { select: { slug: true } } },
    })

    if (!send) {
      return NextResponse.redirect(`${siteUrl}/news`, 302)
    }

    const ip = clientIp(req)
    const userAgent = req.headers.get('user-agent')

    // Run the counter bump and the event insert in parallel — neither
    // depends on the other and both should succeed or fail independently.
    await Promise.all([
      prisma.newsletterSend.update({
        where: { id: send.id },
        data: {
          clickCount: { increment: 1 },
          firstClickedAt: send.firstClickedAt ?? new Date(),
        },
      }),
      prisma.newsletterClick.create({
        data: { sendId: send.id, ip: ip ?? null, userAgent: userAgent ?? null },
      }),
    ])

    return NextResponse.redirect(`${siteUrl}/news/${send.article.slug}`, 302)
  } catch (err) {
    console.error('[email-track-click] failed', err)
    return NextResponse.redirect(`${siteUrl}/news`, 302)
  }
}
