import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromMobileToken } from '@/lib/mobileAuth'

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null

  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req)

  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing mobile auth token.' },
      { status: 401 }
    )
  }

  const session = await getSessionFromMobileToken(token)

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or expired mobile auth token.' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    token,
    user: {
      id: String(session.user.id),
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
  })
}
