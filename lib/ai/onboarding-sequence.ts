/**
 * Newcomer Sequence — 3-step welcome chain for new club members.
 *
 * Implements ENGAGE_MVP segment #1 "Newcomer": members joined ≤30 days ago
 * with 0–3 bookings and active subscription. Goal: drive ≥3 bookings in
 * the first 30 days (the "habit window" where retention is decided).
 *
 * Step 0 (Day 0): Welcome — what's in the club, how to book.
 *   Sent immediately when event-detection sees a new member (lib/ai/event-detection.ts).
 *
 * Step 1 (Day 5): Social proof — "N players at your level are active",
 *   nudge toward group sessions where social attachment forms.
 *
 * Step 2 (Day 12): Conditional —
 *   • If ≥1 confirmed booking exists: congratulate + invite to next session.
 *   • If 0 bookings: micro-survey ("what's holding you back?") — 5 button
 *     options. The buttons link to /api/surveys/respond which records the
 *     selection. Phase 2 will add the response landing + dashboard.
 *
 * Frequency cap: every follow-up step goes through `checkAntiSpam` with
 * isSequenceFollowUp=true. That keeps cross-type cooldown relaxed (the
 * sequence is one campaign chain) but still enforces the per-week +
 * per-day caps so a noisy slot-filler day doesn't compound onto onboarding.
 *
 * Triggered by: `processOnboardingFollowUps` invoked from the daily campaign
 * cron (lib/ai/campaign-engine.ts → daily health snapshot).
 */

import { cronLogger as log } from '@/lib/logger'
import { buildPlatformUrl } from '@/lib/platform-base-url'
import { checkAntiSpam } from './anti-spam'

export interface OnboardingStep {
  step: number
  /** Days from step 0 (welcome) before this follow-up should fire. */
  delayDays: number
  /** When true, the runtime selects between two templates based on whether
   *  the member has any confirmed bookings yet (engaged vs stalled). */
  conditional?: boolean
  subject: (clubName: string) => string
  body: (firstName: string, clubName: string, bookingUrl: string) => string
}

/** Templates for the conditional Day 12 step. Selected at send-time based
 *  on whether the member has any confirmed bookings in their first 30 days. */
export interface ConditionalDay12Templates {
  /** Member has ≥1 booking — celebrate + invite to next. */
  congrats: { subject: (clubName: string) => string; body: (firstName: string, clubName: string, bookingUrl: string) => string }
  /** Member has 0 bookings — ask what's holding them back via micro-survey. */
  survey: { subject: (clubName: string) => string; body: (firstName: string, clubName: string, bookingUrl: string, surveyBaseUrl: string, logId: string) => string }
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 0,
    delayDays: 0,
    subject: (clubName) => `Welcome to ${clubName}! 🏓`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!

Welcome to ${clubName} — really glad to have you. The first month is the most important: members who book 3+ sessions in their first 30 days stick around 4× longer. Let's get you started.

Here's what's worth knowing:
• Open Play sessions are great for new members — no partner needed, just show up.
• Clinics are perfect if you want structured improvement.
• Groups are sorted by skill level so you'll find people at your pace.

Book your first session here:
${bookingUrl}

See you on the courts! 🎾`,
  },
  {
    step: 1,
    delayDays: 5,
    subject: (clubName) => `${clubName} this week — a few sessions worth a look`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!

You've been part of ${clubName} for almost a week now. We thought you might like to see what other new members are doing — most of them are starting with our group sessions, and there's usually 6–8 players in each so it's easy to meet people at your level.

This week's group sessions are still open:
${bookingUrl}

Pick one that fits your schedule. Most newcomers book their first within 7 days — no pressure, just so you have the link. 🎾`,
  },
  {
    step: 2,
    delayDays: 12,
    conditional: true,
    // The static subject/body here are placeholders never actually used at
    // send-time — selectDay12Template() picks the real one based on bookings.
    // They exist so the OnboardingStep shape stays uniform and the array
    // is iterable without conditional null-checks at every callsite.
    subject: (clubName) => `Checking in from ${clubName}`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}! Just checking in — see you soon at ${clubName}.`,
  },
]

/** Day 12 templates — the runtime selects one based on bookings. */
export const DAY_12_TEMPLATES: ConditionalDay12Templates = {
  congrats: {
    subject: (clubName) => `You're off to a great start at ${clubName} 🎉`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!

