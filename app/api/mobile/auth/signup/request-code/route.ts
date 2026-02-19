import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendOtpEmail } from '@/lib/email'
import { checkRateLimit, getRequestIp } from '@/lib/mobileRateLimit'
import {
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  generateOtpCode,
  getOtpTtlMinutes,
  hashOtp,
  normalizeEmail,
} from '@/lib/emailOtp'

const requestSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
    const payload = requestSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const ip = getRequestIp(req)

    const ipRateLimit = checkRateLimit({
      scope: 'mobile-auth-signup-request-ip',
      key: ip,
      limit: 20,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many code requests. Please try again later.',
          retryAfterSeconds: ipRateLimit.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const emailRateLimit = checkRateLimit({
      scope: 'mobile-auth-signup-request-email',
      key: `${ip}:${email}`,
      limit: 4,
      windowMs: 15 * 60 * 1000,
      blockMs: 20 * 60 * 1000,
    })
    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many verification code requests for this email.',
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

    const existingOtp = await prisma.emailOtp.findUnique({
      where: { email },
    })

    if (existingOtp) {
      const cooldownRemaining =
        Date.now() - existingOtp.lastSentAt.getTime() < EMAIL_OTP_COOLDOWN_MS
      if (cooldownRemaining) {
        return NextResponse.json(
          {
            error: 'CODE_COOLDOWN',
            message: 'Please wait before requesting a new code.',
          },
          { status: 429 }
        )
      }
    }

    const code = generateOtpCode()
    const ttlMinutes = getOtpTtlMinutes()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

    await prisma.emailOtp.upsert({
      where: { email },
      create: {
        email,
        codeHash: hashOtp(email, code),
        expiresAt,
        attemptsLeft: EMAIL_OTP_MAX_ATTEMPTS,
        lastSentAt: new Date(),
      },
      update: {
        codeHash: hashOtp(email, code),
        expiresAt,
        attemptsLeft: EMAIL_OTP_MAX_ATTEMPTS,
        lastSentAt: new Date(),
      },
    })

    await sendOtpEmail({ to: email, code, ttlMinutes })

    return NextResponse.json({ ok: true, expiresAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Mobile Auth] Failed to send sign-up code', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send verification code.' },
      { status: 500 }
    )
  }
}
