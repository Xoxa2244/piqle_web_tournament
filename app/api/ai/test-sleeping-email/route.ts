/**
 * Test endpoint: send the sleeping-reactivation Day 1 / Day 14 emails
 * to a single hardcoded recipient (sol@piqle.io) for visual review of
 * the segment #5 sequence before any real members are touched.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * Body:
 *   step      — "1" | "14" | "all"  (default "all")
 *   clubName  — display name (default "IPC Test Club")
 *
 * Recipient HARDCODED to sol@piqle.io. No DB writes. Uses the same
 * renderSleepingStepHtml renderer as the production sequence so the
 * visual is byte-for-byte identical.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendOutreachEmail } from '@/lib/email'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { SLEEPING_STEPS, renderSleepingStepHtml } from '@/lib/ai/sleeping-sequence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HARDCODED_RECIPIENT = 'sol@piqle.io'

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
    step?: '1' | '14' | 'all'
    clubName?: string
  }
  const stepParam = body.step ?? 'all'
  const clubName = body.clubName?.trim() || 'IPC Test'
  const firstName = 'Sol'

  const fakeLogId = `test-sleep-${Date.now()}`
  const bookingUrl = buildPlatformUrl('/clubs/test-club/play')
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')
  const ctx = { bookingUrl, surveyBaseUrl, logId: fakeLogId }

  const stepsToSend: Array<{ stepLabel: string; stepIndex: number; subject: string; body: string }> = []
  for (const step of SLEEPING_STEPS) {
    const stepKey = step.delayDays === 0 ? '1' : String(step.delayDays)
    if (stepParam !== 'all' && stepKey !== stepParam) continue
    stepsToSend.push({
      stepLabel: `Day ${step.delayDays === 0 ? '1' : step.delayDays}`,
      stepIndex: step.step,
      subject: `[TEST] ${step.subject(firstName, clubName)}`,
      body: step.body(firstName, clubName, ctx),
    })
  }

  if (stepsToSend.length === 0) {
    return NextResponse.json({ error: 'No steps matched. Use step=1, 14, or all.' }, { status: 400 })
  }

  const results: Array<{ stepLabel: string; messageId?: string; error?: string }> = []
  for (const s of stepsToSend) {
    try {
      const info = await sendOutreachEmail({
        to: HARDCODED_RECIPIENT,
        subject: s.subject,
        body: s.body,
        clubName,
        bookingUrl,
        bodyHtmlOverride: renderSleepingStepHtml(s.stepIndex, firstName, ctx),
        suppressDefaultCta: true,
      })
      results.push({ stepLabel: s.stepLabel, messageId: info?.messageId })
    } catch (err: any) {
      results.push({ stepLabel: s.stepLabel, error: err?.message?.slice(0, 200) })
    }
  }

  return NextResponse.json({
    ok: true,
    sentTo: HARDCODED_RECIPIENT,
    fakeLogId,
    surveyOptionsForReview: ['planschanged', 'time', 'schedule', 'other'],
    results,
  })
}
