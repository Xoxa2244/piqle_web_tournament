import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractMobileSessionToken, revokeMobileSession } from '@/lib/mobileAuth'

const signOutSchema = z
  .object({
    sessionToken: z.string().min(1).optional(),
  })
  .optional()

export async function POST(req: NextRequest) {
  try {
    const payload = signOutSchema.parse(await req.json().catch(() => undefined))
    const tokenFromBody = payload?.sessionToken ?? null
    const sessionToken = tokenFromBody || extractMobileSessionToken(req)

    if (!sessionToken) {
      return NextResponse.json({ ok: true })
    }

    await revokeMobileSession(sessionToken)

    const response = NextResponse.json({ ok: true })
    response.cookies.set('next-auth.session-token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: new Date(0),
      path: '/',
    })
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Mobile Auth] Sign-out failed', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sign out.' },
      { status: 500 }
    )
  }
}
