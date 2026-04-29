import { NextRequest, NextResponse } from "next/server"
import { getBrandFromHostname, BRANDS } from "@/lib/brand"

const PUBLIC_FILE = /\.(.*)$/
const PUBLIC_PAGE_PREFIXES = [
  '/auth',
  '/login',
  '/unsubscribe',
]

function isPublicPageRoute(pathname: string) {
  if (PUBLIC_FILE.test(pathname)) return true
  return PUBLIC_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function middleware(req: NextRequest) {
  // Basic Auth for dev is disabled for now.

  // Не блокируем маршруты NextAuth - они должны обрабатываться без проверки сессии
  if (req.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Clear stale session cookies on OAuth errors to prevent login loops.
  // Without this, a leftover JWT from a previous domain/session causes
  // OAuthAccountNotLinked errors that users can't fix without clearing cookies.
  if (req.nextUrl.pathname === '/auth/signin' && req.nextUrl.searchParams.get('error') === 'OAuthAccountNotLinked') {
    const url = req.nextUrl.clone()
    url.searchParams.delete('error')
    const response = NextResponse.redirect(url)
    response.cookies.delete('__Secure-next-auth.session-token')
    response.cookies.delete('next-auth.session-token')
    response.cookies.delete('__Secure-next-auth.callback-url')
    response.cookies.delete('next-auth.callback-url')
    response.cookies.delete('__Secure-next-auth.csrf-token')
    response.cookies.delete('next-auth.csrf-token')
    return response
  }

  // Проверяем наличие cookie с сессией
  // В production NextAuth использует __Secure- (два подчеркивания) для secure cookies
  const correctCookieName = process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const oldCookieName = process.env.NODE_ENV === 'production'
    ? '_Secure-next-auth.session-token' // Старая cookie с одним подчеркиванием
    : null

  const allCookies = req.cookies.getAll()
  const sessionToken = allCookies.find((cookie) => (
    cookie.name === correctCookieName || cookie.name.startsWith(`${correctCookieName}.`)
  ))
  const oldCookie = oldCookieName
    ? allCookies.find((cookie) => cookie.name === oldCookieName || cookie.name.startsWith(`${oldCookieName}.`))
    : null

  if (!sessionToken && !isPublicPageRoute(req.nextUrl.pathname)) {
    const signInUrl = new URL('/auth/signin', req.url)
    const callbackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`
    signInUrl.searchParams.set('callbackUrl', callbackPath)
    const response = NextResponse.redirect(signInUrl)
    if (oldCookieName) response.cookies.delete(oldCookieName)
    return response
  }

  // ── Brand detection ──
  const host = req.headers.get('host') || ''
  const brandKey = getBrandFromHostname(host)
  const brand = BRANDS[brandKey]

  // Block tournament-related routes on IQSport domain
  if (brandKey === 'iqsport') {
    const pathname = req.nextUrl.pathname

    // demo.iqsport.ai → redirect root to intelligence dashboard with demo mode
    if (host.startsWith('demo.')) {
      if (pathname === '/' || pathname === '/clubs') {
        return NextResponse.redirect(new URL('/clubs/demo-club/intelligence?demo=true', req.url))
      }
      // Auto-append ?demo=true for intelligence routes
      if ((pathname.includes('/intelligence') || pathname === '/onboarding') && !req.nextUrl.searchParams.has('demo')) {
        const url = req.nextUrl.clone()
        url.searchParams.set('demo', 'true')
        return NextResponse.redirect(url)
      }
    }

    // Block hidden routes → redirect to /clubs
    for (const pattern of brand.hiddenRoutePatterns) {
      if (pattern.test(pathname)) {
        return NextResponse.redirect(new URL('/clubs', req.url))
      }
    }
  }

  // IQSport root redirect (needs cookie check above)
  if (brandKey === 'iqsport' && !host.startsWith('demo.')) {
    const pathname = req.nextUrl.pathname
    if (pathname === '/' || pathname === '/onboarding') {
      const hasSession = !!sessionToken || !!oldCookie
      if (hasSession) {
        return NextResponse.redirect(new URL('/clubs', req.url))
      } else {
        return NextResponse.redirect(new URL('/auth/signin?callbackUrl=/clubs', req.url))
      }
    }
  }

  // Debug logging
  if (req.nextUrl.pathname.startsWith('/admin')) {
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
