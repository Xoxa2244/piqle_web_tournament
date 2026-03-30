import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hashOtp, normalizeEmail } from '@/lib/emailOtp'

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
  smsConsent: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  try {
    const payload = signupSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const code = payload.code.trim()

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
    const name = `${payload.firstName.trim()} ${payload.lastName.trim()}`

    let userId = existingUser?.id
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          passwordHash,
          emailVerified: new Date(),
          ...(payload.smsConsent ? { smsOptIn: true } : {}),
        },
      })
    } else {
      const createdUser = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: new Date(),
          smsOptIn: payload.smsConsent,
        },
      })
      userId = createdUser.id
    }

    await prisma.emailOtp.delete({ where: { email } })

    if (userId) {
      await linkPlayersToUserByEmail(userId, email)
      // Send welcome email (fire and forget)
      try {
        const { sendWelcomeEmail } = await import('@/lib/transactional-emails')
        await sendWelcomeEmail({ to: email, firstName: name.split(' ')[0] || 'there' })
      } catch (err) {
        console.error('[Signup] Welcome email failed:', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Email OTP] Failed to sign up', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sign up.' },
      { status: 500 }
    )
  }
}
