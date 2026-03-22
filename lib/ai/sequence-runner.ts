/**
 * Sequence Runner — Multi-Step Email/SMS Campaign Chains
 *
 * Manages engagement-based follow-up sequences triggered by health score changes.
 * Three sequence types based on risk level:
 *   - WATCH (health 50-74):  4 steps over 10 days, light tone
 *   - AT_RISK (health 25-49): 4 steps over 10 days, urgent tone
 *   - CRITICAL (health <25):  4 steps over 14 days, aggressive multi-channel
 *
 * Stateless design: daily cron checks existing AIRecommendationLog records
 * to determine next action based on engagement data from webhooks
 * (openedAt, clickedAt from Mandrill; deliveredAt from Twilio).
 *
 * New DB fields used:
 *   sequenceStep  — step number in chain (0, 1, 2, 3)
 *   parentLogId   — FK to Step 0 record (root of the sequence)
 */

// ── Types ──

export type SequenceType = 'WATCH' | 'AT_RISK' | 'CRITICAL'

export interface SequenceStepAction {
  /** What to do */
  action: 'send_email' | 'send_sms' | 'exit_converted' | 'exit_done' | 'exit_churned' | 'exit_winback' | 'wait'
  /** Step number for the new log record */
  stepNumber: number
  /** Message template key */
  messageType?: 'resend_new_subject' | 'social_proof' | 'value_reminder' | 'urgency_resend' | 'sms_nudge' | 'final_offer' | 'community' | 'winback_offer' | 'final_email'
  /** Reason for the action (for logging) */
  reason: string
}

export interface ActiveSequence {
  /** Step 0 log record (root) */
  rootLog: {
    id: string
    userId: string
    clubId: string
    sessionId: string | null
    type: string
    createdAt: Date
    variantId: string | null
    reasoning: any
  }
  /** Latest step in the sequence */
  latestStep: {
    id: string
    sequenceStep: number
    createdAt: Date
    channel: string | null
    openedAt: Date | null
    clickedAt: Date | null
    bouncedAt: Date | null
    deliveredAt: Date | null
    status: string
  }
  /** All steps in this sequence */
  allSteps: Array<{
    id: string
    sequenceStep: number
    createdAt: Date
    channel: string | null
    openedAt: Date | null
    clickedAt: Date | null
    bouncedAt: Date | null
    deliveredAt: Date | null
    status: string
    bounceType: string | null
  }>
}

export interface SequenceDecision {
  sequence: ActiveSequence
  action: SequenceStepAction
}

// ── Sequence Configuration ──

interface SequenceConfig {
  /** Maximum steps (0-indexed, so maxStep=3 means steps 0,1,2,3) */
  maxStep: number
  /** Minimum hours between steps */
  minHoursBetweenSteps: number
  /** Step timing: days after Step 0 when each step should fire */
  stepDays: number[]
}

const SEQUENCE_CONFIGS: Record<SequenceType, SequenceConfig> = {
  WATCH: {
    maxStep: 3,
    minHoursBetweenSteps: 48,
    stepDays: [0, 3, 7, 10], // Step 0: Day 0, Step 1: Day 3, Step 2: Day 7, Step 3: Day 10
  },
  AT_RISK: {
    maxStep: 3,
    minHoursBetweenSteps: 48,
    stepDays: [0, 2, 5, 7], // Step 0: Day 0, Step 1: Day 2, Step 2: Day 5, Step 3: Day 7
  },
  CRITICAL: {
    maxStep: 3,
    minHoursBetweenSteps: 24, // More aggressive
    stepDays: [0, 1, 3, 7],  // Step 0: Day 0, Step 1: Day 1, Step 2: Day 3, Step 3: Day 7
  },
}

// ── Risk Level → Sequence Type mapping ──

export function getSequenceType(riskLevel: string): SequenceType | null {
  switch (riskLevel) {
    case 'watch': return 'WATCH'
    case 'at_risk': return 'AT_RISK'
    case 'critical': return 'CRITICAL'
    default: return null
  }
}

