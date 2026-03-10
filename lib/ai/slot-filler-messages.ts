/**
 * Personalized Slot Filler Invite Messages
 *
 * 4 player types × 3 message variants = 12 unique templates.
 * Uses scoring components from slot-filler.ts to determine player type
 * and inject concrete personalization data (DUPR, schedule fit reasons, etc).
 */

import type { MessageVariant } from './reactivation-messages'

// ── Player Type Classification ──

export type SlotFillerPlayerType = 'perfect_match' | 'strong_fit' | 'good_option' | 'worth_trying'

export function classifySlotFillerPlayerType(input: {
  score: number
  likelihood: 'high' | 'medium' | 'low'
  scheduleFitScore: number
}): SlotFillerPlayerType {
  const { score, likelihood, scheduleFitScore } = input

  if (score >= 80 && likelihood === 'high') return 'perfect_match'
  if (score >= 60 && scheduleFitScore >= 70) return 'strong_fit'
  if (score >= 40) return 'good_option'
  return 'worth_trying'
}

// ── Player Type Labels (for admin UI) ──

export const playerTypeLabels: Record<SlotFillerPlayerType, string> = {
  perfect_match: 'Perfect Match',
  strong_fit: 'Strong Fit',
  good_option: 'Good Option',
  worth_trying: 'Worth Trying',
}

// ── Message Input ──

export interface SlotFillerMessageInput {
  playerName: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  sessionTime: string
  sessionFormat: string
  spotsLeft: number
  playerType: SlotFillerPlayerType
  score: number
  duprRating?: number | null
  scheduleFitReason?: string
  skillFitReason?: string
  daysSinceLastPlay?: number
}

// ── Message Generation ──

export function generateSlotFillerMessages(input: SlotFillerMessageInput): MessageVariant[] {
  switch (input.playerType) {
    case 'perfect_match': return perfectMatchMessages(input)
    case 'strong_fit': return strongFitMessages(input)
    case 'good_option': return goodOptionMessages(input)
    case 'worth_trying': return worthTryingMessages(input)
  }
}

// ── Helpers ──

function fn(name: string): string {
  return name.split(' ')[0] || 'there'
}

function duprLine(dupr?: number | null): string {
  return dupr ? ` (DUPR ${dupr.toFixed(1)})` : ''
}

function spotsLine(spotsLeft: number): string {
  if (spotsLeft <= 0) return ' All spots filled — join the waitlist!'
  if (spotsLeft <= 3) return ` Only ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left!`
  return ` ${spotsLeft} spots available.`
}

function formatLabel(format: string): string {
  return format.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function recentLine(days?: number): string {
  if (!days || days <= 0) return ''
  if (days <= 3) return ' You\'ve been on fire recently —'
  if (days <= 7) return ' Great to see you active this week —'
  if (days <= 14) return ''
  return ' It\'s been a bit — '
}

// ── Perfect Match (score ≥ 80, high likelihood) ──

function perfectMatchMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)

  return [
    {
      id: 'excitement',
      label: 'Excitement',
      recommended: true,
      emailBody: `Hey ${f}! 🎯 This one's tailor-made for you — ${i.sessionTitle} on ${i.sessionDate}, ${i.sessionTime}. It's a ${fmt} session${dp} and our AI matched you at ${i.score}/100.${sp} Don't miss it!`,
      smsBody: `${f}! ${i.sessionTitle} on ${i.sessionDate} is a perfect match for you (${i.score}/100)!${sp} ${i.sessionTime}. Join us!`,
    },
    {
      id: 'fomo',
      label: 'FOMO',
      recommended: false,
      emailBody: `${f}, spots are filling fast for ${i.sessionTitle} on ${i.sessionDate}!${sp} This ${fmt} session${dp} is right in your wheelhouse — ${i.sessionTime} at ${i.clubName}. Grab your spot before it's gone!`,
      smsBody: `${f}, ${i.sessionTitle} is filling up!${sp} ${i.sessionDate}, ${i.sessionTime}. Perfect for your level. Grab your spot!`,
    },
    {
      id: 'casual',
      label: 'Casual',
      recommended: false,
      emailBody: `Hey ${f}!${recentLine(i.daysSinceLastPlay)} we've got a ${fmt} session coming up that fits your schedule perfectly. ${i.sessionTitle} on ${i.sessionDate}, ${i.sessionTime}.${sp} Would love to see you there!`,
      smsBody: `${f}, ${i.sessionTitle} — ${i.sessionDate}, ${i.sessionTime}.${sp} Fits your schedule perfectly. See you there!`,
    },
  ]
}

// ── Strong Fit (score ≥ 60, good schedule match) ──

function strongFitMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)

  return [
    {
      id: 'schedule_match',
      label: 'Schedule Match',
      recommended: true,
      emailBody: `Hey ${f}! ${i.sessionTitle} on ${i.sessionDate} at ${i.sessionTime} fits your usual playing time. It's a ${fmt} session${dp} — great match for your level.${sp} We saved you a spot!`,
      smsBody: `${f}, ${i.sessionTitle} fits your schedule! ${i.sessionDate}, ${i.sessionTime}. ${fmt}${dp}.${sp}`,
    },
    {
      id: 'social',
      label: 'Social',
      recommended: false,
      emailBody: `${f}, your fellow members are gearing up for ${i.sessionTitle} (${i.sessionDate}, ${i.sessionTime}). It's a ${fmt} session at ${i.clubName}${dp} — come join the group!${sp}`,
      smsBody: `${f}, your group is playing ${i.sessionTitle}! ${i.sessionDate}, ${i.sessionTime}.${sp} Come join!`,
    },
    {
      id: 'urgency',
      label: 'Urgency',
      recommended: false,
      emailBody: `${f}, heads up —${sp.trim()} for ${i.sessionTitle} on ${i.sessionDate}. ${i.sessionTime}, ${fmt}${dp}. This one's a strong match for you — don't wait too long!`,
      smsBody: `${f}!${sp} ${i.sessionTitle}, ${i.sessionDate} ${i.sessionTime}. Strong match for you — book now!`,
    },
  ]
}

// ── Good Option (score ≥ 40) ──

function goodOptionMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)

  return [
    {
      id: 'try_new',
      label: 'Try Something New',
      recommended: true,
      emailBody: `Hey ${f}! Looking to mix things up? ${i.sessionTitle} on ${i.sessionDate} at ${i.sessionTime} is a ${fmt} session at ${i.clubName}.${dp}${sp} It could be a great way to expand your game!`,
      smsBody: `${f}, try something new! ${i.sessionTitle} — ${i.sessionDate}, ${i.sessionTime}. ${fmt}${dp}.${sp}`,
    },
    {
      id: 'opportunity',
      label: 'Opportunity',
      recommended: false,
      emailBody: `${f}, there's an open spot in ${i.sessionTitle} on ${i.sessionDate}, ${i.sessionTime}. It's ${fmt}${dp} at ${i.clubName}.${sp} Come play!`,
      smsBody: `${f}, spot open in ${i.sessionTitle}! ${i.sessionDate}, ${i.sessionTime}.${sp}`,
    },
    {
      id: 'reminder',
      label: 'Friendly Reminder',
      recommended: false,
      emailBody: `Hey ${f}!${recentLine(i.daysSinceLastPlay)} just a quick note — ${i.sessionTitle} on ${i.sessionDate} at ${i.sessionTime} still has room. ${fmt} format${dp}.${sp} Hope to see you!`,
      smsBody: `${f}, ${i.sessionTitle} still has room! ${i.sessionDate}, ${i.sessionTime}. Hope to see you!`,
    },
  ]
}

// ── Worth Trying (score < 40) ──

function worthTryingMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)

  return [
    {
      id: 'discovery',
      label: 'Discovery',
      recommended: true,
      emailBody: `Hey ${f}! We think you'd enjoy ${i.sessionTitle} on ${i.sessionDate} at ${i.sessionTime}. It's a ${fmt} session at ${i.clubName} — a great chance to get some court time in.${sp} Give it a try!`,
      smsBody: `${f}, check out ${i.sessionTitle} — ${i.sessionDate}, ${i.sessionTime}. ${fmt}.${sp} Give it a try!`,
    },
    {
      id: 'low_pressure',
      label: 'No Pressure',
      recommended: false,
      emailBody: `${f}, no commitment needed — ${i.sessionTitle} on ${i.sessionDate} at ${i.sessionTime} is open for anyone who wants to play. ${fmt} format at ${i.clubName}.${sp} Drop in if you're free!`,
      smsBody: `${f}, drop in for ${i.sessionTitle}! ${i.sessionDate}, ${i.sessionTime}. No commitment.${sp}`,
    },
    {
      id: 'community',
      label: 'Community',
      recommended: false,
      emailBody: `Hey ${f}! Want to meet new players? ${i.sessionTitle} on ${i.sessionDate}, ${i.sessionTime} at ${i.clubName} is a great way to connect. ${fmt} format, all skill levels welcome.${sp}`,
      smsBody: `${f}, meet new players at ${i.sessionTitle}! ${i.sessionDate}, ${i.sessionTime}.${sp}`,
    },
  ]
}
