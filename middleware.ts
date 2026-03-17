import { NextRequest, NextResponse } from "next/server"
import { getBrandFromHostname, BRANDS } from "@/lib/brand"

export async function middleware(req: NextRequest) {
  // Basic Auth for dev is disabled for now.

  // Не блокируем маршруты NextAuth - они должны обрабатываться без проверки сессии
  if (req.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // ── Brand detection ──
  const host = req.headers.get('host') || ''
  const brandKey = getBrandFromHostname(host)
  const brand = BRANDS[brandKey]

  // Block tournament-related routes on IQSport domain
  if (brandKey === 'iqsport') {
    const pathname = req.nextUrl.pathname

    // demo.iqsport.ai → auto-append ?demo=true for intelligence routes
    if (host.startsWith('demo.') && pathname.includes('/intelligence') && !req.nextUrl.searchParams.has('demo')) {
      const url = req.nextUrl.clone()
      url.searchParams.set('demo', 'true')
      return NextResponse.redirect(url)
    }

    // Redirect root to /onboarding
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }

    // Block hidden routes → redirect to /clubs
    for (const pattern of brand.hiddenRoutePatterns) {
      if (pattern.test(pathname)) {
        return NextResponse.redirect(new URL('/clubs', req.url))
      }
    }
  }

  // Проверяем наличие cookie с сессией только для админских маршрутов
  // В production NextAuth использует __Secure- (два подчеркивания) для secure cookies
  const correctCookieName = process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const oldCookieName = process.env.NODE_ENV === 'production'
    ? '_Secure-next-auth.session-token' // Старая cookie с одним подчеркиванием
    : null

  const sessionToken = req.cookies.get(correctCookieName)
  const oldCookie = oldCookieName ? req.cookies.get(oldCookieName) : null

  // Debug logging
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const allCookies = req.cookies.getAll()
    console.log('[Middleware] Path:', req.nextUrl.pathname)
    console.log('[Middleware] Looking for cookie:', correctCookieName)
    console.log('[Middleware] Found session token:', sessionToken?.value ? 'YES' : 'NO')
    console.log('[Middleware] All cookies:', allCookies.map(c => ({ name: c.name, hasValue: !!c.value })))
  }

  // Set x-brand header for server components
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-brand', brandKey)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Если есть старая cookie, удаляем её
  if (oldCookie && oldCookieName) {
    response.cookies.delete(oldCookieName)
  }

  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!sessionToken) {
      console.log('[Middleware] No session token found, redirecting to signin')
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', req.url)
      return NextResponse.redirect(signInUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/protected/:path*',
    '/api/auth/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico).*)' // Match all routes except API, static files, and Next.js internals
  ]
}
