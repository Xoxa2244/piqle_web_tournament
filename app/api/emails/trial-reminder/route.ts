/**
 * CRON: Send trial ending reminder emails.
 * Runs daily, sends reminder 3 days before trial ends.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTrialEndingEmail } from '@/lib/transactional-emails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}

async function handleCron(request: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)

  try {
    // Find subscriptions with trial ending in ~3 days (3-4 day window to avoid duplicates)
    const expiringTrials = await prisma.subscription.findMany({
      where: {
        status: 'trialing',
        trialEndsAt: {
          gte: threeDaysFromNow,
          lt: fourDaysFromNow,
        },
      },
      include: {
        club: { select: { id: true, name: true } },
      },
    })

    let sent = 0
    let failed = 0

    for (const sub of expiringTrials) {
      try {
        const daysLeft = Math.ceil(
          (new Date(sub.trialEndsAt!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        )
        await sendTrialEndingEmail({
          clubId: sub.club.id,
          clubName: sub.club.name,
          daysLeft,
        })
        sent++
      } catch (err) {
        console.error(`[TrialReminder] Failed for club ${sub.clubId}:`, err)
        failed++
      }
    }

    return NextResponse.json({
      ok: true,
      found: expiringTrials.length,
      sent,
      failed,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('[TrialReminder] Cron failed:', error)
    return NextResponse.json({ error: error.message || 'Task failed' }, { status: 500 })
  }
}
