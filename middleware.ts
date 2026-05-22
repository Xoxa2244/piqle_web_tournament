import { NextRequest, NextResponse } from "next/server"
import {
  INVITE_REGISTRATION_TOURNAMENT_COOKIE,
  addInviteRegistrationTournamentId,
} from "@/lib/inviteRegistrationGate"

export async function middleware(req: NextRequest) {
  // Basic Auth for dev is disabled for now.

  // Не блокируем маршруты NextAuth - они должны обрабатываться без проверки сессии
  if (req.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
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

  const response = NextResponse.next()

  const inviteMatch = req.nextUrl.pathname.match(/^\/tournaments\/([^/]+)\/invite\/?$/)
  if (inviteMatch) {
    const tournamentId = decodeURIComponent(inviteMatch[1])
    const currentValue = req.cookies.get(INVITE_REGISTRATION_TOURNAMENT_COOKIE)?.value
    response.cookies.set({
      name: INVITE_REGISTRATION_TOURNAMENT_COOKIE,
      value: addInviteRegistrationTournamentId(currentValue, tournamentId),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
  }

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

