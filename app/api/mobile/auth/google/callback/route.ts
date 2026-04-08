import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { createMobileAccessToken } from '@/lib/mobileAuth'

const isValidMobileRedirectUri = (value: string) => value.startsWith('piqle://')

const redirectWithError = (redirectUri: string, error: string) => {
  const target = new URL(redirectUri)
  target.searchParams.set('error', error)
  return NextResponse.redirect(target)
}

export async function GET(req: NextRequest) {
  const redirectUri = req.nextUrl.searchParams.get('redirect_uri')?.trim()

  if (!redirectUri || !isValidMobileRedirectUri(redirectUri)) {
    return NextResponse.json(
      { error: 'INVALID_REDIRECT_URI', message: 'A valid mobile redirect URI is required.' },
      { status: 400 }
    )
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return redirectWithError(redirectUri, 'google_auth_failed')
  }

  const token = createMobileAccessToken({
    id: String(session.user.id),
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    isActive: typeof session.user.isActive === 'boolean' ? session.user.isActive : true,
  })
  const target = new URL(redirectUri)
  target.searchParams.set('token', token)

  return NextResponse.redirect(target)
}
