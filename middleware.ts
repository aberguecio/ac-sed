import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin/login'
  const isProtectedApi =
    (pathname.startsWith('/api/scrape') && req.method === 'POST') ||
    (pathname.startsWith('/api/news') && req.method !== 'GET') ||
    (pathname.startsWith('/api/players') && req.method !== 'GET') ||
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/api/subscribers')

  if ((isAdminRoute || isProtectedApi) && !req.auth) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/admin/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/api/scrape/:path*', '/api/news/:path*', '/api/players/:path*', '/api/upload', '/api/subscribers/:path*'],
}
