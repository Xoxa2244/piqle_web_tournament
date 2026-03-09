import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { normalizeEmail } from '@/lib/emailOtp'
import { createMobileAccessToken } from '@/lib/mobileAuth'
import { prisma } from '@/lib/prisma'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const payload = loginSchema.parse(await req.json())
    const email = normalizeEmail(payload.email)
    const password = payload.password.trim()

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'EMAIL_PASSWORD_INVALID', message: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (user.accounts?.some((account) => account.provider === 'google')) {
      return NextResponse.json(
        {
          error: 'EMAIL_GOOGLE_ACCOUNT',
          message: 'This email is linked to Google sign-in. Please continue with Google.',
        },
        { status: 409 }
      )
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'EMAIL_PASSWORD_NOT_SET', message: 'Password sign-in is not set for this user.' },
        { status: 409 }
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

    const token = createMobileAccessToken(user.id)

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid request payload.' },
        { status: 400 }
      )
    }

    console.error('[Mobile Auth] Failed to sign in', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sign in.' },
      { status: 500 }
    )
  }
}

