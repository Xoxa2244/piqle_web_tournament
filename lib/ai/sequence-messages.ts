/**
 * Sequence Follow-Up Message Templates
 *
 * These messages are used by the sequence runner for Steps 1-3 of each chain.
 * Step 0 messages come from outreach-messages.ts (the original CHECK_IN / RETENTION_BOOST).
 *
 * Message types:
 *   resend_new_subject  — Same content, different subject line (for non-openers)
 *   social_proof        — Social proof angle (for openers who didn't click)
 *   value_reminder      — Value-focused (for AT_RISK openers)
 *   urgency_resend      — Urgency-focused resend (for AT_RISK non-openers)
 *   sms_nudge           — SMS follow-up (all sequences)
 *   final_offer         — Final email with strong CTA (WATCH)
 *   final_email         — Final retention email (AT_RISK)
 *   community           — Community angle (CRITICAL)
 *   winback_offer       — Win-back with incentive (CRITICAL)
 */

import type { SequenceStepAction } from './sequence-runner'

// ── Input ──

export interface SequenceMessageInput {
  memberName: string
  clubName: string
  daysSinceLastActivity: number | null
  suggestedSessionTitle?: string
  suggestedSessionDate?: string
  suggestedSessionTime?: string
  confirmedCount?: number
  sameLevelCount?: number
  spotsLeft?: number
  /** Original subject from Step 0 (for resend variants) */
  originalSubject?: string
  /** Original variant ID from Step 0 */
  originalVariantId?: string
}

export interface SequenceMessage {
  emailSubject: string
  emailBody: string
  smsBody: string
  /** Which channel this message is for */
  channel: 'email' | 'sms'
}

// ── Social Proof Helper ──

function socialProof(confirmed?: number, sameLevel?: number): string {
  if (sameLevel && sameLevel > 0) {
    return `${sameLevel} player${sameLevel === 1 ? '' : 's'} at your level already signed up`
  }
  if (confirmed && confirmed > 0) {
    return `${confirmed} player${confirmed === 1 ? '' : 's'} already signed up`
  }
  return ''
}

// ── Generator ──

