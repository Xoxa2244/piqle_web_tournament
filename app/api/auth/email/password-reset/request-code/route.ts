import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildRateLimitHeaders, checkRateLimit, getIpFromRequest } from '@/lib/rate-limit'
import { sendOtpEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import {
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  generateOtpCode,
  getOtpTtlMinutes,
  hashOtp,
  normalizeEmail,
} from '@/lib/emailOtp'
import { getCompatUserByEmail } from '@/lib/auth-user-compat'

const requestSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
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
    if (!existingUser) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'No account exists for this email yet.' },
        { status: 404 }
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

    console.error('[Password Reset] Failed to send code', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send code.' },
      { status: 500 }
    )
  }
}
