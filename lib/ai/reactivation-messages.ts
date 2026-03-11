/**
 * Hyper-Personalized Reactivation Messages
 *
 * 8 player archetypes × 3 message variants = 24 unique templates.
 * Each template uses concrete data: DUPR, preferred days, formats, session names.
 * Falls back to 3 generic tones when archetype is not provided.
 */

import type { PlayerArchetype } from '../../types/intelligence'

// ── Public types ────────────────────────────────────────────────────────────

export type MessageTone = 'friendly' | 'professional' | 'urgent'

export interface MessageVariant {
  id: string           // archetype-specific ID (e.g., 'nostalgia_pull') or tone ID
  label: string        // display label (e.g., 'Nostalgia Pull')
  recommended: boolean
  emailBody: string
  smsBody: string
}

export interface MessageInput {
  memberName: string
  clubName: string
  daysSinceLastActivity: number
  sessionCount: number
  // Personalization data (all optional for backwards compat)
  duprRating?: number | null
  preferredDays?: string[]
  preferredFormats?: string[]
  preferredTimeSlots?: { morning: boolean; afternoon: boolean; evening: boolean }
  totalBookings?: number
  bookingsLastMonth?: number
  noShowRate?: number
  suggestedSessionTitles?: string[]
  suggestedSessionConfirmedCounts?: number[]
  archetype?: PlayerArchetype
}

export interface ArchetypeClassificationInput {
  totalBookings: number
  daysSinceLastActivity: number
  noShowRate: number
  duprRating?: number | null
  preferredDays?: string[]
  preferredFormats?: string[]
}

// ── Archetype labels for UI ─────────────────────────────────────────────────

export const archetypeLabels: Record<PlayerArchetype, string> = {
  lapsed_regular: 'Lapsed Regular',
  fading_regular: 'Fading Regular',
  ghost_newbie: 'Ghost Newbie',
  never_started: 'Never Started',
  competitor: 'Competitor on Pause',
  weekend_warrior: 'Weekend Warrior',
  flaky_player: 'Flaky Player',
  social_butterfly: 'Social Butterfly',
}

// ── Archetype classification ────────────────────────────────────────────────

