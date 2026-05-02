/**
 * Test endpoint: send a slot-filler invite email with a real CourtReserve
 * PublicEventUrl baked in (Sprint 1/1.5/1.6 verification).
 *
 * Auth: Bearer CRON_SECRET (so it can be invoked by curl without a session).
 *
 * Usage:
 *   curl -X POST https://app.iqsport.ai/api/ai/test-slot-filler-email \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"to":"sol@piqle.io"}'
 *
 * Optional body:
 *   to:        recipient email (default sol@piqle.io)
 *   clubName:  filter sessions by club name (default: any club with URL)
 *   sessionId: pick a specific session by id (overrides club filter)
 *
 * Picks the first underfilled future session that has a non-null external_url
 * + member_sso_url so the email contains a real, clickable CR booking link.
 * Returns the chosen session details + Mandrill messageId for inspection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSlotFillerInviteEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    to?: string
    clubName?: string
    sessionId?: string
  }

  const to = body.to || 'sol@piqle.io'

  // Pick a session: prefer real underfilled future event with URL set.
  let session: {
    id: string
    title: string
    date: Date
    startTime: string
    endTime: string
    maxPlayers: number
    registeredCount: number
    externalUrl: string | null
    memberSsoUrl: string | null
    club: { id: string; name: string } | null
  } | null = null

  if (body.sessionId) {
    session = await prisma.playSession.findUnique({
      where: { id: body.sessionId },
      select: {
        id: true, title: true, date: true, startTime: true, endTime: true,
        maxPlayers: true, registeredCount: true,
        externalUrl: true, memberSsoUrl: true,
        club: { select: { id: true, name: true } },
      },
    }) as any
  } else {
    session = await prisma.playSession.findFirst({
      where: {
        date: { gte: new Date() },
        status: 'SCHEDULED',
        externalUrl: { not: null },
        registeredCount: { gt: 0 },
        ...(body.clubName ? { club: { name: body.clubName } } : {}),
      },
      orderBy: { date: 'asc' },
      select: {
        id: true, title: true, date: true, startTime: true, endTime: true,
        maxPlayers: true, registeredCount: true,
        externalUrl: true, memberSsoUrl: true,
        club: { select: { id: true, name: true } },
      },
    }) as any
  }

  if (!session) {
    return NextResponse.json({ error: 'No session with external_url found' }, { status: 404 })
  }

  if (!session.externalUrl) {
    return NextResponse.json({
      error: 'Selected session has no external_url',
      session,
    }, { status: 422 })
  }

  // Build the URL the way slot-filler-automation does — append ?rec= for
  // Mandrill click tracking. Use a fake logId for this test.
  const fakeLogId = `test-${Date.now()}`
  const directBookingUrl = `${session.externalUrl}${session.externalUrl.includes('?') ? '&' : '?'}rec=${fakeLogId}`

  const spotsLeft = Math.max(1, session.maxPlayers - session.registeredCount)
  const sessionDate = session.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  try {
    const { messageId } = await sendSlotFillerInviteEmail({
      to,
      memberName: 'Sol',
      clubName: session.club?.name || 'IPC',
      sessionTitle: session.title,
      sessionDate,
      sessionTime: `${session.startTime} - ${session.endTime}`,
      spotsLeft,
      bookingUrl: directBookingUrl,
      customSubject: `[TEST] ${session.title} — direct CR link`,
      customMessage: `This is a test email for the Sprint 1.5/1.6 CourtReserve URL pipeline. The "Join now" link below should take you to the real CourtReserve booking page (with ?rec= attached for click-tracking).\n\nSession: ${session.title}\nClub: ${session.club?.name}\nDate: ${sessionDate} ${session.startTime}\nFill: ${session.registeredCount}/${session.maxPlayers}`,
      metadata: {
        logId: fakeLogId,
        clubId: session.club?.id || '',
        userId: 'test-user',
        variantId: 'test_slot_filler_url',
      } as any,
    })

    return NextResponse.json({
      ok: true,
      messageId,
      sentTo: to,
      session: {
        id: session.id,
        title: session.title,
        clubName: session.club?.name,
        date: session.date,
        externalUrl: session.externalUrl,
        memberSsoUrl: session.memberSsoUrl,
        bookingUrlInEmail: directBookingUrl,
      },
    })
  } catch (err: any) {
    return NextResponse.json({
      error: 'sendSlotFillerInviteEmail failed',
      message: err?.message || String(err),
      session: { id: session.id, title: session.title },
    }, { status: 500 })
  }
}
