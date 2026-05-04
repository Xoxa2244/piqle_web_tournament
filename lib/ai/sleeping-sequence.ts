/**
 * Sleeping-Member Sequence — ENGAGE Segment #5 "Спящий".
 *
 * Two-step recovery chain for active-subscription members who haven't
 * booked in 30–90 days. Spec from docs:
 *
 *   Day 1 (step 0): "Your subscription is active but we haven't seen you.
 *                    Here's what's new at the club" — re-engagement, no
 *                    incentive yet, lower-pressure than declining Day 1
 *                    because they've been gone longer.
 *   Day 14 (step 1): "Can we help?" + 4-button micro-survey
 *                    (planschanged / time-no-fit / schedule-bad / other).
 *                    Sent ONLY if no booking AND no survey response.
 *
 * Distinct from declining-sequence:
 *   - Tone is calmer (member already disengaged for a month)
 *   - 2 steps not 3 (less escalation — no incentive at the end; we save
 *     incentives for segment #6 "Ушедший" if they keep going silent)
 *   - Survey options reflect deeper detachment
 *     (DECLINING used: injury / busy / schedule / pause)
 *     (SLEEPING uses: planschanged / time / schedule / other)
 *
 * Reuses everything else from declining: rich-HTML email rendering pattern,
 * MicroSurveyResponse for click capture, checkAntiSpam frequency cap with
 * isSequenceFollowUp on step 1.
 */

import { campaignLogger as log } from '@/lib/logger'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { buildEmailButton, buildEmailPanel, renderTextParagraphs } from '@/lib/email-brand'
import { checkAntiSpam } from './anti-spam'
import type { SleepingCandidate } from './sleeping-detector'

export interface SleepingStep {
  step: number
  delayDays: number
  conditional?: boolean
  subject: (firstName: string, clubName: string) => string
  body: (firstName: string, clubName: string, ctx: SleepingStepContext) => string
}

export interface SleepingStepContext {
  bookingUrl: string
  surveyBaseUrl: string
  /** AIRecommendationLog.id of step 0 — what survey response URLs reference. */
  logId: string
}

/** 4 micro-survey options for sleeping segment. Different vocabulary than
 *  declining (which used injury/busy/schedule/pause) — these reflect
 *  longer-term detachment. All 4 added to /api/surveys/respond allowlist. */
export const SLEEPING_SURVEY_OPTIONS = ['planschanged', 'time', 'schedule', 'other'] as const

const DAY_1: SleepingStep = {
  step: 0,
  delayDays: 0,
  subject: (firstName, clubName) =>
    `${firstName}, your spot at ${clubName} is still here`,
  body: (firstName, clubName) =>
    `Hey ${firstName}!

Your membership at ${clubName} is still active but we haven't seen you on the courts in a while. No pressure — sometimes life gets in the way.

Here's a quick rundown of what's been happening since you were last in:
  • New session times added across the week
  • Skill-level groups still running daily
  • Open Play remains the easiest way to drop in

Whenever you're ready, the schedule is one tap away.`,
}

const DAY_14: SleepingStep = {
  step: 1,
  delayDays: 14,
  conditional: true,
  subject: (firstName, clubName) =>
    `${firstName}, anything we can fix at ${clubName}?`,
  body: (firstName, clubName) =>
    `Hey ${firstName}!

Two weeks since our last note and you still haven't been in. We'd love to know what's getting in the way — even a one-click answer helps the club program better sessions for members like you.`,
}

export const SLEEPING_STEPS: SleepingStep[] = [DAY_1, DAY_14]

// ── Rich HTML renderers — same pattern as declining-sequence ──

function renderDay1Html(firstName: string, ctx: SleepingStepContext): string {
  const intro = `Hey ${firstName}! Your membership is still active but we haven't seen you on the courts in a while. No pressure — sometimes life gets in the way.`

  const updates = buildEmailPanel(`
    <div style="text-align:left;">
      <div style="font-size:13px;color:#A5F3FC;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;margin-bottom:10px;">
        What's new since you were last in
      </div>
      <div style="font-size:14px;color:#E2E8F0;line-height:1.7;">
        • New session times added across the week<br />
        • Skill-level groups running daily<br />
        • Open Play remains the easiest way to drop in
      </div>
    </div>
  `)

  return `
    ${renderTextParagraphs(intro)}
    ${updates}
    <p style="margin:18px 0 0;font-size:14px;color:#E2E8F0;text-align:center;">
      Whenever you're ready, the schedule is one tap away.
    </p>
    ${buildEmailButton('Open Schedule', ctx.bookingUrl, 'primary')}
  `
}

