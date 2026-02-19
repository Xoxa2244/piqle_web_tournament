import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashOtp, normalizeEmail } from '@/lib/emailOtp'
import { checkRateLimit, getRequestIp } from '@/lib/mobileRateLimit'

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

const signupSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const payload = signupSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const code = payload.code.trim()
    const ip = getRequestIp(req)

    const ipRateLimit = checkRateLimit({
      scope: 'mobile-auth-signup-complete-ip',
      key: ip,
      limit: 25,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many sign-up attempts. Please try again later.',
          retryAfterSeconds: ipRateLimit.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const emailRateLimit = checkRateLimit({
      scope: 'mobile-auth-signup-complete-email',
      key: `${ip}:${email}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many sign-up attempts for this email. Please try again later.',
          retryAfterSeconds: emailRateLimit.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    })

    if (existingUser?.accounts?.some((account) => account.provider === 'google')) {
      return NextResponse.json(
        {
          error: 'GOOGLE_ACCOUNT_EXISTS',
          message:
            'This email is already linked to a Google account. Please sign in with Google.',
        },
        { status: 409 }
      )
    }

    if (existingUser?.passwordHash) {
      return NextResponse.json(
        { error: 'USER_EXISTS', message: 'User already exists. Please sign in.' },
        { status: 409 }
      )
    }

    const otp = await prisma.emailOtp.findUnique({ where: { email } })
    if (!otp) {
      return NextResponse.json(
        { error: 'CODE_INVALID', message: 'Invalid verification code.' },
        { status: 400 }
      )
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      await prisma.emailOtp.delete({ where: { email } })
      return NextResponse.json(
        { error: 'CODE_EXPIRED', message: 'Code expired.' },
        { status: 400 }
      )
    }

    if (otp.attemptsLeft <= 0) {
      return NextResponse.json(
        { error: 'CODE_ATTEMPTS_EXCEEDED', message: 'Too many attempts.' },
        { status: 429 }
      )
    }

    const expectedHash = hashOtp(email, code)
    if (expectedHash !== otp.codeHash) {
      await prisma.emailOtp.update({
        where: { email },
        data: { attemptsLeft: Math.max(otp.attemptsLeft - 1, 0) },
      })
      return NextResponse.json(
        { error: 'CODE_INVALID', message: 'Invalid verification code.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(payload.password, 10)
    const name = `${payload.firstName.trim()} ${payload.lastName.trim()}`

    let userId = existingUser?.id
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          passwordHash,
          emailVerified: new Date(),
        },
      })
    } else {
      const createdUser = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: new Date(),
        },
      })
      userId = createdUser.id
    }

    await prisma.emailOtp.delete({ where: { email } })

    if (userId) {
      await linkPlayersToUserByEmail(userId, email)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Mobile Auth] Failed to complete sign-up', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sign up.' },
      { status: 500 }
    )
  }
}
