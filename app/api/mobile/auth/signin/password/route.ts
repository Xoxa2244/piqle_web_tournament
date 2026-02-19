import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createMobileSession } from '@/lib/mobileAuth'
import { normalizeEmail } from '@/lib/emailOtp'
import { checkRateLimit, getRequestIp } from '@/lib/mobileRateLimit'

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

async function linkPlayersToUserByEmail(userId: string, email: string) {
  const players = await prisma.player.findMany({
    where: {
      userId: null,
      email: { equals: email, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (!players.length) return
  await prisma.player.updateMany({
    where: { id: { in: players.map((p) => p.id) } },
    data: { userId },
  })
}

export async function POST(req: NextRequest) {
  try {
    const payload = signInSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const password = payload.password.trim()
    const ip = getRequestIp(req)

    const ipRateLimit = checkRateLimit({
      scope: 'mobile-auth-signin-ip',
      key: ip,
      limit: 30,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many sign-in attempts. Please try again later.',
          retryAfterSeconds: ipRateLimit.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const emailRateLimit = checkRateLimit({
      scope: 'mobile-auth-signin-email',
      key: `${ip}:${email}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many sign-in attempts for this account. Please try again later.',
          retryAfterSeconds: emailRateLimit.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'EMAIL_PASSWORD_INVALID', message: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (user.accounts.some((account) => account.provider === 'google')) {
      return NextResponse.json(
        {
          error: 'EMAIL_GOOGLE_ACCOUNT',
          message: 'This email is linked to a Google account. Please sign in with Google.',
        },
        { status: 409 }
      )
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error: 'EMAIL_PASSWORD_NOT_SET',
          message: 'This account does not have a password. Please sign up first.',
        },
        { status: 400 }
      )
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'EMAIL_PASSWORD_INVALID', message: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (!user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      })
    }

    await linkPlayersToUserByEmail(user.id, email)

    const { sessionToken, expires } = await createMobileSession(user.id)

    const response = NextResponse.json({
      ok: true,
      sessionToken,
      expiresAt: expires.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    })

    response.cookies.set('next-auth.session-token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires,
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

    console.error('[Mobile Auth] Sign-in failed', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sign in.' },
      { status: 500 }
    )
  }
}
