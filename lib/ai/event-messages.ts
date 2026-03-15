/**
 * Personalized Event Invite Messages
 *
 * Generates customized invite messages per player based on:
 * - Player role in the event (top_player, regular, newcomer, returning)
 * - Event type (Open Play, Round Robin, Clinic, Drill, League, Ladder)
 * - Player's DUPR, activity, and engagement history
 *
 * 4 roles × 3 message tones = 12 unique template combinations.
 */

// ── Public types ──

export type PlayerRole = 'top_player' | 'regular' | 'newcomer' | 'returning'

export interface EventMessageInput {
  playerName: string
  clubName: string
  eventType: string
  eventTitle: string
  eventDate: string
  eventTime: string
  eventPrice: number
  spotsLeft: number
  totalSpots: number
  playerRole: PlayerRole
  // Player personalization
  duprRating?: number
  lastPlayed?: string
  totalEvents: number
  skillRange: string
}

export interface EventMessageVariant {
  id: string
  label: string
  recommended: boolean
  emailBody: string
  smsBody: string
}

// ── Role Classification ──

export function classifyPlayerRole(input: {
  dupr?: number
  totalEvents: number
  lastPlayed: string
  allDuprs: number[]
}): PlayerRole {
  const { dupr, totalEvents, lastPlayed, allDuprs } = input

  // Newcomer: never played
  if (totalEvents === 0 || lastPlayed === 'never at events') {
    return 'newcomer'
  }

  // Top player: DUPR in top 3 of the event
  if (dupr && allDuprs.length >= 3) {
    const sorted = [...allDuprs].sort((a, b) => b - a)
    if (dupr >= sorted[2]) return 'top_player'
  }

  // Returning: hasn't played recently (>14 days)
  const daysMatch = lastPlayed.match(/(\d+)\s*days?\s*ago/)
  if (daysMatch && parseInt(daysMatch[1]) > 14) return 'returning'

  // Regular: active player
  return 'regular'
}

// ── Message Generation ──

export function generateEventInviteMessages(input: EventMessageInput): EventMessageVariant[] {
  const { playerRole } = input
  switch (playerRole) {
    case 'top_player': return topPlayerMessages(input)
    case 'regular': return regularMessages(input)
    case 'newcomer': return newcomerMessages(input)
    case 'returning': return returningMessages(input)
  }
}

// ── Helpers ──

function fn(name: string): string {
  return name.split(' ')[0] || 'there'
}

function duprLine(dupr?: number): string {
  return dupr ? ` Your ${dupr.toFixed(1)} DUPR` : ''
}

function spotsLine(spotsLeft: number): string {
  if (spotsLeft <= 0) return ' All spots filled — join the waitlist!'
  if (spotsLeft <= 3) return ` Only ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left!`
  return ''
}

function eventTypeFlavor(type: string): string {
  switch (type) {
    case 'Round Robin': return 'competitive round robin'
    case 'Open Play': return 'drop-in open play'
    case 'Clinic': return 'coached clinic'
    case 'Drill': return 'focused drill session'
    case 'League': return 'doubles league'
    case 'Ladder': return 'challenge ladder'
    default: return type.toLowerCase()
  }
}

// ── Top Player Messages ──

function topPlayerMessages(i: EventMessageInput): EventMessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const filled = i.totalSpots - i.spotsLeft

  return [
    {
      id: 'competitive',
      label: 'Competitive',
      recommended: true,
      emailBody: `Hey ${f}!${dp} puts you as one of the top seeds for ${i.eventTitle} on ${i.eventDate}.${sp} ${filled} players already confirmed — bring your A-game. ${i.eventTime}, $${i.eventPrice}. See you on the court!`,
      smsBody: `${f}!${dp} = top seed for ${i.eventTitle} (${i.eventDate}).${sp} $${i.eventPrice}. Bring your A-game!`,
    },
    {
      id: 'friendly',
      label: 'Friendly',
      recommended: false,
      emailBody: `Hey ${f}! We've got a great ${eventTypeFlavor(i.eventType)} coming up — ${i.eventTitle} on ${i.eventDate} at ${i.eventTime}. Your skill level is a perfect match for this group (${i.skillRange}).${sp} $${i.eventPrice}/person. Would love to see you there!`,
      smsBody: `${f}, ${i.eventTitle} on ${i.eventDate} — perfect match for your level! $${i.eventPrice}.${sp}`,
    },
    {
      id: 'fomo',
      label: 'FOMO',
      recommended: false,
      emailBody: `${f}, ${filled} of ${i.totalSpots} spots are already taken for ${i.eventTitle} on ${i.eventDate}.${dp} makes you a perfect fit for this ${eventTypeFlavor(i.eventType)}.${sp} Don't miss out — ${i.eventTime}, $${i.eventPrice} at ${i.clubName}.`,
      smsBody: `${filled}/${i.totalSpots} spots filled for ${i.eventTitle}!${sp}${dp} = perfect fit. $${i.eventPrice}. Don't miss out!`,
    },
  ]
}

// ── Regular Messages ──