// ── Find Active Sequences ──

/**
 * Find all active (incomplete) sequences for a club.
 * An active sequence is one where:
 * - Step 0 exists with sequenceStep=0
 * - Max step hasn't been reached
 * - No exit condition has been triggered
 */
export async function findActiveSequences(
  prisma: any,
  clubId: string,
): Promise<ActiveSequence[]> {
  // Find all root logs (Step 0) that could have active sequences
  // Look back 14 days max (longest sequence is CRITICAL at 14 days)
  const lookbackDate = new Date(Date.now() - 14 * 86400000)

  const rootLogs = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      sequenceStep: 0,
      parentLogId: null, // Root logs don't have a parent
      status: 'sent',
      createdAt: { gte: lookbackDate },
    },
    select: {
      id: true,
      userId: true,
      clubId: true,
      sessionId: true,
      type: true,
      createdAt: true,
      variantId: true,
      reasoning: true,
    },
  })

  const sequences: ActiveSequence[] = []

  for (const rootLog of rootLogs) {
    // Get all steps for this sequence (root + children)
    const childLogs = await prisma.aIRecommendationLog.findMany({
      where: {
        parentLogId: rootLog.id,
      },
      select: {
        id: true,
        sequenceStep: true,
        createdAt: true,
        channel: true,
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        deliveredAt: true,
        status: true,
        bounceType: true,
      },
      orderBy: { sequenceStep: 'asc' },
    })

    // Get root log's own tracking data
    const rootTracking = await prisma.aIRecommendationLog.findUnique({
      where: { id: rootLog.id },
      select: {
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        deliveredAt: true,
        status: true,
        bounceType: true,
        channel: true,
      },
    })

    const allSteps = [
      {
        id: rootLog.id,
        sequenceStep: 0,
        createdAt: rootLog.createdAt,
        channel: rootTracking?.channel || 'email',
        openedAt: rootTracking?.openedAt || null,
        clickedAt: rootTracking?.clickedAt || null,
        bouncedAt: rootTracking?.bouncedAt || null,
        deliveredAt: rootTracking?.deliveredAt || null,
        status: rootTracking?.status || 'sent',
        bounceType: rootTracking?.bounceType || null,
      },
      ...childLogs,
    ]

    const latestStep = allSteps[allSteps.length - 1]

    sequences.push({ rootLog, latestStep, allSteps })
  }

  return sequences
}

// ── Check Exit Conditions ──

interface ExitCheck {
  shouldExit: boolean
  reason?: string
  exitType?: 'converted' | 'improved' | 'opted_out' | 'bounced' | 'max_steps'
}

