/**
 * Test endpoint: send a preview reactivation email
 * Auth: valid user session only
 * Usage: POST { "to": "sol@piqle.io", "clubId": "<real uuid>" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendReactivationEmail } from '@/lib/email'
import { generateInterestToken } from '@/lib/utils/interest-token'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const to: string = body.to || session.user.email
  const memberName: string = body.memberName || session.user.name || 'Sol'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stest.piqle.io'

  // Use provided clubId or fall back to first club in DB
  let clubId: string = body.clubId
  let clubName: string = body.clubName || 'Your Club'
  if (!clubId) {
    const club = await prisma.club.findFirst({ select: { id: true, name: true } })
    if (club) { clubId = club.id; clubName = club.name }
  } else {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
    if (club) clubName = club.name
  }

  // Generate a real notify-me token using the real clubId
  let notifyMeUrl: string | undefined
  if (clubId) {
    try {
      const token = generateInterestToken(session.user.id, clubId)
      notifyMeUrl = `${appUrl}/notify-me?t=${token}`
    } catch { /* non-critical */ }
  }

  const suggestedSessions = [
    {
      title: 'Open Play – Intermediate',
      date: 'Sat, Apr 5',
      startTime: '10:00 AM',
      endTime: '12:00 PM',
      format: 'OPEN_PLAY',
      spotsLeft: 3,
      confirmedCount: 5,
      deepLinkUrl: `${appUrl}/clubs/ipc-east/play`,
    },
    {
      title: 'Doubles Drill – 3.0–3.5',
      date: 'Sun, Apr 6',
      startTime: '9:00 AM',
      endTime: '10:30 AM',
      format: 'CLINIC',
      spotsLeft: 2,
      confirmedCount: 6,
      deepLinkUrl: `${appUrl}/clubs/ipc-east/play`,
    },
  ]

  try {
    await sendReactivationEmail({
      to,
      memberName,
      clubName,
      daysSinceLastActivity: 28,
      suggestedSessions,
      bookingUrl: `${appUrl}/clubs/ipc-east/play`,
      customMessage: undefined,
      notifyMeUrl,
    })

    return NextResponse.json({ success: true, to, notifyMeUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
