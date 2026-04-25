/**
 * Shared target-resolution logic for the natural-language pending-queue
 * actions exposed through Advisor chat ("approve the reactivation one",
 * "skip all SMS", "approve first").
 *
 * Pure functions only — no DB, no network. Consumed from the POST route
 * handler after a fresh getPendingActions query supplies the live queue.
 *
 * Shape is permissive on purpose: the source pending item comes out of
 * intelligence.getPendingActions which doesn't have a strict typed
 * contract, so we accept `Record<string, unknown>` and pull fields
 * defensively. The only required field is `id`.
 */

export interface PendingTargetItem {
  id: string
  type?: string | null
  title?: string | null
  summary?: string | null
  channel?: 'email' | 'sms' | 'both' | null
}

export type ApproveAction = 'approve' | 'skip' | 'snooze'

export type ResolveTargetOutcome =
  | { kind: 'empty'; reason: 'queue_empty' }
  | { kind: 'none_match'; hint: string }
  | { kind: 'ambiguous'; matches: PendingTargetItem[]; hint: string }
  | { kind: 'resolved'; items: PendingTargetItem[]; isBulk: boolean }

/**
 * Parse the user's natural-language target hint. Strict regex + case-
 * insensitive tokens; no LLM. Covers the 6 common patterns we see in
 * chat:
 *
 *   "approve all"                  → { isBulk: true, filters: {} }
 *   "approve all sms"              → { isBulk: true, filters: { channel: 'sms' } }
 *   "approve all reactivation"     → { isBulk: true, filters: { type: 'reactivation' } }
 *   "approve first" / "#1"         → { isBulk: false, ordinal: 1 }
 *   "approve the second"           → { isBulk: false, ordinal: 2 }
 *   "approve the reactivation one" → { isBulk: false, typeMatch: 'reactivation' }
 *   "approve Alex's one"           → { isBulk: false, nameMatch: 'alex' }
 *
 * Returns null when no actionable target is found — caller should fall
 * back to asking for clarification.
 */
export interface ParsedTarget {
  isBulk: boolean
  ordinal?: number
  typeMatch?: string
  channelMatch?: 'email' | 'sms' | 'both'
  nameMatch?: string
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, '1st': 1,
  second: 2, '2nd': 2,
  third: 3, '3rd': 3,
  fourth: 4, '4th': 4,
  fifth: 5, '5th': 5,
  last: -1,
}

// Normalized synonyms for the main AI recommendation types we surface.
// Map user's natural word → canonical type fragment that we'll substring-match
// against item.type (which is usually ALL_CAPS_SNAKE in the DB).
const TYPE_SYNONYMS: Record<string, string> = {
  reactivation: 'reactivation',
  reactivate: 'reactivation',
  winback: 'reactivation',
  'win-back': 'reactivation',
  'win back': 'reactivation',
  slot: 'slot',
  slotfiller: 'slot',
  'slot-filler': 'slot',
  'slot filler': 'slot',
  fill: 'slot',
  checkin: 'check_in',
  'check-in': 'check_in',
  'check in': 'check_in',
  retention: 'retention',
  boost: 'retention',
  invite: 'event_invite',
  event: 'event_invite',
  referral: 'referral',
  trial: 'trial',
  welcome: 'welcome',
}

export function parseTargetFromMessage(message: string): ParsedTarget | null {
  const lower = message.toLowerCase().trim()

  // Bulk selector — "all", "everything", "all of them"
  const bulkMatch = /\b(all|every|everything|all of (?:them|these|the))\b/.test(lower)

  // Channel filter
  let channelMatch: 'email' | 'sms' | 'both' | undefined
  if (/\b(sms|text|texts)\b/.test(lower)) channelMatch = 'sms'
  else if (/\bemail(s)?\b/.test(lower)) channelMatch = 'email'

  // Type filter via synonyms
  let typeMatch: string | undefined
  for (const [word, canonical] of Object.entries(TYPE_SYNONYMS)) {
    // Word-boundary aware check for multi-word keys.
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(lower)) {
      typeMatch = canonical
      break
    }
  }

  // Ordinal: word form or "#N" / "item N" / "number N"
  let ordinal: number | undefined
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) {
      ordinal = n
      break
    }
  }
  if (ordinal === undefined) {
    const numMatch = lower.match(/(?:#|item|number)\s*(\d{1,2})\b/) || lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/)
    if (numMatch) ordinal = Number(numMatch[1])
  }

  // "Alex's one" / "for Alex" — crude name capture. Keep permissive; the
  // matcher downstream will refuse if it can't find a unique match.
  let nameMatch: string | undefined
  const nameRegex = /\bfor\s+([a-z][a-z'-]{1,40})\b/i.exec(message) || /\b([a-z][a-z'-]{1,40})[''`]s\s+(?:one|action|item)\b/i.exec(message)
  if (nameRegex) nameMatch = nameRegex[1].toLowerCase()

  // Must have at least one actionable signal.
  if (!bulkMatch && ordinal === undefined && !typeMatch && !nameMatch) {
    return null
  }

  return {
    isBulk: bulkMatch && ordinal === undefined,
    ordinal,
    typeMatch,
    channelMatch,
    nameMatch,
  }
}

/**
 * Apply the parsed target against the live pending queue and produce
 * the actual list of items to mutate.
 */
export function resolvePendingTarget(
  items: PendingTargetItem[],
  target: ParsedTarget,
): ResolveTargetOutcome {
  if (items.length === 0) {
    return { kind: 'empty', reason: 'queue_empty' }
  }

  // Apply filters first (type + channel) — they narrow the pool for
  // both bulk and ordinal paths.
  let pool = items
  if (target.channelMatch) {
    pool = pool.filter((i) => (i.channel || 'email') === target.channelMatch)
  }
  if (target.typeMatch) {
    const needle = target.typeMatch.toLowerCase()
    pool = pool.filter((i) => {
      const haystack = `${(i.type || '').toLowerCase()} ${(i.title || '').toLowerCase()}`
      return haystack.includes(needle)
    })
  }
  if (target.nameMatch) {
    const needle = target.nameMatch
    pool = pool.filter((i) => {
      const haystack = `${(i.title || '').toLowerCase()} ${(i.summary || '').toLowerCase()}`
      return haystack.includes(needle)
    })
  }

  if (pool.length === 0) {
    const parts: string[] = []
    if (target.typeMatch) parts.push(`type "${target.typeMatch}"`)
    if (target.channelMatch) parts.push(`channel "${target.channelMatch}"`)
    if (target.nameMatch) parts.push(`name "${target.nameMatch}"`)
    const hint = parts.length > 0
      ? `No pending ${parts.join(' + ')} in the queue.`
      : 'Could not match that to any pending action.'
    return { kind: 'none_match', hint }
  }

  if (target.isBulk) {
    return { kind: 'resolved', items: pool, isBulk: true }
  }

  // Ordinal-based single-item pick.
  if (target.ordinal !== undefined) {
    const idx = target.ordinal === -1
      ? pool.length - 1
      : Math.max(0, Math.min(pool.length - 1, target.ordinal - 1))
    return { kind: 'resolved', items: [pool[idx]], isBulk: false }
  }

  // No ordinal, no bulk — pool size determines the outcome.
  if (pool.length === 1) {
    return { kind: 'resolved', items: pool, isBulk: false }
  }

  // Ambiguous — caller should ask for clarification.
  const hint = `There are ${pool.length} matching pending actions. Say "approve all" to do all of them, or pick by number ("approve #1").`
  return { kind: 'ambiguous', matches: pool.slice(0, 5), hint }
}
