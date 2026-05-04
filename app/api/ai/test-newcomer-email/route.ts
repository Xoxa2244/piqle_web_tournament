/**
 * Test endpoint: send the Newcomer welcome sequence emails to sol@piqle.io.
 *
 * Sends Day 0 + Day 5 + both Day 12 variants (congrats AND survey) so the
 * reviewer sees every branch of segment #1 without waiting 12 days for
 * a real one.
 *
 * Uses the production templates from lib/ai/onboarding-sequence.ts —
 * what reviewers see is byte-for-byte what real new members receive
 * (modulo [TEST] subject prefix). Recipient HARDCODED to sol@piqle.io.
 * No DB writes.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * Body params:
 *   step      — "0" | "5" | "12-congrats" | "12-survey" | "all"  (default "all")
 *   clubName  — display name (default "IPC Test Club")
 *
 * Note: unlike Declining / Sleeping / Birthday test endpoints, Newcomer
 * templates render through sendOutreachEmail's DEFAULT layout (text +
 * default Book-a-Session button). They were built before the rich-HTML
 * pattern was introduced; uplifting them is a separate piece of work.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendOutreachEmail } from '@/lib/email'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import {
  ONBOARDING_STEPS,
  DAY_12_TEMPLATES,
} from '@/lib/ai/onboarding-sequence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HARDCODED_RECIPIENT = 'sol@piqle.io'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    step?: '0' | '5' | '12-congrats' | '12-survey' | 'all'
    clubName?: string
  }
  const stepParam = body.step ?? 'all'
  const clubName = body.clubName?.trim() || 'IPC Test'
  const firstName = 'Sol'

  const fakeLogId = `test-newcomer-${Date.now()}`
  const bookingUrl = buildPlatformUrl('/clubs/test-club/play')
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  const sendsRequested: Array<{ stepLabel: string; subject: string; body: string }> = []

  if (stepParam === '0' || stepParam === 'all') {
    const s = ONBOARDING_STEPS[0]
    sendsRequested.push({
      stepLabel: 'Day 0 Welcome',
      subject: `[TEST] ${s.subject(clubName)}`,
      body: s.body(firstName, clubName, bookingUrl),
    })
  }
  if (stepParam === '5' || stepParam === 'all') {
    const s = ONBOARDING_STEPS[1]
    sendsRequested.push({
      stepLabel: 'Day 5 Social proof',
      subject: `[TEST] ${s.subject(clubName)}`,
      body: s.body(firstName, clubName, bookingUrl),
    })
  }
  if (stepParam === '12-congrats' || stepParam === 'all') {
    const tpl = DAY_12_TEMPLATES.congrats
    sendsRequested.push({
      stepLabel: 'Day 12 (engaged → congrats)',
      subject: `[TEST] ${tpl.subject(clubName)}`,
      body: tpl.body(firstName, clubName, bookingUrl),
    })
  }
  if (stepParam === '12-survey' || stepParam === 'all') {
    const tpl = DAY_12_TEMPLATES.survey
    sendsRequested.push({
      stepLabel: 'Day 12 (stalled → survey)',
      subject: `[TEST] ${tpl.subject(clubName)}`,
      body: tpl.body(firstName, clubName, bookingUrl, surveyBaseUrl, fakeLogId),
    })
  }

  if (sendsRequested.length === 0) {
    return NextResponse.json({ error: 'No steps matched. Use step=0|5|12-congrats|12-survey|all.' }, { status: 400 })
  }

  const results: Array<{ stepLabel: string; messageId?: string; error?: string }> = []
  for (const s of sendsRequested) {
    try {
      const info = await sendOutreachEmail({
        to: HARDCODED_RECIPIENT,
        subject: s.subject,
        body: s.body,
        clubName,
        bookingUrl,
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
    surveyOptionsForReview: ['schedule', 'level', 'partners', 'price', 'other'],
    results,
  })
}
