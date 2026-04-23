import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPlatformBaseUrl } from '@/lib/platform-base-url'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAppBaseUrl(): string {
  return getPlatformBaseUrl()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${getAppBaseUrl()}/unsubscribe?status=invalid`)
  }

  const payload = verifyUnsubscribeToken(token)
  if (!payload) {
    return NextResponse.redirect(`${getAppBaseUrl()}/unsubscribe?status=invalid`)
  }

  await prisma.$transaction([
    prisma.userPlayPreference.upsert({
      where: { userId_clubId: { userId: payload.userId, clubId: payload.clubId } },
      update: { notificationsOptOut: false },
      create: {
        userId: payload.userId,
        clubId: payload.clubId,
        notificationsOptOut: false,
        preferredDays: [],
        preferredFormats: [],
        targetSessionsPerWeek: 2,
        skillLevel: 'ALL_LEVELS',
      },
    }),
    prisma.$executeRaw`
      UPDATE users
      SET
        sms_opt_in = true,
        "updatedAt" = NOW()
      WHERE id = ${payload.userId}
    `,
  ])

  console.log(`[Resubscribe] User ${payload.userId} re-subscribed to club ${payload.clubId}; sms_opt_in=true`)

  return NextResponse.redirect(
    `${getAppBaseUrl()}/unsubscribe?status=resubscribed&token=${encodeURIComponent(token)}`
  )
}
