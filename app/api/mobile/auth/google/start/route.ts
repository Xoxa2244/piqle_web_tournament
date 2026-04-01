import { NextRequest, NextResponse } from 'next/server'

const isValidMobileRedirectUri = (value: string) => value.startsWith('piqle://')

export async function GET(req: NextRequest) {
  const redirectUri = req.nextUrl.searchParams.get('redirect_uri')?.trim()

  if (!redirectUri || !isValidMobileRedirectUri(redirectUri)) {
    return NextResponse.json(
      { error: 'INVALID_REDIRECT_URI', message: 'A valid mobile redirect URI is required.' },
      { status: 400 }
    )
  }

  const callbackUrl = new URL('/api/mobile/auth/google/callback', req.nextUrl.origin)
  callbackUrl.searchParams.set('redirect_uri', redirectUri)

  const googleSignInUrl = new URL('/auth/signin', req.nextUrl.origin)
  googleSignInUrl.searchParams.set('provider', 'google')
  googleSignInUrl.searchParams.set('callbackUrl', callbackUrl.toString())

  return NextResponse.redirect(googleSignInUrl)
}