export function classifyArchetype(input: ArchetypeClassificationInput): PlayerArchetype {
  const { totalBookings, noShowRate, duprRating, preferredDays, preferredFormats } = input

  // 1. Never started — signed up but 0 bookings
  if (totalBookings === 0) return 'never_started'

  // 2. Flaky player — high no-show rate
  if (noShowRate > 0.15 && totalBookings >= 3) return 'flaky_player'

  // 3. Competitor — has decent DUPR and was active
  if (duprRating && duprRating >= 3.5 && totalBookings >= 5) return 'competitor'

  // 4. Weekend warrior — only plays weekends
  const weekendOnly = preferredDays &&
    preferredDays.length > 0 &&
    preferredDays.every(d => d === 'Saturday' || d === 'Sunday')
  if (weekendOnly) return 'weekend_warrior'

  // 5. Social butterfly — prefers SOCIAL format
  if (preferredFormats && preferredFormats.includes('SOCIAL')) return 'social_butterfly'

  // 6. Lapsed regular — was very active, now gone
  if (totalBookings >= 10) return 'lapsed_regular'

  // 7. Ghost newbie — barely started
  if (totalBookings <= 4) return 'ghost_newbie'

  // 8. Fading regular — moderate activity, fallback
  return 'fading_regular'
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function firstName(name: string): string {
  return name.split(' ')[0] || name
}

function duprStr(rating?: number | null): string {
  if (!rating) return ''
  return String(rating)
}

function topSession(titles?: string[], counts?: number[]): string {
  if (!titles || titles.length === 0) return 'an upcoming session'
  const name = titles[0]
  const count = counts?.[0]
  if (count && count > 0) return `${name} (${count} player${count === 1 ? '' : 's'} signed up)`
  return name
}

function prefDay(days?: string[]): string {
  if (!days || days.length === 0) return ''
  return days[0]
}

function prefFormat(formats?: string[]): string {
  const labels: Record<string, string> = {
    OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
    LEAGUE_PLAY: 'League', SOCIAL: 'Social Play',
  }
  if (!formats || formats.length === 0) return ''
  return labels[formats[0]] || formats[0]
}

function prefTimeSlot(slots?: { morning: boolean; afternoon: boolean; evening: boolean }): string {
  if (!slots) return ''
  if (slots.morning) return 'morning'
  if (slots.afternoon) return 'afternoon'
  if (slots.evening) return 'evening'
  return ''
}

// ── Main generator ──────────────────────────────────────────────────────────

export function generateReactivationMessages(input: MessageInput): MessageVariant[] {
  const { archetype } = input

  // Fallback: no archetype → generic 3 tones (backwards compat)
  if (!archetype) return generateGenericMessages(input)

  // Archetype-specific templates
  switch (archetype) {
    case 'lapsed_regular':    return lapsedRegularMessages(input)
    case 'fading_regular':    return fadingRegularMessages(input)
    case 'ghost_newbie':      return ghostNewbieMessages(input)
    case 'never_started':     return neverStartedMessages(input)
    case 'competitor':        return competitorMessages(input)
    case 'weekend_warrior':   return weekendWarriorMessages(input)
    case 'flaky_player':      return flakyPlayerMessages(input)
    case 'social_butterfly':  return socialButterflyMessages(input)
    default:                  return generateGenericMessages(input)
  }
}

// ── Generic fallback (original 3 tones) ─────────────────────────────────────

function generateGenericMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, sessionCount } = input
  const s = sessionCount !== 1 ? 's' : ''

  return [
    {
      id: 'friendly',
      label: 'Friendly',
      recommended: true,
      emailBody: `Hey ${fn}! We miss seeing you at ${clubName}. It's been ${days} days since your last session — and we've been saving some great games for you! We have ${sessionCount} upcoming session${s} that match your level. Come back and play with us!`,
      smsBody: `Hey ${fn}! Miss you at ${clubName}! ${sessionCount} session${s} coming up at your level. Come play!`,
    },
    {
      id: 'professional',
      label: 'Professional',
      recommended: false,
      emailBody: `Hi ${fn}, this is a courtesy message from ${clubName}. You haven't attended a session in ${days} days. We currently have ${sessionCount} available session${s} that match your skill level. We'd love to welcome you back — browse and book at your convenience.`,
      smsBody: `Hi ${fn}, ${clubName} has ${sessionCount} session${s} available at your level. Book anytime.`,
    },
    {
      id: 'urgent',
      label: 'Urgent',
      recommended: false,
      emailBody: `${fn}, spots are filling up fast at ${clubName}! It's been ${days} days since your last game. We have ${sessionCount} session${s} this week with limited availability — don't miss out on the action. Grab your spot before they're gone!`,
      smsBody: `${fn}, spots filling fast! ${sessionCount} session${s} this week at ${clubName}. Don't miss out!`,
    },
  ]
}

// ── Lapsed Regular ──────────────────────────────────────────────────────────
// Was very active (≥10 bookings), now inactive 21-45d

function lapsedRegularMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, totalBookings } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const dupr = duprStr(input.duprRating)
  const day = prefDay(input.preferredDays)

  const duprLine = dupr ? ` With your ${dupr} DUPR rating, you'd be a perfect match for ${session}.` : ''
  const dayLine = day ? ` We know ${day}s are your thing` : ''
  const bookingsLine = totalBookings ? `${totalBookings} sessions` : 'all those sessions'

  return [
    {
      id: 'nostalgia_pull',
      label: 'Nostalgia Pull',
      recommended: true,
      emailBody: `Hey ${fn}! It's been ${days} days since your last game at ${clubName}, and your group misses you! Remember ${bookingsLine} together?${duprLine}${dayLine ? `${dayLine} — we've got spots waiting for you.` : ' Come make it one more!'} Let's get you back on the court!`,
      smsBody: `${fn}, ${days}d since your last game at ${clubName}! ${dupr ? `Your ${dupr} DUPR is perfect for ` : ''}${session}${day ? ` this ${day}` : ''}. We miss you!`,
    },
    {
      id: 'what_changed',
      label: 'What Changed?',
      recommended: false,
      emailBody: `Hi ${fn}, we noticed you haven't been to ${clubName} in ${days} days — and that's unusual for someone who played ${bookingsLine} with us. Is there something we can do differently? We'd love your feedback. In the meantime, ${session} looks like a great fit for you${dupr ? ` at your ${dupr} level` : ''}.`,
      smsBody: `${fn}, we noticed you've been away from ${clubName} for ${days}d. Everything ok? ${session} would love to have you back.`,
    },
    {
      id: 'vip_return',
      label: 'VIP Return',
      recommended: false,
      emailBody: `${fn}, you're one of our most valued players at ${clubName} with ${bookingsLine} under your belt! It's been ${days} days and the courts aren't the same without you.${duprLine} Come back and show everyone why you're a ${clubName} regular!`,
      smsBody: `${fn}, VIP alert! ${clubName} misses their regular. ${days}d away is too long. ${session} has your name on it!`,
    },
  ]
}

