import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  exchangeAppleIdentityTokenForMobileSession,
  MobileAppleAuthError,
} from '@/lib/mobileAppleAuth'

const nativeAppleAuthSchema = z.object({
  identityToken: z.string().min(1),
  user: z.string().min(1),
  email: z.string().email().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const payload = nativeAppleAuthSchema.parse(await req.json())
    console.log('[Mobile Auth] Received Apple native sign-in payload', {
      hasIdentityToken: Boolean(payload.identityToken),
      identityTokenLength: payload.identityToken.length,
      hasEmail: Boolean(payload.email),
      hasName: Boolean(payload.firstName || payload.lastName),
    })

    const session = await exchangeAppleIdentityTokenForMobileSession(payload)
    console.log('[Mobile Auth] Apple native sign-in succeeded', {
      userId: session.user.id,
      email: session.user.email,
    })

    return NextResponse.json(session)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    if (error instanceof MobileAppleAuthError) {
      console.error('[Mobile Auth] Apple native sign-in rejected', {
        code: error.code,
        message: error.message,
        status: error.status,
      })
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      )
    }

    console.error('[Mobile Auth] Failed to sign in with Apple', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to continue with Apple.' },
      { status: 500 }
    )
  }
}
