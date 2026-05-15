import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Always serve a 1x1 transparent GIF as the fallback body so that even
// when the token is invalid or the article has no imageUrl, the email
// client never renders a broken-image icon.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

function pixelResponse() {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      // Prevent the tracker from being cached by intermediaries so each
      // open round-trips back to us. Gmail's image proxy still caches
      // aggressively on its own, but at least we don't ask for caching.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    },
  })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (!token) return pixelResponse()

  try {
    const send = await prisma.newsletterSend.findUnique({
      where: { token },
      select: { id: true, firstOpenedAt: true },
    })

    if (send) {
      await prisma.newsletterSend.update({
        where: { id: send.id },
        data: {
          openCount: { increment: 1 },
          firstOpenedAt: send.firstOpenedAt ?? new Date(),
        },
      })
    }
  } catch (err) {
    // Fail-soft: never break the rendered email because of a tracking
    // hiccup. Log and fall through to the transparent GIF.
    console.error('[email-track-open] failed', err)
  }

  return pixelResponse()
}