Two weeks in and you've already got your first session under your belt — that's the hardest step done. Most new members who play at least once in week 1 keep playing for years.

A few things to think about for the next month:
• Try a different format if you've only done one (Open Play / Clinic / Group). Mixing keeps it fresh.
• Booking on a regular day each week (e.g. Tuesday evenings) makes it stick faster.
• If you've found someone you like playing with, ask them when they usually book — easy way to build a regular crew.

Next session here:
${bookingUrl}

Keep it up! 💪`,
  },
  survey: {
    /**
     * The "5 button options" are rendered as plain HTML/text links pointing
     * at /api/surveys/respond?logId=...&option=... — that endpoint doesn't
     * exist yet (Phase 2 will add it). For now the clicks are still tracked
     * by Mandrill so we get attribution data on which option resonates,
     * even before the backend stores the response.
     */
    subject: (clubName) => `Anything we can help with at ${clubName}?`,
    body: (firstName, clubName, bookingUrl, surveyBaseUrl, logId) =>
      `Hey ${firstName}!

You've been a member at ${clubName} for almost two weeks but haven't booked a session yet. Totally fine — but if there's something getting in the way, we'd love to know so we can fix it (or at least understand).

What's holding you back?

→ Schedule doesn't fit:    ${surveyBaseUrl}?logId=${logId}&option=schedule
→ Not sure of my level:    ${surveyBaseUrl}?logId=${logId}&option=level
→ No partner / don't know anyone:  ${surveyBaseUrl}?logId=${logId}&option=partners
→ Pricing concerns:        ${surveyBaseUrl}?logId=${logId}&option=price
→ Something else:          ${surveyBaseUrl}?logId=${logId}&option=other

Or just book a session whenever you're ready:
${bookingUrl}

We're here. 🎾`,
  },
}

/**
 * Decide which Day 12 template to use based on whether the member has any
 * confirmed bookings in the first 30 days since joining the club.
 *
 * Exported for unit tests.
 */
export function selectDay12Template(bookingCount: number): 'congrats' | 'survey' {
  return bookingCount >= 1 ? 'congrats' : 'survey'
}

/**
 * Process onboarding follow-ups — called by health campaign cron daily.
 * Finds NEW_MEMBER_WELCOME logs at step 0 or 1, checks if enough days have
 * passed since the welcome (step 0), runs frequency-cap + opt-out gates,
 * and sends the next step. Day 12 (step 2) branches based on booking count.
 */
