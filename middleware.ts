import { NextRequest, NextResponse } from "next/server"

export async function middleware(req: NextRequest) {
  // Проверяем наличие cookie с сессией
  const sessionToken = req.cookies.get(
    process.env.NODE_ENV === 'production'
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token'
  )

  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!sessionToken) {
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', req.url)
      return NextResponse.redirect(signInUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/protected/:path*']
}