// ── Fading Regular ──────────────────────────────────────────────────────────
// Moderate activity (5-9 bookings), slowing down

function fadingRegularMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, totalBookings, sessionCount } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const day = prefDay(input.preferredDays)
  const format = prefFormat(input.preferredFormats)

  return [
    {
      id: 'gentle_checkin',
      label: 'Gentle Check-in',
      recommended: true,
      emailBody: `Hey ${fn}! Just checking in from ${clubName}. It's been ${days} days since we last saw you. You've played ${totalBookings || 'several'} sessions with us and we'd love to keep that going!${format ? ` We've got ${format} sessions` : ` We have ${sessionCount} sessions`} coming up that match your level. How about one more?`,
      smsBody: `Hey ${fn}! ${clubName} checking in — ${days}d since your last game. ${session} is perfect for you. Join us?`,
    },
    {
      id: 'milestone_reminder',
      label: 'Milestone Reminder',
      recommended: false,
      emailBody: `${fn}, did you know you've played ${totalBookings || 'multiple'} sessions at ${clubName}? That's awesome! Don't let the momentum stop now. It's been ${days} days — ${session}${day ? ` this ${day}` : ''} would be a perfect way to get back in the groove.`,
      smsBody: `${fn}, ${totalBookings || '?'} sessions at ${clubName} and counting! Don't stop now. ${session}${day ? ` ${day}` : ''} awaits!`,
    },
    {
      id: 'slot_reminder',
      label: 'Slot Reminder',
      recommended: false,
      emailBody: `Hi ${fn}, we noticed your schedule at ${clubName} has been quiet for ${days} days.${day ? ` Your usual ${day}` : ' Your preferred'} slot${format ? ` for ${format}` : ''} still has spots open. We've got ${sessionCount} session${sessionCount !== 1 ? 's' : ''} that match your skill level. Book one before they fill up!`,
      smsBody: `${fn},${day ? ` your ${day}` : ' your preferred'} slot at ${clubName} has openings. ${days}d away — time to come back!`,
    },
  ]
}

// ── Ghost Newbie ────────────────────────────────────────────────────────────
// 1-4 bookings, then disappeared

function ghostNewbieMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, totalBookings } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const time = prefTimeSlot(input.preferredTimeSlots)

  return [
    {
      id: 'welcome_back',
      label: 'Welcome Back',
      recommended: true,
      emailBody: `Hey ${fn}! We loved having you at ${clubName}${totalBookings ? ` for ${totalBookings === 1 ? 'your first session' : `your first ${totalBookings} sessions`}` : ''}. It's been ${days} days and we'd love to see you again! ${session} is a great way to ease back in — friendly games, all skill levels welcome.${time ? ` Perfect for your ${time} schedule.` : ''}`,
      smsBody: `${fn}! Loved seeing you at ${clubName}. ${days}d since — come back for ${session}! All levels welcome.`,
    },
    {
      id: 'easy_start',
      label: 'Easy Start',
      recommended: false,
      emailBody: `Hi ${fn}, getting started at a new club can feel daunting, but you've already taken the first step at ${clubName}! It's been ${days} days — how about another round? ${session} is beginner-friendly and our community is super welcoming. No pressure, just fun!`,
      smsBody: `${fn}, ${clubName} is waiting! ${session} is beginner-friendly. ${days}d is too long — come have fun!`,
    },
    {
      id: 'buddy_system',
      label: 'Buddy System',
      recommended: false,
      emailBody: `${fn}, we get it — playing at a new club can feel intimidating. That's why ${clubName} matches players by skill level! It's been ${days} days since your last visit. ${session} would pair you with players at your level. Bring a friend if you'd like — the more the merrier!`,
      smsBody: `${fn}, ${clubName} matches you by skill level! ${session} is perfect. Bring a friend — ${days}d is too long!`,
    },
  ]
}

// ── Never Started ───────────────────────────────────────────────────────────
// 0 bookings, signed up but never played

function neverStartedMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, sessionCount } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const time = prefTimeSlot(input.preferredTimeSlots)
  const format = prefFormat(input.preferredFormats)

  return [
    {
      id: 'first_step',
      label: 'First Step',
      recommended: true,
      emailBody: `Hey ${fn}! We noticed you joined ${clubName} but haven't played your first game yet. No worries — everyone starts somewhere! ${session} is a great first experience${format ? ` with ${format}` : ''}.${time ? ` It fits perfectly in the ${time}.` : ''} Our community is friendly and welcoming. Take the first step!`,
      smsBody: `${fn}! You joined ${clubName} — now let's play! ${session} is perfect for your first game. Everyone's welcome!`,
    },
    {
      id: 'what_to_expect',
      label: 'What to Expect',
      recommended: false,
      emailBody: `Hi ${fn}, wondering what it's like to play at ${clubName}? Here's the scoop: show up, we match you with players at your level, and you play! That's it. We have ${sessionCount} session${sessionCount !== 1 ? 's' : ''} coming up. ${session} is beginner-friendly. All you need is a paddle and some sneakers!`,
      smsBody: `${fn}, curious about ${clubName}? Show up, get matched, play! ${session} is beginner-friendly. Just bring a paddle!`,
    },
    {
      id: 'personal_invite',
      label: 'Personal Invite',
      recommended: false,
      emailBody: `${fn}, consider this your personal invitation to ${clubName}! We'd love to meet you on the court. ${session}${time ? ` (${time})` : ''} is a relaxed session where you can learn the ropes and meet other players. No experience needed — just show up and have fun!`,
      smsBody: `${fn}, personal invite to ${clubName}! ${session} — no experience needed, just show up and play!`,
    },
  ]
}

// ── Competitor ──────────────────────────────────────────────────────────────
// Has DUPR ≥ 3.5, was active, on pause

function competitorMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const dupr = duprStr(input.duprRating)
  const day = prefDay(input.preferredDays)

  return [
    {
      id: 'level_up',
      label: 'Level Up',
      recommended: true,
      emailBody: `${fn}, with a ${dupr} DUPR rating, you're one of the strongest players at ${clubName}! It's been ${days} days since your last game — time to get back and level up. ${session}${day ? ` this ${day}` : ''} has competitive players at your level. Your rating won't maintain itself — let's go!`,
      smsBody: `${fn}, ${dupr} DUPR player! ${days}d away from ${clubName}. ${session} has players at your level. Time to compete!`,
    },
    {
      id: 'challenge',
      label: 'Challenge',
      recommended: false,
      emailBody: `Hey ${fn}, the competition at ${clubName} has been heating up while you've been away for ${days} days! Players at your ${dupr} level have been battling it out. ${session} is going to be intense — are you up for the challenge? Don't let your DUPR get rusty!`,
      smsBody: `${fn}, competition is heating up at ${clubName}! ${days}d away. ${session} needs your ${dupr} DUPR. Up for it?`,
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      recommended: false,
      emailBody: `${fn}, your ${dupr} DUPR puts you among the top players at ${clubName}. But ${days} days without a game means others are catching up! ${session}${day ? ` on ${day}` : ''} is a chance to defend your position. The courts are waiting for you — show them what you've got!`,
      smsBody: `${fn}, top ${dupr} DUPR at ${clubName}! ${days}d off = others catching up. ${session} — defend your spot!`,
    },
  ]
}

// ── Weekend Warrior ─────────────────────────────────────────────────────────
// Plays only weekends, hasn't booked recently

function weekendWarriorMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, sessionCount } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const dupr = duprStr(input.duprRating)

  return [
    {
      id: 'weekend_spot',
      label: 'Weekend Spot',
      recommended: true,
      emailBody: `Hey ${fn}! We know weekends are your jam at ${clubName}. It's been ${days} days since your last game and we've got ${sessionCount} weekend session${sessionCount !== 1 ? 's' : ''} coming up! ${session} looks perfect for you${dupr ? ` at your ${dupr} level` : ''}. Grab your Saturday spot before it fills up!`,
      smsBody: `${fn}! Weekend sessions at ${clubName} filling up! ${session}${dupr ? ` (${dupr} DUPR level)` : ''} — grab your spot!`,
    },
    {
      id: 'best_slot',
      label: 'Best Weekend Slot',
      recommended: false,
      emailBody: `${fn}, your favorite weekend slots at ${clubName} are getting competitive! It's been ${days} days — and the best times go fast. ${session} is one of the prime weekend spots. Book early and lock in your preferred time!`,
      smsBody: `${fn}, prime weekend slots at ${clubName} going fast! ${days}d away. ${session} — book before it's gone!`,
    },
    {
      id: 'group_signup',
      label: 'Group Signup',
      recommended: false,
      emailBody: `Hey ${fn}, how about getting a crew together for the weekend at ${clubName}? It's been ${days} days and we miss our weekend warriors! ${session} has spots open — bring your friends and make it a great Saturday${dupr ? `. Players around ${dupr} DUPR are joining` : ''}!`,
      smsBody: `${fn}, bring your crew to ${clubName} this weekend! ${session} has spots. ${days}d is too long — let's play!`,
    },
  ]
}