function renderDay14Html(firstName: string, ctx: SleepingStepContext): string {
  const intro = `Hey ${firstName}! Two weeks since our last note and you still haven't been in. We'd love to know what's getting in the way — even a one-click answer helps the club program better sessions for members like you.`

  const surveyButtons = [
    { label: 'My plans changed',         option: 'planschanged' },
    { label: 'Cannot find a good time',  option: 'time' },
    { label: 'Schedule does not work',   option: 'schedule' },
    { label: 'Something else',           option: 'other' },
  ]
    .map((opt) =>
      buildEmailButton(opt.label, `${ctx.surveyBaseUrl}?logId=${ctx.logId}&option=${opt.option}`, 'secondary'),
    )
    .join('')

  return `
    ${renderTextParagraphs(intro)}
    <p style="margin:18px 0 6px;font-size:14px;color:#94A3B8;text-align:center;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">
      One quick tap — what is going on?
    </p>
    ${surveyButtons}
    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;text-align:center;">
      Or skip the survey and just open the schedule.
    </p>
    ${buildEmailButton('Open Schedule', ctx.bookingUrl, 'primary')}
  `
}

export function renderSleepingStepHtml(step: number, firstName: string, ctx: SleepingStepContext): string {
  if (step === 0) return renderDay1Html(firstName, ctx)
  if (step === 1) return renderDay14Html(firstName, ctx)
  return ''
}

// ── Day 1 creator + follow-up runner ──

export async function createSleepingStep0(
  prisma: any,
  candidate: SleepingCandidate,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ status: 'sent' | 'skipped'; logId?: string; reason?: string }> {
  const { userId, clubId, email, name, daysSinceLastBooking, totalLifetimeBookings } = candidate

  if (!email) return { status: 'skipped', reason: 'no_email' }

  // Step 0 is FIRST contact — full cross-type cooldown enforced.
  const spamCheck = await checkAntiSpam({
    prisma, userId, clubId, type: 'SLEEPING_REACTIVATION', isSequenceFollowUp: false,
  })
  if (!spamCheck.allowed) return { status: 'skipped', reason: spamCheck.reason }

  if (dryRun) return { status: 'skipped', reason: 'dry_run' }

  const firstName = name?.split(' ')[0] || 'there'
  const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
  const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

  const created = await prisma.aIRecommendationLog.create({
    data: {
      clubId,
      userId,
      type: 'SLEEPING_REACTIVATION',
      channel: 'email',
      sequenceStep: 0,
      status: 'sent',
      reasoning: {
        source: 'sleeping_detector',
        step: 0,
        delayDays: 0,
        daysSinceLastBooking,
        totalLifetimeBookings,
        confidence: 88,
        autoApproved: true,
      },
    },
    select: { id: true },
  })

  const logId = created.id
  const ctx: SleepingStepContext = { bookingUrl, surveyBaseUrl, logId }
  const subject = DAY_1.subject(firstName, clubName)
  const body = DAY_1.body(firstName, clubName, ctx)

  try {
    const { sendOutreachEmail } = await import('@/lib/email')
    await sendOutreachEmail({
      to: email,
      subject, body, clubName, bookingUrl,
      bodyHtmlOverride: renderSleepingStepHtml(0, firstName, ctx),
      suppressDefaultCta: true,
    })
    return { status: 'sent', logId }
  } catch (err: any) {
    log.error({ userId, clubId, error: err?.message?.slice(0, 200) }, '[sleeping-sequence] step 0 send failed')
    await prisma.aIRecommendationLog.update({
      where: { id: logId },
      data: { status: 'failed' },
    }).catch(() => {})
    return { status: 'skipped', reason: 'send_failed' }
  }
}

