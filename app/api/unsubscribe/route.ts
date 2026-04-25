import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPlatformBaseUrl } from '@/lib/platform-base-url'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAppBaseUrl(): string {
  return getPlatformBaseUrl()
}

async function processUnsubscribe(token: string): Promise<{ userId: string; clubId: string } | null> {
  const payload = verifyUnsubscribeToken(token)
  if (!payload) return null

  await prisma.$transaction([
    prisma.userPlayPreference.upsert({
      where: { userId_clubId: { userId: payload.userId, clubId: payload.clubId } },
      update: { notificationsOptOut: true },
      create: {
        userId: payload.userId,
        clubId: payload.clubId,
        notificationsOptOut: true,
        preferredDays: [],
        preferredFormats: [],
        targetSessionsPerWeek: 2,
        skillLevel: 'ALL_LEVELS',
      },
    }),
    prisma.$executeRaw`
      UPDATE users
      SET
        sms_opt_in = false,
        "updatedAt" = NOW()
      WHERE id = ${payload.userId}
    `,
    prisma.aIRecommendationLog.updateMany({
      where: {
        userId: payload.userId,
        clubId: payload.clubId,
        status: { in: ['PENDING', 'SENT'] },
      },
      data: { status: 'UNSUBSCRIBED' },
    }),
  ])

  console.log(`[Unsubscribe] User ${payload.userId} opted out of club ${payload.clubId}; sms_opt_in=false`)

  return payload
}

// GET: user clicks unsubscribe link in email
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${getAppBaseUrl()}/unsubscribe?status=invalid`)
  }

  const result = await processUnsubscribe(token)
  if (!result) {
    return NextResponse.redirect(`${getAppBaseUrl()}/unsubscribe?status=invalid`)
  }

  return NextResponse.redirect(
    `${getAppBaseUrl()}/unsubscribe?status=success&token=${encodeURIComponent(token)}`
  )
}

// POST: RFC 8058 one-click unsubscribe (email client sends POST)
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const result = await processUnsubscribe(token)
  if (!result) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
