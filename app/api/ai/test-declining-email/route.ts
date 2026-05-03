/**
 * Test endpoint: send the declining-reactivation Day 1 / Day 5 / Day 12 emails
 * to a single hardcoded recipient (sol@piqle.io) for visual review of the
 * segment #4 sequence before any real members are touched.
 *
 * Auth: Bearer CRON_SECRET (curlable, no UI session).
 *
 * Usage:
 *   curl -X POST https://app.iqsport.ai/api/ai/test-declining-email \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"step":"all"}'
 *
 * Body params (all optional):
 *   step       — "1" | "5" | "12" | "all"  (default "all" → sends all three)
 *   clubName   — display name in subject/body (default "Test Club")
 *
 * Recipient is HARDCODED to sol@piqle.io. No way to override via params —
 * this prevents accidentally CC'ing a real member during exploration.
 *
 * Each send goes through the actual sendOutreachEmail / DECLINING_STEPS
 * templates so what you see is exactly what real recipients would see.
 * No DB writes (no AIRecommendationLog rows, no MicroSurveyResponse) —
 * this is a content-only check, not a sequencing check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendOutreachEmail } from '@/lib/email'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { DECLINING_STEPS, renderDecliningStepHtml } from '@/lib/ai/declining-sequence'

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
    step?: '1' | '5' | '12' | 'all'
    clubName?: string
  }
  const stepParam = body.step ?? 'all'
  const clubName = body.clubName?.trim() || 'IPC Test'
  const firstName = 'Sol'

  // Use a synthetic logId so the survey URLs are clickable but won't write
  // to MicroSurveyResponse (foreign-key won't resolve — endpoint will say
  // "link expired" gracefully).
  const fakeLogId = `test-decline-${Date.now()}`

  const bookingUrl = buildPlatformUrl('/clubs/test-club/play')
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  // Mock 3 personalised sessions for Day 5 — same shape as production data.
  const recommendedSessions = [
    { title: 'Open Play Intermediate', date: 'Mon, May 5', startTime: '18:30', bookingUrl },
    { title: 'Cardio Pickleball Clinic', date: 'Wed, May 7', startTime: '19:00', bookingUrl },
    { title: 'Round Robin — 3.5+', date: 'Sat, May 10', startTime: '10:00', bookingUrl },
  ]

  const ctx = { bookingUrl, surveyBaseUrl, logId: fakeLogId, recommendedSessions }

  const stepsToSend: Array<{ stepLabel: string; stepIndex: number; subject: string; body: string }> = []

  for (const step of DECLINING_STEPS) {
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
    return NextResponse.json({ error: 'No steps matched. Use step=1, 5, 12, or all.' }, { status: 400 })
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
        // Use the same rich-HTML renderer the production sequence uses,
        // so what Sol visually reviews here is byte-for-byte what real
        // recipients will see (modulo subject [TEST] prefix).
        bodyHtmlOverride: renderDecliningStepHtml(s.stepIndex, firstName, ctx),
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
    surveyOptionsForReview: ['injury', 'busy', 'schedule', 'pause'],
    results,
  })
}
