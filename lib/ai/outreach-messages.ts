/**
 * Health-Based Outreach Messages
 *
 * Two message types for proactive member engagement:
 * - CHECK_IN: for "watch" members (health 50-74) — light, friendly tone
 * - RETENTION_BOOST: for "at_risk" members (health 25-49) — urgent, value-focused
 *
 * Personalized based on which health components are lowest.
 */

import type { RiskLevel } from '../../types/intelligence'

// ── Public types ──

export type OutreachType = 'CHECK_IN' | 'RETENTION_BOOST'

export interface OutreachMessageVariant {
  id: string
  label: string
  recommended: boolean
  emailSubject: string
  emailBody: string
  smsBody: string
}

export interface OutreachMessageInput {
  memberName: string
  clubName: string
  healthScore: number
  riskLevel: RiskLevel
  lowComponents: { key: string; label: string; score: number }[]
  daysSinceLastActivity: number | null
  preferredDays?: string[]
  suggestedSessionTitle?: string
  suggestedSessionDate?: string     // "Thursday, Mar 13"
  suggestedSessionTime?: string     // "6:00–8:00 PM"
  suggestedSessionFormat?: string   // "Open Play"
  confirmedCount?: number
  sameLevelCount?: number
  spotsLeft?: number
  totalBookings?: number
}

// ── Generator ──

// Social proof helper
function socialProof(confirmed?: number, sameLevel?: number): string {
  if (sameLevel && sameLevel > 0) {
    return ` — ${sameLevel} player${sameLevel === 1 ? '' : 's'} at your level already signed up`
  }
  if (confirmed && confirmed > 0) {
    return ` — ${confirmed} player${confirmed === 1 ? '' : 's'} already signed up`
  }
  return ''
}

export function generateOutreachMessages(
  type: OutreachType,
  input: OutreachMessageInput,
): OutreachMessageVariant[] {
  const { memberName, clubName, lowComponents, daysSinceLastActivity, preferredDays, suggestedSessionTitle, confirmedCount, sameLevelCount } = input
  const name = memberName.split(' ')[0] || memberName
  const session = suggestedSessionTitle || 'our next session'
  const days = daysSinceLastActivity ?? 0
  const prefDay = preferredDays?.[0] || ''
  const proof = socialProof(confirmedCount, sameLevelCount)

  // Determine the primary issue for personalization
  const primary = lowComponents[0]?.key || 'recency'

  if (type === 'CHECK_IN') {
    return generateCheckinMessages(name, clubName, session, days, prefDay, primary, proof)
  }
  return generateRetentionMessages(name, clubName, session, days, prefDay, primary, proof)
}

// ── CHECK_IN messages (watch members, health 50-74) ──

function generateCheckinMessages(
  name: string, club: string, session: string, days: number, prefDay: string, primary: string, proof: string,
): OutreachMessageVariant[] {
  const variants: OutreachMessageVariant[] = []

  // Variant 1: Pattern-based (recommended when patternBreak is low)
  if (prefDay) {
    variants.push({
      id: 'checkin_pattern',
      label: 'Missed Session',
      recommended: primary === 'patternBreak',
      emailSubject: `We missed you on ${prefDay}, ${name}!`,
      emailBody: `Hi ${name},\n\nWe noticed you missed your usual ${prefDay} session at ${club}. Everything OK?\n\nWe have "${session}" coming up${proof}. Would love to see you there — your spot is always open!\n\nSee you on the courts,\n${club} Team`,
      smsBody: `Hey ${name}! Missed you on ${prefDay} at ${club}. "${session}" is coming up${proof}. Hope to see you there!`,
    })
  }

  // Variant 2: Frequency-based
  variants.push({
    id: 'checkin_frequency',
    label: 'Gentle Nudge',
    recommended: primary === 'frequencyTrend' || (!prefDay && primary === 'patternBreak'),
    emailSubject: `${name}, it's been a minute!`,
    emailBody: `Hi ${name},\n\nWe noticed your visits to ${club} have slowed down a bit lately. No worries — we just want to make sure you know there are some great sessions coming up.\n\n"${session}" could be a perfect fit for you${proof}. Come join the fun!\n\nBest,\n${club} Team`,
    smsBody: `Hi ${name}! Your visits to ${club} have been a bit less frequent. "${session}" is coming up${proof}. Great chance to get back in the groove!`,
  })

  // Variant 3: Recency-based
  variants.push({
    id: 'checkin_recency',
    label: 'Come Back',
    recommended: primary === 'recency',
    emailSubject: `${days} days without pickleball, ${name}?`,
    emailBody: `Hi ${name},\n\nIt's been ${days} days since your last game at ${club}. We bet you're itching to play!\n\n"${session}" is coming up${proof}. We'd love to see you back on the court. Don't let the paddle gather dust!\n\nCheers,\n${club} Team`,
    smsBody: `Hey ${name}! ${days} days without pickleball? "${session}" at ${club}${proof}. See you there?`,
  })

  // Ensure at least one is recommended
  if (!variants.some(v => v.recommended)) {
    variants[0].recommended = true
  }

  return variants
}

