import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  MobileGoogleAuthError,
  exchangeGoogleIdTokenForMobileSession,
} from '@/lib/mobileGoogleAuth'

const nativeGoogleAuthSchema = z.object({
  idToken: z.string().min(1),
})

export async function GET() {
  const webClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
  const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID?.trim() ?? null

  if (!webClientId) {
    return NextResponse.json(
      {
        error: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'Google sign-in is not configured on the server.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    webClientId,
    iosClientId,
  })
}

export async function POST(req: NextRequest) {
  try {
    const payload = nativeGoogleAuthSchema.parse(await req.json())
    const session = await exchangeGoogleIdTokenForMobileSession(payload.idToken)

    return NextResponse.json(session)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    if (error instanceof MobileGoogleAuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      )
    }

    console.error('[Mobile Auth] Failed to sign in with Google', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to continue with Google.' },
      { status: 500 }
    )
  }
}
