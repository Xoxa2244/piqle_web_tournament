import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sendPasswordResetEmail } from '@/lib/email'
import {
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  generateOtpCode,
  getOtpTtlMinutes,
  hashOtp,
  normalizeEmail,
} from '@/lib/emailOtp'
import { prisma } from '@/lib/prisma'

const requestSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
    const payload = requestSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'No account exists for this email.' },
        { status: 404 }
      )
    }

    if (existingUser.accounts?.some((account) => account.provider === 'google')) {
      return NextResponse.json(
        {
          error: 'GOOGLE_ACCOUNT_EXISTS',
          message: 'This email is linked to Google sign-in. Please continue with Google.',
        },
        { status: 409 }
      )
    }

    const existingOtp = await prisma.emailOtp.findUnique({
      where: { email },
    })

    if (
      existingOtp &&
      Date.now() - existingOtp.lastSentAt.getTime() < EMAIL_OTP_COOLDOWN_MS
    ) {
      return NextResponse.json(
        {
          error: 'CODE_COOLDOWN',
          message: 'Please wait before requesting a new code.',
        },
        { status: 429 }
      )
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

    try {
      await sendPasswordResetEmail({ to: email, code, ttlMinutes })
    } catch (error) {
      await prisma.emailOtp.delete({ where: { email } }).catch(() => null)
      throw error
    }

    return NextResponse.json({ ok: true, expiresAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Password Reset] Failed to send reset code', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send password reset code.' },
      { status: 500 }
    )
  }
}