// ── RETENTION_BOOST messages (at_risk members, health 25-49) ──

function generateRetentionMessages(
  name: string, club: string, session: string, days: number, prefDay: string, primary: string, proof: string,
): OutreachMessageVariant[] {
  const variants: OutreachMessageVariant[] = []

  // Variant 1: Value / importance emphasis
  variants.push({
    id: 'retention_value',
    label: 'You Matter',
    recommended: primary === 'frequencyTrend',
    emailSubject: `${name}, we need you back at ${club}`,
    emailBody: `Hi ${name},\n\nWe've noticed a significant drop in your visits to ${club}, and honestly — we miss having you around. You're an important part of our community.\n\nWe have "${session}" coming up${proof}. It would be great to see you there — we've saved a spot just for you.\n\nLet's get you back on the courts!\n${club} Team`,
    smsBody: `${name}, we really miss you at ${club}! "${session}" is coming up${proof}. We saved you a spot!`,
  })

  // Variant 2: Urgency / spot reservation
  variants.push({
    id: 'retention_spot',
    label: 'Saved Spot',
    recommended: primary === 'recency',
    emailSubject: `${name}, your spot at ${club} is waiting`,
    emailBody: `Hi ${name},\n\nIt's been ${days} days since your last session at ${club}. We know life gets busy, but we don't want you to lose your rhythm.\n\n"${session}" has limited spots left${proof}. We've earmarked one for you. Would love to see you back!\n\nBest,\n${club} Team`,
    smsBody: `Hi ${name}! ${days}d since your last game. "${session}"${proof} — has a spot for you at ${club}. Don't miss out!`,
  })

  // Variant 3: Pattern + personalization
  if (prefDay) {
    variants.push({
      id: 'retention_pattern',
      label: 'Your Routine',
      recommended: primary === 'patternBreak' || primary === 'consistency',
      emailSubject: `${name}, let's get back to your ${prefDay} routine`,
      emailBody: `Hi ${name},\n\nYou used to be a regular on ${prefDay}s at ${club}, and we've noticed you've been away. We'd love to help you get back into your groove.\n\n"${session}" is a great way to restart${proof}. Your pickleball buddies are waiting!\n\nSee you soon,\n${club} Team`,
      smsBody: `${name}, missing your ${prefDay} sessions at ${club}! "${session}"${proof}. Great way to restart!`,
    })
  } else {
    variants.push({
      id: 'retention_community',
      label: 'Community',
      recommended: primary === 'patternBreak' || primary === 'consistency',
      emailSubject: `${name}, your ${club} community misses you`,
      emailBody: `Hi ${name},\n\nOur community at ${club} has been growing, and we want to make sure you're still part of it. It's been a while since we've seen you on the courts.\n\n"${session}" is coming up${proof} — it's a great way to reconnect with the group!\n\nWarm regards,\n${club} Team`,
      smsBody: `${name}, the ${club} community misses you! "${session}"${proof}. Great chance to reconnect.`,
    })
  }

  if (!variants.some(v => v.recommended)) {
    variants[0].recommended = true
  }

  return variants
}
