import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendOtpEmail } from '@/lib/email'
import { buildRateLimitHeaders, checkRateLimit, getIpFromRequest } from '@/lib/rate-limit'
import { getCompatUserAccountProviders, getCompatUserByEmail } from '@/lib/auth-user-compat'
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
    // IP rate limit — blocks OTP-spam / email-enumeration attacks before we
    // touch the DB or the email provider. Complements the per-email cooldown
    // in the emailOtp table (which is bypassable by rotating addresses).
    const ip = getIpFromRequest(req)
    const rl = await checkRateLimit('emailOtp', ip)
    if (!rl.success) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many code requests. Please try again later.',
        },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      )
    }

    const payload = requestSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)

    const existingUser = await getCompatUserByEmail(email)
    const providers = existingUser
      ? await getCompatUserAccountProviders(existingUser.id)
      : []

    if (providers.includes('google')) {
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

    console.error('[Email OTP] Failed to send code', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send code.' },
      { status: 500 }
    )
  }
}
