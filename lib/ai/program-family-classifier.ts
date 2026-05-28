/**
 * Program Family classifier — Programming Health redesign Phase 1 (§7.2).
 *
 * Replaces the abstract 7-tier framework (programming-tier-classifier) with
 * human-readable "families" derived from what clubs actually run. Same
 * regex-on-title technique, repurposed:
 *
 *   tier T1_CORE      → families OPEN_PLAY + CLINIC (split out)
 *   tier T2_LEAGUE    → LEAGUE
 *   tier T3/T4/T5     → EVENTS (merged — see redesign doc §10 decision)
 *   tier T6_PREMIUM   → PRIVATE_LESSON (+ premium clinics → CLINIC)
 *   tier T7_YOUTH     → YOUTH
 *   (new)             → COURT_BOOKING (self-serve pickup court time)
 *   (new, hidden)     → EQUIPMENT (ball machine / court rental — facility)
 *
 * Default policy: hardcode regex baseline (this file) + operator override
 * (future: wire through tier_config.customRules like tier-classifier-
 * extended). This file is the baseline.
 *
 * Detection order matters — most specific first, first match wins. The
 * end of the chain falls back to COURT_BOOKING for generic singles/
 * doubles court time, then OPEN_PLAY for anything else.
 */

export type ProgramFamily =
  | 'OPEN_PLAY'
  | 'COURT_BOOKING'
  | 'CLINIC'
  | 'PRIVATE_LESSON'
  | 'LEAGUE'
  | 'EVENTS'
  | 'YOUTH'
  | 'EQUIPMENT'

export interface FamilyMeta {
  key: ProgramFamily
  label: string
  /** Display order on Programming Health (by typical volume / importance). */
  order: number
  color: string
  bg: string
  border: string
  emoji: string
  /** Equipment is facility usage, not programming — hidden from the main
   *  programming view, shown (later) in a separate facility block. */
  hidden: boolean
  /** Fill rate is meaningful only for organized programs. For self-serve
   *  court bookings + equipment it's always ~100% (booked to capacity),
   *  so the UI suppresses the fill metric for these. */
  fillRateMeaningful: boolean
}

export const PROGRAM_FAMILY_META: Record<ProgramFamily, FamilyMeta> = {
  OPEN_PLAY: {
    key: 'OPEN_PLAY',
    label: 'Open Play',
    order: 1,
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    emoji: '🟢',
    hidden: false,
    fillRateMeaningful: true,
  },
  COURT_BOOKING: {
    key: 'COURT_BOOKING',
    label: 'Court Bookings',
    order: 2,
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
    emoji: '🔵',
    hidden: false,
    fillRateMeaningful: false, // self-serve pickup — always full
  },
  CLINIC: {
    key: 'CLINIC',
    label: 'Clinics & Training',
    order: 3,
    color: '#EAB308',
    bg: 'rgba(234,179,8,0.1)',
    border: 'rgba(234,179,8,0.3)',
    emoji: '🟡',
    hidden: false,
    fillRateMeaningful: true,
  },
  PRIVATE_LESSON: {
    key: 'PRIVATE_LESSON',
    label: 'Private Lessons',
    order: 4,
    color: '#A855F7',
    bg: 'rgba(168,85,247,0.1)',
    border: 'rgba(168,85,247,0.3)',
    emoji: '🟣',
    hidden: false,
    fillRateMeaningful: false, // 1-on-1, capacity is the point
  },
  LEAGUE: {
    key: 'LEAGUE',
    label: 'Leagues',
    order: 5,
    color: '#F97316',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
    emoji: '🟠',
    hidden: false,
    fillRateMeaningful: true,
  },
  EVENTS: {
    key: 'EVENTS',
    label: 'Events',
    order: 6,
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.1)',
    border: 'rgba(236,72,153,0.3)',
    emoji: '🎉',
    hidden: false,
    fillRateMeaningful: true,
  },
  YOUTH: {
    key: 'YOUTH',
    label: 'Youth',
    order: 7,
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.15)',
    border: 'rgba(107,114,128,0.4)',
    emoji: '🟤',
    hidden: false,
    fillRateMeaningful: true,
  },
  EQUIPMENT: {
    key: 'EQUIPMENT',
    label: 'Equipment & Facility',
    order: 8,
    color: '#94A3B8',
    bg: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.3)',
    emoji: '⚫',
    hidden: true, // facility usage, not programming
    fillRateMeaningful: false,
  },
}