async function checkExitConditions(
  prisma: any,
  sequence: ActiveSequence,
  sequenceType: SequenceType,
): Promise<ExitCheck> {
  const config = SEQUENCE_CONFIGS[sequenceType]
  const { rootLog, latestStep, allSteps } = sequence

  // 1. Max steps reached
  if (latestStep.sequenceStep >= config.maxStep) {
    return { shouldExit: true, reason: 'Max sequence steps reached', exitType: 'max_steps' }
  }

  // 2. Hard bounce or spam report
  const hasBounce = allSteps.some(s =>
    s.bounceType === 'hard' || s.bounceType === 'rejected' || s.bounceType === 'spam'
  )
  if (hasBounce) {
    return { shouldExit: true, reason: 'Hard bounce or spam report', exitType: 'bounced' }
  }

  // 3. User booked a session since sequence started
  const bookingSince = await prisma.playSessionBooking.findFirst({
    where: {
      userId: rootLog.userId,
      playSession: { clubId: rootLog.clubId },
      status: 'CONFIRMED',
      bookedAt: { gte: rootLog.createdAt },
    },
  })
  if (bookingSince) {
    return { shouldExit: true, reason: 'User booked a session', exitType: 'converted' }
  }

  // 4. User opted out
  try {
    const pref = await prisma.userPlayPreference.findUnique({
      where: { userId_clubId: { userId: rootLog.userId, clubId: rootLog.clubId } },
      select: { notificationsOptOut: true },
    })
    if (pref?.notificationsOptOut) {
      return { shouldExit: true, reason: 'User opted out', exitType: 'opted_out' }
    }
  } catch {
    // No preference = not opted out
  }

  // 5. Health improved above threshold (check latest snapshot)
  const latestSnapshot = await prisma.memberHealthSnapshot.findFirst({
    where: { userId: rootLog.userId, clubId: rootLog.clubId },
    orderBy: { date: 'desc' },
    select: { riskLevel: true, healthScore: true },
  })
  if (latestSnapshot) {
    const currentRisk = latestSnapshot.riskLevel as string
    // If risk improved significantly (e.g., was at_risk, now healthy)
    if (sequenceType === 'WATCH' && (currentRisk === 'healthy')) {
      return { shouldExit: true, reason: 'Health improved to healthy', exitType: 'improved' }
    }
    if (sequenceType === 'AT_RISK' && (currentRisk === 'healthy' || currentRisk === 'watch')) {
      return { shouldExit: true, reason: `Health improved to ${currentRisk}`, exitType: 'improved' }
    }
    if (sequenceType === 'CRITICAL' && (currentRisk === 'healthy' || currentRisk === 'watch')) {
      return { shouldExit: true, reason: `Health improved to ${currentRisk}`, exitType: 'improved' }
    }
  }

  return { shouldExit: false }
}

// ── Determine Next Step (Branching Logic) ──

/**
 * Given an active sequence, determine what action to take next.
 * This is the core branching logic based on engagement data.
 */
