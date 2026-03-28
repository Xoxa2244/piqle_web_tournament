/**
 * Test endpoint: send a preview reactivation email
 * Auth: valid user session only
 * Usage: POST { "to": "sol@piqle.io", "clubName": "IPC East" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
  const clubName: string = body.clubName || 'IPC East'
  const memberName: string = body.memberName || session.user.name || 'Sol'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stest.piqle.io'

  // Generate a real-looking notify-me token (using session userId as demo)
  const demoClubId = '00000000-0000-0000-0000-000000000001'
  let notifyMeUrl: string | undefined
  try {
    const token = generateInterestToken(session.user.id, demoClubId)
    notifyMeUrl = `${appUrl}/notify-me?t=${token}`
  } catch {
    notifyMeUrl = `${appUrl}/notify-me?t=demo`
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