// ── Flaky Player ────────────────────────────────────────────────────────────
// High no-show rate (>15%)

function flakyPlayerMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const day = prefDay(input.preferredDays)
  const time = prefTimeSlot(input.preferredTimeSlots)

  return [
    {
      id: 'fresh_start',
      label: 'Fresh Start',
      recommended: true,
      emailBody: `Hey ${fn}! We know life gets busy and schedules change. It's been ${days} days since ${clubName} — how about a fresh start? ${session}${day ? ` on ${day}` : ''}${time ? ` (${time})` : ''} might fit your schedule better. No pressure, just fun pickleball when it works for you!`,
      smsBody: `${fn}, fresh start at ${clubName}! ${session}${day ? ` ${day}` : ''} fits busy schedules. ${days}d away — come when you can!`,
    },
    {
      id: 'easy_commitment',
      label: 'Easy Commitment',
      recommended: false,
      emailBody: `Hi ${fn}, we totally get that committing to regular sessions is tough. That's why ${clubName} offers flexible booking — no subscriptions, no penalties. It's been ${days} days. Just show up when you can! ${session} is a single-session commitment. Easy in, easy out.`,
      smsBody: `${fn}, no commitment needed! ${clubName} is flexible. ${session} — just show up when you can. Easy!`,
    },
    {
      id: 'flexible_options',
      label: 'Flexible Options',
      recommended: false,
      emailBody: `${fn}, we've made booking at ${clubName} even more flexible! It's been ${days} days — and we want to make it easy for you to play when it suits you.${time ? ` How about a ${time} session?` : ''} ${session} is coming up and there's no long-term commitment required. Pop in, play, enjoy!`,
      smsBody: `${fn}, ${clubName} is more flexible than ever! ${session}${time ? ` (${time})` : ''} — no strings attached. Come play!`,
    },
  ]
}

// ── Social Butterfly ────────────────────────────────────────────────────────
// Prefers SOCIAL format, hasn't been around

function socialButterflyMessages(input: MessageInput): MessageVariant[] {
  const fn = firstName(input.memberName)
  const { clubName, daysSinceLastActivity: days, sessionCount } = input
  const session = topSession(input.suggestedSessionTitles, input.suggestedSessionConfirmedCounts)
  const day = prefDay(input.preferredDays)

  return [
    {
      id: 'social_event',
      label: 'Social Event',
      recommended: true,
      emailBody: `Hey ${fn}! The social scene at ${clubName} has been buzzing — and we've missed your energy! It's been ${days} days since your last visit. We have ${sessionCount} social session${sessionCount !== 1 ? 's' : ''} coming up${day ? ` including one on ${day}` : ''}. ${session} is going to be a blast — great people, great games!`,
      smsBody: `${fn}! Social sessions at ${clubName} are 🔥! ${session}${day ? ` on ${day}` : ''} — great people, great games. We miss you!`,
    },
    {
      id: 'group_gathering',
      label: 'Group Gathering',
      recommended: false,
      emailBody: `${fn}, the crew at ${clubName} keeps asking about you! It's been ${days} days — time to come back and catch up over some games. ${session} is perfect for mixing and matching with other players. The social vibe is what makes ${clubName} special!`,
      smsBody: `${fn}, the crew at ${clubName} misses you! ${days}d away. ${session} — mix, match, and play. Come back!`,
    },
    {
      id: 'new_friends',
      label: 'New Friends',
      recommended: false,
      emailBody: `Hey ${fn}, some awesome new players have joined ${clubName} since you were last here ${days} days ago! ${session} is a great way to meet them. Our social sessions are designed for connection — come play, chat, and make new pickleball friends!`,
      smsBody: `${fn}, new players at ${clubName}! ${session} — meet new friends and play. ${days}d is too long!`,
    },
  ]
}