export function determineNextStep(
  sequence: ActiveSequence,
  sequenceType: SequenceType,
  now: Date = new Date(),
): SequenceStepAction {
  const config = SEQUENCE_CONFIGS[sequenceType]
  const { rootLog, latestStep, allSteps } = sequence
  const currentStep = latestStep.sequenceStep
  const nextStep = currentStep + 1

  // Check if we've reached the end
  if (nextStep > config.maxStep) {
    if (sequenceType === 'CRITICAL') {
      return { action: 'exit_churned', stepNumber: currentStep, reason: 'Critical sequence exhausted' }
    }
    if (sequenceType === 'AT_RISK') {
      return { action: 'exit_winback', stepNumber: currentStep, reason: 'At-risk sequence exhausted — move to win-back' }
    }
    return { action: 'exit_done', stepNumber: currentStep, reason: 'Watch sequence completed' }
  }

  // Check timing: is it time for the next step?
  const sequenceStartTime = rootLog.createdAt.getTime()
  const targetDay = config.stepDays[nextStep]
  const targetTime = sequenceStartTime + targetDay * 86400000
  const minGapTime = latestStep.createdAt.getTime() + config.minHoursBetweenSteps * 3600000

  if (now.getTime() < targetTime || now.getTime() < minGapTime) {
    return { action: 'wait', stepNumber: currentStep, reason: `Too early for step ${nextStep} (target: day ${targetDay})` }
  }

  // Engagement data from the latest step
  const opened = !!latestStep.openedAt
  const clicked = !!latestStep.clickedAt
  const isEmailStep = latestStep.channel !== 'sms'

  // ═════════════════════════════════════════
  //  WATCH Sequence Branching
  // ═════════════════════════════════════════
  if (sequenceType === 'WATCH') {
    if (nextStep === 1) {
      // Day 3: Branch based on Step 0 engagement
      if (clicked) {
        // Clicked but hasn't booked (would have exited otherwise)
        return { action: 'wait', stepNumber: currentStep, reason: 'User clicked — waiting for SMS step on day 7' }
      }
      if (!opened) {
        return { action: 'send_email', stepNumber: 1, messageType: 'resend_new_subject', reason: 'Email not opened — resending with new subject' }
      }
      // Opened but didn't click
      return { action: 'send_email', stepNumber: 1, messageType: 'social_proof', reason: 'Opened but no click — sending social proof angle' }
    }

    if (nextStep === 2) {
      // Day 7: SMS nudge for clickers, or check resend engagement
      const step0 = allSteps.find(s => s.sequenceStep === 0)
      const step0Clicked = !!step0?.clickedAt

      if (step0Clicked) {
        // Original email was clicked but never booked — send SMS
        return { action: 'send_sms', stepNumber: 2, messageType: 'sms_nudge', reason: 'Clicked email but no booking — SMS nudge' }
      }

      // For resend/social proof recipients: check if they engaged
      if (clicked || opened) {
        return { action: 'wait', stepNumber: currentStep, reason: 'Follow-up engaged — waiting for final step' }
      }
      // Not engaged at all — still send SMS as escalation
      return { action: 'send_sms', stepNumber: 2, messageType: 'sms_nudge', reason: 'No engagement after follow-up — SMS escalation' }
    }

    if (nextStep === 3) {
      // Day 10: Final email with offer
      return { action: 'send_email', stepNumber: 3, messageType: 'final_offer', reason: 'Final step — sending offer' }
    }
  }

  // ═════════════════════════════════════════
  //  AT_RISK Sequence Branching
  // ═════════════════════════════════════════
  if (sequenceType === 'AT_RISK') {
    if (nextStep === 1) {
      // Day 2: Quick follow-up
      if (!opened) {
        return { action: 'send_email', stepNumber: 1, messageType: 'urgency_resend', reason: 'Not opened — urgency resend' }
      }
      return { action: 'send_email', stepNumber: 1, messageType: 'value_reminder', reason: 'Opened — value reminder' }
    }

    if (nextStep === 2) {
      // Day 5: SMS
      if (clicked) {
        // Engaged but not booked
        return { action: 'send_sms', stepNumber: 2, messageType: 'sms_nudge', reason: 'Engaged but no booking — SMS' }
      }
      return { action: 'send_sms', stepNumber: 2, messageType: 'sms_nudge', reason: 'No engagement — SMS escalation' }
    }

    if (nextStep === 3) {
      // Day 7: Final email
      return { action: 'send_email', stepNumber: 3, messageType: 'final_email', reason: 'Final retention email' }
    }
  }

  // ═════════════════════════════════════════
  //  CRITICAL Sequence Branching
  // ═════════════════════════════════════════
  if (sequenceType === 'CRITICAL') {
    if (nextStep === 1) {
      // Day 1: Immediate SMS (regardless of email engagement)
      return { action: 'send_sms', stepNumber: 1, messageType: 'sms_nudge', reason: 'Critical — immediate SMS follow-up' }
    }

    if (nextStep === 2) {
      // Day 3: Community email (if no response at all)
      const anyEngagement = allSteps.some(s => s.openedAt || s.clickedAt)
      if (anyEngagement) {
        // Some signal of life — gentler approach
        return { action: 'send_email', stepNumber: 2, messageType: 'social_proof', reason: 'Some engagement — community email' }
      }
      return { action: 'send_email', stepNumber: 2, messageType: 'community', reason: 'No response — community angle' }
    }

    if (nextStep === 3) {
      // Day 7: Win-back offer (last chance)
      return { action: 'send_email', stepNumber: 3, messageType: 'winback_offer', reason: 'Final step — win-back offer' }
    }
  }

  // Fallback
  return { action: 'wait', stepNumber: currentStep, reason: 'No action determined' }
}

// ── Main: Process All Active Sequences ──

export interface SequenceRunResult {
  clubId: string
  sequencesProcessed: number
  actionsTaken: number
  exits: number
  waits: number
  decisions: Array<{
    userId: string
    sequenceType: SequenceType
    action: string
    reason: string
  }>
}

/**
 * Process all active sequences for a club.
 * Called by the campaign engine after processing new transitions.
 *
 * Returns decisions for each sequence — the campaign engine is responsible
 * for actually sending the messages (email/SMS).
 */
