import { NextRequest, NextResponse } from 'next/server'
import { extractMobileSessionToken, getMobileSessionUser } from '@/lib/mobileAuth'

export async function GET(req: NextRequest) {
  try {
    const sessionToken = extractMobileSessionToken(req)
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false })
    }

    const session = await getMobileSessionUser(sessionToken)
    if (!session) {
      return NextResponse.json({ authenticated: false })
    }

    return NextResponse.json({
      authenticated: true,
      user: session.user,
      expiresAt: session.expires.toISOString(),
    })
  } catch (error) {
    console.error('[Mobile Auth] Session check failed', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to verify session.' },
      { status: 500 }
    )
  }
}
