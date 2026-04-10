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

/** Format ISO date string or Date to human-readable "Wednesday, Feb 19" */
function fmtDate(raw: string): string {
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  } catch { return raw }
}

/** Extract just the venue/court name from title, stripping the format prefix.
 *  e.g. "DRILL — Court 1" → "Court 1", "Open Play" → "Open Play" */
function sessionLabel(title: string): string {
  const parts = title.split(/\s*[—–-]\s*/)
  return parts.length > 1 ? parts.slice(1).join(' — ') : title
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
  const dt = fmtDate(i.sessionDate)
  const court = sessionLabel(i.sessionTitle)

  return [
    {
      id: 'excitement',
      label: 'Excitement',
      recommended: true,
      emailBody: `Hey ${f}! 🎯 This one's tailor-made for you — ${fmt} at ${court} on ${dt}, ${i.sessionTime}${dp}. Our AI matched you at ${i.score}/100.${sp} Don't miss it!`,
      smsBody: `${f}! ${fmt} on ${dt} is a perfect match for you (${i.score}/100)!${sp} ${i.sessionTime}. Join us!`,
    },
    {
      id: 'fomo',
      label: 'FOMO',
      recommended: false,
      emailBody: `${f}, spots are filling fast for ${fmt} at ${court} on ${dt}!${sp} It's right in your wheelhouse${dp} — ${i.sessionTime} at ${i.clubName}. Grab your spot before it's gone!`,
      smsBody: `${f}, ${fmt} at ${court} is filling up!${sp} ${dt}, ${i.sessionTime}. Perfect for your level!`,
    },
    {
      id: 'casual',
      label: 'Casual',
      recommended: false,
      emailBody: `Hey ${f}!${recentLine(i.daysSinceLastPlay)} we've got a ${fmt} session at ${court} coming up that fits your schedule perfectly. ${dt}, ${i.sessionTime}.${sp} Would love to see you there!`,
      smsBody: `${f}, ${fmt} at ${court} — ${dt}, ${i.sessionTime}.${sp} Fits your schedule perfectly!`,
    },
  ]
}

// ── Strong Fit (score ≥ 60, good schedule match) ──

function strongFitMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)
  const dt = fmtDate(i.sessionDate)
  const court = sessionLabel(i.sessionTitle)

  return [
    {
      id: 'schedule_match',
      label: 'Schedule Match',
      recommended: true,
      emailBody: `Hey ${f}! ${fmt} at ${court} on ${dt}, ${i.sessionTime} fits your usual playing time${dp} — great match for your level.${sp} We saved you a spot!`,
      smsBody: `${f}, ${fmt} at ${court} fits your schedule! ${dt}, ${i.sessionTime}${dp}.${sp}`,
    },
    {
      id: 'social',
      label: 'Social',
      recommended: false,
      emailBody: `${f}, your fellow members are gearing up for ${fmt} at ${court} (${dt}, ${i.sessionTime})${dp} — come join the group at ${i.clubName}!${sp}`,
      smsBody: `${f}, your group is playing ${fmt} at ${court}! ${dt}, ${i.sessionTime}.${sp} Come join!`,
    },
    {
      id: 'urgency',
      label: 'Urgency',
      recommended: false,
      emailBody: `${f}, heads up —${sp.trim()} for ${fmt} at ${court} on ${dt}. ${i.sessionTime}${dp}. This one's a strong match for you — don't wait too long!`,
      smsBody: `${f}!${sp} ${fmt} at ${court}, ${dt} ${i.sessionTime}. Strong match — book now!`,
    },
  ]
}

// ── Good Option (score ≥ 40) ──

function goodOptionMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)
  const dt = fmtDate(i.sessionDate)
  const court = sessionLabel(i.sessionTitle)

  return [
    {
      id: 'try_new',
      label: 'Try Something New',
      recommended: true,
      emailBody: `Hey ${f}! Looking to mix things up? ${fmt} at ${court} on ${dt}, ${i.sessionTime} at ${i.clubName}.${dp}${sp} It could be a great way to expand your game!`,
      smsBody: `${f}, try something new! ${fmt} at ${court} — ${dt}, ${i.sessionTime}${dp}.${sp}`,
    },
    {
      id: 'opportunity',
      label: 'Opportunity',
      recommended: false,
      emailBody: `${f}, there's an open spot for ${fmt} at ${court} on ${dt}, ${i.sessionTime}${dp} at ${i.clubName}.${sp} Come play!`,
      smsBody: `${f}, spot open for ${fmt} at ${court}! ${dt}, ${i.sessionTime}.${sp}`,
    },
    {
      id: 'reminder',
      label: 'Friendly Reminder',
      recommended: false,
      emailBody: `Hey ${f}!${recentLine(i.daysSinceLastPlay)} just a quick note — ${fmt} at ${court} on ${dt}, ${i.sessionTime} still has room${dp}.${sp} Hope to see you!`,
      smsBody: `${f}, ${fmt} at ${court} still has room! ${dt}, ${i.sessionTime}. Hope to see you!`,
    },
  ]
}

// ── Worth Trying (score < 40) ──

function worthTryingMessages(i: SlotFillerMessageInput): MessageVariant[] {
  const f = fn(i.playerName)
  const sp = spotsLine(i.spotsLeft)
  const fmt = formatLabel(i.sessionFormat)
  const dt = fmtDate(i.sessionDate)
  const court = sessionLabel(i.sessionTitle)

  return [
    {
      id: 'discovery',
      label: 'Discovery',
      recommended: true,
      emailBody: `Hey ${f}! We think you'd enjoy ${fmt} at ${court} on ${dt}, ${i.sessionTime} at ${i.clubName} — a great chance to get some court time in.${sp} Give it a try!`,
      smsBody: `${f}, check out ${fmt} at ${court} — ${dt}, ${i.sessionTime}.${sp} Give it a try!`,
    },
    {
      id: 'low_pressure',
      label: 'No Pressure',
      recommended: false,
      emailBody: `${f}, no commitment needed — ${fmt} at ${court} on ${dt}, ${i.sessionTime} is open for anyone who wants to play at ${i.clubName}.${sp} Drop in if you're free!`,
      smsBody: `${f}, drop in for ${fmt} at ${court}! ${dt}, ${i.sessionTime}. No commitment.${sp}`,
    },
    {
      id: 'community',
      label: 'Community',
      recommended: false,
      emailBody: `Hey ${f}! Want to meet new players? ${fmt} at ${court} on ${dt}, ${i.sessionTime} at ${i.clubName} is a great way to connect. All skill levels welcome.${sp}`,
      smsBody: `${f}, meet new players at ${fmt}! ${court}, ${dt}, ${i.sessionTime}.${sp}`,
    },
  ]
}