interface ClassifyInput {
  title?: string | null
  format?: string | null // PlaySessionFormat
  category?: string | null
}

/** Regex sets — exported so the operator-override layer can extend. */
export const FAMILY_PATTERNS = {
  EQUIPMENT: /\b(ball\s*machine|equipment\s*rental|court\s*rental)\b/i,
  YOUTH: /\b(youth|junior|kids?|teen|academy|jr)\b/i,
  PRIVATE_LESSON: /\b(private\s*lesson|1[\s-]?on[\s-]?1|private\s*coaching)\b/i,
  CLINIC:
    /\b(clinic|drill|skills?|intensive|iq\s*&\s*strategy|strategy\s*clinic|assessment|masterclass|specialty|visiting\s*pro|guest\s*pro)\b/i,
  EVENTS:
    /\b(round\s*robin|moneyball|king\s*\/?\s*queen|king\s+of\s+the\s+court|queen\s+of\s+the\s+court|dupr\s*(night|event)|mix\s*&?\s*match|mixer|cosmic|glow\s*pickleball|trivia|themed?|charity|fundraiser|tournament|championship|slam|rally\s+for)\b/i,
  LEAGUE: /\b(league|team\s*practice)\b/i,
  OPEN_PLAY: /\b(open\s*play|verified)\b/i,
  COURT_BOOKING: /\b(singles|doubles|court)\b/i,
} as const

/**
 * Classify a session into a ProgramFamily.
 *
 * Order: Equipment → Youth → Private Lessons → Clinics → Events →
 * Leagues → Open Play → Court Bookings → (default) Open Play.
 *
 * Empty title → OPEN_PLAY (safe organized default, matches the old
 * classifier's T1_CORE fallback).
 */
export function classifyProgramFamily(input: ClassifyInput): ProgramFamily {
  const title = (input.title ?? '').toString()
  const format = (input.format ?? '').toUpperCase()

  if (title.trim().length === 0) return 'OPEN_PLAY'

  // 1. Equipment / facility — pull out first so ball machine never
  //    pollutes programming families.
  if (FAMILY_PATTERNS.EQUIPMENT.test(title)) return 'EQUIPMENT'

  // 2. Youth — highest programming priority; "Junior Tournament" is
  //    youth pipeline, not an event.
  if (FAMILY_PATTERNS.YOUTH.test(title)) return 'YOUTH'

  // 3. Private lessons — 1-on-1 coaching.
  if (FAMILY_PATTERNS.PRIVATE_LESSON.test(title)) return 'PRIVATE_LESSON'

  // 4. Clinics & training — structured instruction (drills, skills,
  //    intensive, IQ/strategy, assessments, pro clinics).
  if (FAMILY_PATTERNS.CLINIC.test(title)) return 'CLINIC'

  // 5. Events — signature / social / tournaments merged.
  if (FAMILY_PATTERNS.EVENTS.test(title)) return 'EVENTS'

  // 6. Leagues — format flag is the strongest signal; title fallback.
  if (format === 'LEAGUE_PLAY') return 'LEAGUE'
  if (FAMILY_PATTERNS.LEAGUE.test(title)) return 'LEAGUE'

  // 7. Open Play — organized drop-in (named "open play" or "verified"
  //    skill-rated play).
  if (FAMILY_PATTERNS.OPEN_PLAY.test(title)) return 'OPEN_PLAY'

  // 8. Court bookings — generic singles/doubles court time (self-serve).
  if (FAMILY_PATTERNS.COURT_BOOKING.test(title)) return 'COURT_BOOKING'

  // Default — organized play.
  return 'OPEN_PLAY'
}

/** Convenience: classified family's metadata in one call. */
export function getFamilyMeta(input: ClassifyInput): FamilyMeta {
  return PROGRAM_FAMILY_META[classifyProgramFamily(input)]
}

/** All visible families in display order (excludes hidden Equipment). */
export const VISIBLE_FAMILIES: readonly ProgramFamily[] = (
  Object.values(PROGRAM_FAMILY_META) as FamilyMeta[]
)
  .filter((m) => !m.hidden)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.key)

/** All families in display order (including hidden). */
export const ALL_FAMILIES: readonly ProgramFamily[] = (
  Object.values(PROGRAM_FAMILY_META) as FamilyMeta[]
)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.key)