function regularMessages(i: EventMessageInput): EventMessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)
  const filled = i.totalSpots - i.spotsLeft

  return [
    {
      id: 'fomo',
      label: 'FOMO',
      recommended: true,
      emailBody: `Hey ${f}! ${filled} of your fellow players already signed up for ${i.eventTitle} (${i.eventDate}, ${i.eventTime}). It's a ${eventTypeFlavor(i.eventType)} — ${i.skillRange}.${sp} $${i.eventPrice}/person at ${i.clubName}. Don't miss out!`,
      smsBody: `${f}, ${filled} players already in for ${i.eventTitle}!${sp} ${i.eventDate}, $${i.eventPrice}. Join them!`,
    },
    {
      id: 'competitive',
      label: 'Competitive',
      recommended: false,
      emailBody: `${f}, ready for a challenge?${dp} is a great match for ${i.eventTitle} on ${i.eventDate}. ${eventTypeFlavor(i.eventType).charAt(0).toUpperCase() + eventTypeFlavor(i.eventType).slice(1)} format, ${i.skillRange}.${sp} ${i.eventTime}, $${i.eventPrice}. See you there!`,
      smsBody: `${f}, ${i.eventTitle} on ${i.eventDate} — great match for your level! $${i.eventPrice}.${sp}`,
    },
    {
      id: 'friendly',
      label: 'Friendly',
      recommended: false,
      emailBody: `Hey ${f}! We're putting together a ${eventTypeFlavor(i.eventType)} at ${i.clubName} — ${i.eventTitle} on ${i.eventDate} at ${i.eventTime}. Players at ${i.skillRange} level, $${i.eventPrice}/person.${sp} Would love to have you join!`,
      smsBody: `${f}, join us for ${i.eventTitle}! ${i.eventDate}, ${i.eventTime}. $${i.eventPrice}. Would love to see you!`,
    },
  ]
}

// ── Newcomer Messages ──

function newcomerMessages(i: EventMessageInput): EventMessageVariant[] {
  const f = fn(i.playerName)
  const sp = spotsLine(i.spotsLeft)

  return [
    {
      id: 'friendly',
      label: 'Friendly Welcome',
      recommended: true,
      emailBody: `Hey ${f}! Welcome to ${i.clubName}! We've got a perfect event for you to get started — ${i.eventTitle} on ${i.eventDate} at ${i.eventTime}. It's a ${eventTypeFlavor(i.eventType)}, great for ${i.skillRange.toLowerCase().includes('beginner') ? 'beginners' : 'your skill level'}. $${i.eventPrice}/person, relaxed atmosphere.${sp} Come meet the community!`,
      smsBody: `Welcome ${f}! Your first event at ${i.clubName}: ${i.eventTitle}, ${i.eventDate}. $${i.eventPrice}, beginner-friendly. Come say hi!`,
    },
    {
      id: 'easy_start',
      label: 'Easy Start',
      recommended: false,
      emailBody: `${f}, looking for an easy way to get into ${i.eventType === 'Ladder' ? 'competitive play' : 'the game'}? ${i.eventTitle} at ${i.clubName} is designed for players like you — ${i.skillRange}. ${i.eventDate}, ${i.eventTime}. Just $${i.eventPrice}. No pressure, just fun!`,
      smsBody: `${f}, easy way to start: ${i.eventTitle} on ${i.eventDate}. $${i.eventPrice}, ${i.skillRange}. No pressure!`,
    },
    {
      id: 'fomo',
      label: 'Social Proof',
      recommended: false,
      emailBody: `${f}, ${i.totalSpots - i.spotsLeft} players are already signed up for ${i.eventTitle} on ${i.eventDate}! It's a ${eventTypeFlavor(i.eventType)} for ${i.skillRange} players. $${i.eventPrice}/person at ${i.clubName}.${sp} Great way to meet the community!`,
      smsBody: `${i.totalSpots - i.spotsLeft} players in for ${i.eventTitle}!${sp} $${i.eventPrice}. Great way to start, ${f}!`,
    },
  ]
}

// ── Returning Player Messages ──

function returningMessages(i: EventMessageInput): EventMessageVariant[] {
  const f = fn(i.playerName)
  const dp = duprLine(i.duprRating)
  const sp = spotsLine(i.spotsLeft)

  return [
    {
      id: 'friendly',
      label: 'Welcome Back',
      recommended: true,
      emailBody: `Hey ${f}! It's been a while — we miss seeing you at ${i.clubName}! Here's a great way to get back in: ${i.eventTitle} on ${i.eventDate} at ${i.eventTime}. ${eventTypeFlavor(i.eventType).charAt(0).toUpperCase() + eventTypeFlavor(i.eventType).slice(1)}, ${i.skillRange}.${dp ? dp + ' is a perfect fit.' : ''} $${i.eventPrice}/person.${sp}`,
      smsBody: `${f}, we miss you! Come back for ${i.eventTitle} on ${i.eventDate}. $${i.eventPrice}. Perfect way to get back in!`,
    },
    {
      id: 'competitive',
      label: 'Challenge',
      recommended: false,
      emailBody: `${f}, ready to get back on the court?${dp} means you can jump right into ${i.eventTitle} — a ${eventTypeFlavor(i.eventType)} for ${i.skillRange} players. ${i.eventDate}, ${i.eventTime}, $${i.eventPrice}. You've still got it!`,
      smsBody: `${f}, jump back in! ${i.eventTitle}, ${i.eventDate}. $${i.eventPrice}.${dp ? dp + ' — you\'ve still got it!' : ''}`,
    },
    {
      id: 'fomo',
      label: 'FOMO',
      recommended: false,
      emailBody: `${f}, ${i.totalSpots - i.spotsLeft} players are in for ${i.eventTitle} on ${i.eventDate} — and we saved a spot for you! ${eventTypeFlavor(i.eventType).charAt(0).toUpperCase() + eventTypeFlavor(i.eventType).slice(1)}, ${i.skillRange}. $${i.eventPrice}/person.${sp} Don't let them have all the fun!`,
      smsBody: `${f}, ${i.totalSpots - i.spotsLeft} players in for ${i.eventTitle}!${sp} We saved you a spot. $${i.eventPrice}!`,
    },
  ]
}
