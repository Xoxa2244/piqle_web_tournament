import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { buildRateLimitHeaders, checkRateLimit, getIpFromRequest } from '@/lib/rate-limit'
import { hashOtp, normalizeEmail } from '@/lib/emailOtp'
import { getCompatUserByEmail, updateCompatUserAuthFields } from '@/lib/auth-user-compat'

const confirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const ip = getIpFromRequest(req)
    const rl = await checkRateLimit('emailOtp', ip)
    if (!rl.success) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
        },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      )
    }

    const payload = confirmSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const code = payload.code.trim()

    const existingUser = await getCompatUserByEmail(email)
    if (!existingUser) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'No account exists for this email yet.' },
        { status: 404 }
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

    await updateCompatUserAuthFields(existingUser.id, {
      passwordHash,
      emailVerified: existingUser.emailVerified ?? new Date(),
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

    console.error('[Password Reset] Failed to confirm reset', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to reset password.' },
      { status: 500 }
    )
  }
}