export async function processSequences(
  prisma: any,
  clubId: string,
): Promise<{ results: SequenceDecision[]; summary: SequenceRunResult }> {
  const sequences = await findActiveSequences(prisma, clubId)
  const results: SequenceDecision[] = []
  const summary: SequenceRunResult = {
    clubId,
    sequencesProcessed: sequences.length,
    actionsTaken: 0,
    exits: 0,
    waits: 0,
    decisions: [],
  }

  const now = new Date()

  // Deduplicate: only one active sequence per user
  const seenUsers = new Set<string>()

  for (const sequence of sequences) {
    const userId = sequence.rootLog.userId

    // Skip if we already processed a sequence for this user
    if (seenUsers.has(userId)) continue
    seenUsers.add(userId)

    // Determine sequence type from the outreach type
    const outreachType = sequence.rootLog.type as string
    let sequenceType: SequenceType
    if (outreachType === 'CHECK_IN') {
      sequenceType = 'WATCH'
    } else if (outreachType === 'RETENTION_BOOST') {
      // Determine AT_RISK vs CRITICAL from the reasoning
      const reasoning = sequence.rootLog.reasoning as any
      const transition = reasoning?.transition || ''
      sequenceType = transition.includes('critical') ? 'CRITICAL' : 'AT_RISK'
    } else {
      continue // Skip non-campaign sequences
    }

    // Guard against concurrent processing: skip if latest step was created less than 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    if (sequence.latestStep.createdAt > oneHourAgo && sequence.latestStep.sequenceStep > 0) {
      summary.waits++
      summary.decisions.push({ userId, sequenceType, action: 'wait', reason: 'Recent step detected (concurrency guard)' })
      continue
    }

    // Check exit conditions
    const exitCheck = await checkExitConditions(prisma, sequence, sequenceType)
    if (exitCheck.shouldExit) {
      summary.exits++
      summary.decisions.push({
        userId,
        sequenceType,
        action: `exit:${exitCheck.exitType}`,
        reason: exitCheck.reason || 'Exit condition met',
      })
      // Log exit event for audit trail
      try {
        await prisma.aIRecommendationLog.create({
          data: {
            clubId: sequence.rootLog.clubId,
            userId,
            sessionId: sequence.rootLog.sessionId,
            type: sequence.rootLog.type,
            channel: 'system',
            status: 'exited',
            reasoning: {
              exitType: exitCheck.exitType,
              exitReason: exitCheck.reason,
              sequenceType,
              parentLogId: sequence.rootLog.id,
              sequenceStep: sequence.latestStep.sequenceStep,
            },
          },
        })
      } catch (err) {
        console.warn(`[Sequence] Failed to log exit event:`, (err as Error).message?.slice(0, 80))
      }
      continue
    }

    // Determine next action
    const stepAction = determineNextStep(sequence, sequenceType, now)

    if (stepAction.action === 'wait') {
      summary.waits++
      summary.decisions.push({
        userId,
        sequenceType,
        action: 'wait',
        reason: stepAction.reason,
      })
      continue
    }

    if (stepAction.action.startsWith('exit_')) {
      summary.exits++
      summary.decisions.push({
        userId,
        sequenceType,
        action: stepAction.action,
        reason: stepAction.reason,
      })
      continue
    }

    // Action needed: send_email or send_sms
    summary.actionsTaken++
    summary.decisions.push({
      userId,
      sequenceType,
      action: `${stepAction.action}:${stepAction.messageType}`,
      reason: stepAction.reason,
    })

    results.push({ sequence, action: stepAction })
  }

  return { results, summary }
}

// ── Helper: Check if user has an active sequence ──

export async function hasActiveSequence(
  prisma: any,
  userId: string,
  clubId: string,
): Promise<boolean> {
  const lookbackDate = new Date(Date.now() - 14 * 86400000)

  const activeRoot = await prisma.aIRecommendationLog.findFirst({
    where: {
      userId,
      clubId,
      sequenceStep: 0,
      parentLogId: null,
      status: 'sent',
      createdAt: { gte: lookbackDate },
    },
    select: { id: true },
  })

  return !!activeRoot
}
