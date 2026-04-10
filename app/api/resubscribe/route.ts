import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://stest.piqle.io'
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

  await prisma.userPlayPreference.upsert({
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
  })

  return NextResponse.redirect(
    `${getAppBaseUrl()}/unsubscribe?status=resubscribed&token=${encodeURIComponent(token)}`
  )
}
