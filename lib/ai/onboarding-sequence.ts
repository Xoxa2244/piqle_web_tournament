/**
 * Onboarding Sequence — 3-step welcome chain for new members
 *
 * Day 0: Welcome email (immediate)
 * Day 3: Check-in email ("How was your first session?")
 * Day 7: Engagement nudge ("X players at your level playing this week")
 *
 * Uses existing sequence-runner infrastructure (parentLogId + sequenceStep).
 * Triggered by event detection cron when new member detected.
 */

import { cronLogger as log } from '@/lib/logger'
import { buildPlatformUrl } from '@/lib/platform-base-url'

export interface OnboardingStep {
  step: number
  delayDays: number
  subject: (clubName: string) => string
  body: (firstName: string, clubName: string, bookingUrl: string) => string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 0,
    delayDays: 0,
    subject: (clubName) => `Welcome to ${clubName}! 🏓`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!\n\nWelcome to ${clubName}! We're excited to have you join our community.\n\nHere's how to get started:\n• Browse upcoming sessions and find a game at your level\n• Open Play is great for beginners — no partner needed\n• Clinics are perfect for improving your skills\n\nCheck out what's coming up and book your first session!\n\nSee you on the courts! 🎉`,
  },
  {
    step: 1,
    delayDays: 3,
    subject: (clubName) => `How's it going at ${clubName}?`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!\n\nYou've been a member of ${clubName} for a few days now. How's it going?\n\nIf you haven't played yet — no worries! Check out this week's sessions and find something that fits your schedule.\n\nIf you've already played — awesome! We'd love to hear how it went. More sessions are being added daily.\n\nLet us know if you need anything! 💪`,
  },
  {
    step: 2,
    delayDays: 7,
    subject: (clubName) => `Your first week at ${clubName} 🎊`,
    body: (firstName, clubName, bookingUrl) =>
      `Hey ${firstName}!\n\nHappy one-week anniversary at ${clubName}! 🎉\n\nHere's what's happening this week:\n• Multiple sessions at all skill levels\n• New players joining daily — great time to meet your crew\n• Open Play available every day\n\nThe first month is key — players who book 3+ sessions in their first 30 days stay active 4x longer. Let's make it happen!\n\nBook your next session now 👇`,
  },
]

/**
 * Process onboarding follow-ups — called by health campaign cron.
 * Finds NEW_MEMBER_WELCOME logs at step 0 or 1, checks if enough days passed,
 * sends the next step.
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

  // Find members in onboarding sequence (step 0 or 1, not yet at final step 2)
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

    // Check if enough time has passed
    const daysSinceSend = Math.floor((now.getTime() - log_entry.createdAt.getTime()) / 86400000)
    if (daysSinceSend < nextStepDef.delayDays) continue // Too early

    // Check if next step already sent
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

    // Send next step
    const email = log_entry.user?.email
    if (!email || email.includes('placeholder') || email.includes('demo')) {
      skipped++
      continue
    }

    try {
      const firstName = log_entry.user?.name?.split(' ')[0] || 'there'
      const bookingUrl = buildPlatformUrl(`/clubs/${clubId}/play`)

      const { sendOutreachEmail } = await import('@/lib/email')
      await sendOutreachEmail({
        to: email,
        subject: nextStepDef.subject(clubName),
        body: nextStepDef.body(firstName, clubName, bookingUrl),
        clubName,
        bookingUrl,
      })

      await prisma.aIRecommendationLog.create({
        data: {
          clubId,
          userId: log_entry.userId,
          type: 'NEW_MEMBER_WELCOME',
          channel: 'email',
          sequenceStep: nextStepDef.step,
          parentLogId: log_entry.id,
          status: 'sent',
          reasoning: {
            source: 'onboarding_sequence',
            step: nextStepDef.step,
            delayDays: nextStepDef.delayDays,
            confidence: 95,
            autoApproved: true,
          },
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
