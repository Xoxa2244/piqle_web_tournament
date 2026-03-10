import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { hashOtp, normalizeEmail } from '@/lib/emailOtp'
import { prisma } from '@/lib/prisma'

const confirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const payload = confirmSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const code = payload.code.trim()

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'No account exists for this email.' },
        { status: 404 }
      )
    }

    if (user.accounts?.some((account) => account.provider === 'google')) {
      return NextResponse.json(
        {
          error: 'GOOGLE_ACCOUNT_EXISTS',
          message: 'This email is linked to Google sign-in. Please continue with Google.',
        },
        { status: 409 }
      )
    }

    const otp = await prisma.emailOtp.findUnique({ where: { email } })
    if (!otp) {
      return NextResponse.json(
        { error: 'CODE_INVALID', message: 'Invalid code.' },
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
        { error: 'CODE_INVALID', message: 'Invalid code.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(payload.password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: user.emailVerified ?? new Date(),
      },
    })

    await prisma.emailOtp.delete({ where: { email } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Password Reset] Failed to update password', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to reset password.' },
      { status: 500 }
    )
  }
}