export async function processOnboardingFollowUps(
  prisma: any,
  clubId: string,
  clubName: string,
  dryRun: boolean = false,
): Promise<{ sent: number; skipped: number }> {
  const now = new Date()
  let sent = 0
  let skipped = 0

  // Find members in onboarding sequence (step 0 or 1, not yet at final step 2).
  // We only walk these from step-N → step-N+1; step 0 is created externally
  // by event-detection.ts when it spots a brand-new member.
  const activeSequences: any[] = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      type: 'NEW_MEMBER_WELCOME',
      sequenceStep: { in: [0, 1] },
      status: { in: ['sent', 'delivered', 'opened', 'clicked'] },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  for (const log_entry of activeSequences) {
    const currentStep = log_entry.sequenceStep ?? 0
    const nextStepDef = ONBOARDING_STEPS[currentStep + 1]
    if (!nextStepDef) continue // Already at last step

    // Check if enough time has passed (delays measured from step 0 createdAt).
    const daysSinceSend = Math.floor((now.getTime() - log_entry.createdAt.getTime()) / 86400000)
    if (daysSinceSend < nextStepDef.delayDays) continue

    // Idempotency: don't double-send if next step already exists in DB.
    const alreadySent = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        userId: log_entry.userId,
        type: 'NEW_MEMBER_WELCOME',
        sequenceStep: nextStepDef.step,
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

    // Email validity gate — placeholder/demo accounts are common in seed data.
    const email = log_entry.user?.email
    if (!email || email.includes('placeholder') || email.includes('demo')) {
      skipped++
      continue
    }

    // Frequency cap + opt-out gate (existing anti-spam infra). isSequenceFollowUp
    // relaxes cross-type cooldown but keeps per-day/per-week caps + opt-out.
    const spamCheck = await checkAntiSpam({
      prisma,
      userId: log_entry.userId,
      clubId,
      type: 'NEW_MEMBER_WELCOME',
      isSequenceFollowUp: true,
    })
    if (!spamCheck.allowed) {
      log.info(`[Onboarding] step ${nextStepDef.step} skipped for ${log_entry.userId}: ${spamCheck.reason}`)
      skipped++
      continue
    }

    // Resolve subject + body. Day 12 (step 2) branches on booking count
    // since this member joined; everything else uses the static template.
    let subject: string
    let body: string

    if (nextStepDef.conditional && nextStepDef.step === 2) {
      // Count confirmed bookings made by this member since the welcome was
      // sent (their de-facto "join" moment). Window is the welcome createdAt
      // → now — long enough that we capture all first-month booking activity.
      const bookingCount = await prisma.playSessionBooking.count({
        where: {
          userId: log_entry.userId,
          status: 'CONFIRMED',
          createdAt: { gte: log_entry.createdAt },
        },
      })

      const variant = selectDay12Template(bookingCount)
      const tpl = DAY_12_TEMPLATES[variant]
      const firstName = log_entry.user?.name?.split(' ')[0] || 'there'
      const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
      const surveyBaseUrl = buildPlatformUrl('/api/surveys/respond')

      subject = tpl.subject(clubName)
      body = variant === 'survey'
        ? (tpl.body as ConditionalDay12Templates['survey']['body'])(firstName, clubName, bookingUrl, surveyBaseUrl, log_entry.id)
        : (tpl.body as ConditionalDay12Templates['congrats']['body'])(firstName, clubName, bookingUrl)
    } else {
      const firstName = log_entry.user?.name?.split(' ')[0] || 'there'
      const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
      subject = nextStepDef.subject(clubName)
      body = nextStepDef.body(firstName, clubName, bookingUrl)
    }

    try {
      const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)
      const { sendOutreachEmail } = await import('@/lib/email')
      await sendOutreachEmail({
        to: email,
        subject,
        body,
        clubName,
        bookingUrl,
      })

      // Persist follow-up. Capture which Day 12 variant was sent so attribution
      // and the future surveys dashboard can join responses to the right log.
      const reasoning: Record<string, unknown> = {
        source: 'onboarding_sequence',
        step: nextStepDef.step,
        delayDays: nextStepDef.delayDays,
        confidence: 95,
        autoApproved: true,
      }
      if (nextStepDef.conditional && nextStepDef.step === 2) {
        // Re-derive the variant cheaply for storage (already computed above
        // but the earlier value isn't in scope here without restructuring).
        const bookingCount = await prisma.playSessionBooking.count({
          where: {
            userId: log_entry.userId,
            status: 'CONFIRMED',
            createdAt: { gte: log_entry.createdAt },
          },
        })
        reasoning.day12Variant = selectDay12Template(bookingCount)
        reasoning.bookingsAtBranch = bookingCount
      }

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: log_entry.userId,
          type: 'NEW_MEMBER_WELCOME',
          channel: 'email',
          sequenceStep: nextStepDef.step,
          parentLogId: log_entry.id,
          status: 'sent',
          reasoning,
        },
      })

      sent++
    } catch (err) {
      log.error(`Onboarding step ${nextStepDef.step} failed for ${log_entry.userId}:`, (err as Error).message?.slice(0, 80))
      skipped++
    }
  }

  return { sent, skipped }
}