export async function processSleepingFollowUps(
  prisma: any,
  clubId: string,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ sent: number; skipped: number; exited: number }> {
  const now = new Date()
  let sent = 0
  let skipped = 0
  let exited = 0

  const activeSequences: any[] = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      type: 'SLEEPING_REACTIVATION',
      // Only step 0 has a follow-up (step 1 = Day 14 final). After step 1, sequence ends.
      sequenceStep: 0,
      status: { in: ['sent', 'delivered', 'opened', 'clicked'] },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  for (const log_entry of activeSequences) {
    const nextStepDef = SLEEPING_STEPS[1] // Day 14
    const daysSinceSend = Math.floor((now.getTime() - log_entry.createdAt.getTime()) / 86400000)
    if (daysSinceSend < nextStepDef.delayDays) continue

    // Idempotency
    const alreadySent = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        userId: log_entry.userId,
        type: 'SLEEPING_REACTIVATION',
        sequenceStep: 1,
      },
    })
    if (alreadySent > 0) {
      skipped++
      continue
    }

    if (dryRun) {
      skipped++
      continue
    }

    const email = log_entry.user?.email
    if (!email || email.includes('placeholder') || email.includes('demo')) {
      skipped++
      continue
    }

    // Conditional exit BEFORE anti-spam — these checks are the whole point.
    const newBookings = await prisma.playSessionBooking.count({
      where: {
        userId: log_entry.userId,
        status: 'CONFIRMED',
        bookedAt: { gte: log_entry.createdAt },
      },
    })
    if (newBookings > 0) {
      await markSequenceExit(prisma, log_entry.id, 'booked')
      exited++
      continue
    }

    // Survey response check (against step 0's logId — the one users click from).
    const responseExists = await prisma.microSurveyResponse.count({
      where: { logId: log_entry.id },
    })
    if (responseExists > 0) {
      await markSequenceExit(prisma, log_entry.id, 'survey_responded')
      exited++
      continue
    }

    // Frequency cap (sequence follow-up).
    const spamCheck = await checkAntiSpam({
      prisma,
      userId: log_entry.userId,
      clubId,
      type: 'SLEEPING_REACTIVATION',
      isSequenceFollowUp: true,
    })
    if (!spamCheck.allowed) {
      log.info({ userId: log_entry.userId, reason: spamCheck.reason }, '[sleeping-sequence] frequency cap')
      skipped++
      continue
    }

    const firstName = log_entry.user?.name?.split(' ')[0] || 'there'
    const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
    const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')
    const ctx: SleepingStepContext = { bookingUrl, surveyBaseUrl, logId: log_entry.id }
    const subject = nextStepDef.subject(firstName, clubName)
    const body = nextStepDef.body(firstName, clubName, ctx)

    try {
      const { sendOutreachEmail } = await import('@/lib/email')
      await sendOutreachEmail({
        to: email,
        subject, body, clubName, bookingUrl,
        bodyHtmlOverride: renderSleepingStepHtml(1, firstName, ctx),
        suppressDefaultCta: true,
      })

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: log_entry.userId,
          type: 'SLEEPING_REACTIVATION',
          channel: 'email',
          sequenceStep: 1,
          parentLogId: log_entry.id,
          status: 'sent',
          reasoning: {
            source: 'sleeping_sequence',
            step: 1,
            delayDays: 14,
            confidence: 88,
            autoApproved: true,
          },
        },
      })
      sent++
    } catch (err: any) {
      log.error({ userId: log_entry.userId, error: err?.message?.slice(0, 200) }, '[sleeping-sequence] follow-up send failed')
      skipped++
    }
  }

  return { sent, skipped, exited }
}

async function markSequenceExit(prisma: any, logId: string, exitReason: 'booked' | 'survey_responded'): Promise<void> {
  const row = await prisma.aIRecommendationLog.findUnique({
    where: { id: logId },
    select: { reasoning: true },
  })
  const existing = (row?.reasoning as any) || {}
  await prisma.aIRecommendationLog.update({
    where: { id: logId },
    data: {
      reasoning: { ...existing, exitedAt: new Date().toISOString(), exitReason },
    },
  })
}