export function generateSequenceMessage(
  messageType: SequenceStepAction['messageType'],
  input: SequenceMessageInput,
): SequenceMessage {
  const name = (input.memberName || 'there').split(' ')[0]
  const club = input.clubName
  const session = input.suggestedSessionTitle || 'our next session'
  const days = input.daysSinceLastActivity ?? 0
  const proof = socialProof(input.confirmedCount, input.sameLevelCount)
  const spotsText = input.spotsLeft ? `Only ${input.spotsLeft} spot${input.spotsLeft !== 1 ? 's' : ''} left` : ''

  switch (messageType) {
    // ── Resend with New Subject (non-openers) ──
    case 'resend_new_subject':
      return {
        channel: 'email',
        emailSubject: `${name}, don't miss this at ${club}`,
        emailBody: `Hi ${name},\n\nJust a quick reminder — "${session}" is coming up at ${club}${proof ? ` — ${proof}` : ''}.\n\nWe'd love to see you there! Your spot is waiting.\n\nBest,\n${club} Team`,
        smsBody: `Hey ${name}! Quick reminder: "${session}" at ${club}. ${proof || 'Spots filling up!'}`,
      }

    // ── Social Proof Angle (openers who didn't click) ──
    case 'social_proof':
      return {
        channel: 'email',
        emailSubject: `${name}, ${proof || 'your friends are playing'} at ${club}`,
        emailBody: `Hi ${name},\n\nJust wanted to let you know — "${session}" at ${club} is getting popular!${proof ? `\n\n${proof}.` : ''} ${spotsText ? `${spotsText}.` : ''}\n\nWould be great to see you on the courts again. The games are always better with more players!\n\nSee you there,\n${club} Team`,
        smsBody: `${name}! "${session}" at ${club} is filling up! ${proof || ''}${spotsText ? ` ${spotsText}.` : ''} Join us!`,
      }

    // ── Value Reminder (AT_RISK openers) ──
    case 'value_reminder':
      return {
        channel: 'email',
        emailSubject: `${name}, here's what's happening at ${club}`,
        emailBody: `Hi ${name},\n\nWe've been making some great improvements at ${club} and wanted to make sure you're in the loop.\n\n"${session}" is a perfect chance to see what's new.${proof ? ` ${proof} will be there too.` : ''}\n\nWe really value having you as part of our community and hope to see you back soon.\n\nWarm regards,\n${club} Team`,
        smsBody: `Hi ${name}! Lots happening at ${club}. "${session}" — great time to come back! ${proof || ''}`,
      }

    // ── Urgency Resend (AT_RISK non-openers) ──
    case 'urgency_resend':
      return {
        channel: 'email',
        emailSubject: `${name}, ${spotsText || 'spots are limited'} for "${session}"`,
        emailBody: `Hi ${name},\n\nWe noticed you haven't had a chance to check out "${session}" at ${club} yet.\n\n${spotsText ? `${spotsText} — ` : ''}we'd really hate for you to miss out.${proof ? ` ${proof}.` : ''}\n\nCome join us — your court time is calling!\n\nBest,\n${club} Team`,
        smsBody: `${name}! "${session}" at ${club} is almost full. ${spotsText ? `${spotsText}. ` : ''}Don't miss out!`,
      }

    // ── SMS Nudge (all sequences) ──
    case 'sms_nudge':
      return {
        channel: 'sms',
        emailSubject: '',
        emailBody: '',
        smsBody: `Hey ${name}! We have "${session}" coming up at ${club}. ${proof ? `${proof}. ` : ''}${spotsText ? `${spotsText}. ` : ''}Would love to see you there!`,
      }

    // ── Final + Offer (WATCH last step) ──
    case 'final_offer':
      return {
        channel: 'email',
        emailSubject: `${name}, one last thing from ${club}`,
        emailBody: `Hi ${name},\n\nThis is our last nudge for a while — we don't want to be annoying!\n\nBut we genuinely miss having you at ${club}. "${session}" is coming up and it would be awesome to see you back.\n\n${proof ? `${proof}, so the group is looking solid.` : 'The lineup is looking great.'}\n\nIf now's not the right time, no worries at all. We'll be here whenever you're ready.\n\nCheers,\n${club} Team`,
        smsBody: `Last reminder, ${name}! "${session}" at ${club}. No pressure — just wanted you to know you're always welcome! 🎾`,
      }

    // ── Final Email (AT_RISK last step) ──
    case 'final_email':
      return {
        channel: 'email',
        emailSubject: `${name}, we'd love to help you get back on track`,
        emailBody: `Hi ${name},\n\nWe know life gets busy, and it's been a while since we've seen you at ${club}.\n\nWe just want you to know — your spot is always open. "${session}" could be a great way to ease back in.${proof ? `\n\n${proof}.` : ''}\n\nIf there's anything we can do to make it easier for you to come back, just let us know.\n\nWe're rooting for you,\n${club} Team`,
        smsBody: `${name}, your spot at ${club} is always open. "${session}" is a great way to ease back in. Hope to see you! 🏓`,
      }

    // ── Community Angle (CRITICAL) ──
    case 'community':
      return {
        channel: 'email',
        emailSubject: `${name}, your ${club} friends miss you`,
        emailBody: `Hi ${name},\n\nOur community at ${club} has been growing, and we want to make sure you're still part of it.\n\nIt's been ${days} days since we've seen you on the courts. Some of your regular playing partners have been asking about you!${proof ? `\n\n"${session}" has ${proof}.` : `\n\n"${session}" is coming up.`}\n\nCome reconnect with the group — everyone would love to see you.\n\nWarm regards,\n${club} Team`,
        smsBody: `${name}, your ${club} friends miss you! It's been ${days} days. "${session}" — come reconnect!`,
      }

    // ── Win-Back Offer (CRITICAL last step) ──
    case 'winback_offer':
      return {
        channel: 'email',
        emailSubject: `${name}, we want you back at ${club}`,
        emailBody: `Hi ${name},\n\nWe've noticed you've been away from ${club} for a while, and we want to be honest — we really miss having you around.\n\nYou're an important part of our community, and the courts aren't the same without you.\n\n"${session}" is coming up and we'd love for you to join.${proof ? ` ${proof}.` : ''}\n\nIs there anything holding you back? We'd love to hear from you and help make it work.\n\nWith care,\n${club} Team`,
        smsBody: `${name}, we really want you back at ${club}. "${session}" is coming up. What can we do to make it work? Reply to chat!`,
      }

    default:
      // Fallback to generic follow-up
      return {
        channel: 'email',
        emailSubject: `${name}, "${session}" at ${club}`,
        emailBody: `Hi ${name},\n\nJust a friendly reminder that "${session}" is coming up at ${club}.${proof ? ` ${proof}.` : ''}\n\nWe'd love to see you there!\n\nBest,\n${club} Team`,
        smsBody: `Hey ${name}! "${session}" at ${club}. Hope to see you there!`,
      }
  }
}

// ── LLM-Powered Sequence Message Variants ──

import {
  generateLLMMessageVariants,
  getPerformanceFeedback,
  type MessageGenerationContext,
} from './llm/message-generator'

export interface SequenceMessageVariant {
  id: string
  message: SequenceMessage
}

/**
 * Generate sequence follow-up message variants via LLM.
 * Returns 3 variants with strategy-based IDs for optimizer A/B testing.
 *
 * Called ONCE per message type per club (not per member).
 * Uses template variables interpolated per-member later.
 */
export async function generateSequenceMessageVariants(
  prisma: any,
  clubId: string,
  messageType: SequenceStepAction['messageType'],
  clubContext: MessageGenerationContext,
): Promise<SequenceMessageVariant[]> {
  if (!messageType) return []

  // Get performance history for feedback loop
  let fullContext = { ...clubContext }
  try {
    const perf = await getPerformanceFeedback(prisma, clubId, messageType)
    if (perf.top.length > 0 || perf.bottom.length > 0) {
      fullContext = {
        ...fullContext,
        topPerformers: perf.top,
        bottomPerformers: perf.bottom,
      }
    }
  } catch (err) {
    console.warn(`[SeqMessages] Performance feedback failed:`, (err as Error).message?.slice(0, 80))
  }

  const rawVariants = await generateLLMMessageVariants({
    messageType,
    context: fullContext,
    channel: messageType === 'sms_nudge' ? 'sms' : 'both',
  })

  return rawVariants.map(v => ({
    id: v.id,
    message: {
      channel: messageType === 'sms_nudge' ? 'sms' as const : 'email' as const,
      emailSubject: v.emailSubject,
      emailBody: v.emailBody,
      smsBody: v.smsBody,
    },
  }))
}
