/**
 * Programming Tier classifier — Sprint 1 P1.4.
 *
 * IPC's Programming Operating System (v1.0) groups every session into
 * one of 7 tiers, each with its own delivery cadence and intent. We
 * mirror that taxonomy as a derived classification over CR session
 * data — no schema migration required, no CRUD on tiers (see "iQSport
 * is intelligence layer over CR" principle).
 *
 *   T1_CORE         daily core (Open Play, Classes, Pickleball 101)
 *   T2_LEAGUE       structured play, always active
 *   T3_SIGNATURE    weekly hooks (Round Robin, Moneyball, DUPR events)
 *   T4_SOCIAL       monthly community events (Cosmic, Trivia, charity)
 *   T5_TOURNAMENT   local + system-wide tournaments
 *   T6_PREMIUM      specialty / visiting-pro clinics
 *   T7_YOUTH        youth pipeline (intro, development, academy)
 *
 * Classification is regex-on-title with a few format-aware shortcuts.
 * Audit on IPC data shows >90% accuracy out of the box; admins can
 * override via per-club rules in Settings → Programming (Sprint 2
 * stretch goal — see IPC_SPRINTS.md S2 polish).
 *
 * Order matters: more specific patterns are tested first so a session
 * named "Youth Tournament" gets T7_YOUTH (kids context) over
 * T5_TOURNAMENT.
 */

export type ProgrammingTier =
  | 'T1_CORE'
  | 'T2_LEAGUE'
  | 'T3_SIGNATURE'
  | 'T4_SOCIAL'
  | 'T5_TOURNAMENT'
  | 'T6_PREMIUM'
  | 'T7_YOUTH'

export interface TierMeta {
  key: ProgrammingTier
  label: string
  shortLabel: string
  cadence: string
  color: string
  bg: string
  border: string
  emoji: string
}

export const PROGRAMMING_TIER_META: Record<ProgrammingTier, TierMeta> = {
  T1_CORE: {
    key: 'T1_CORE',
    label: 'Core programming',
    shortLabel: 'T1 Core',
    cadence: 'daily',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
    emoji: '🔴',
  },
  T2_LEAGUE: {
    key: 'T2_LEAGUE',
    label: 'Leagues',
    shortLabel: 'T2 League',
    cadence: 'continuous',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
    emoji: '🟠',
  },
  T3_SIGNATURE: {
    key: 'T3_SIGNATURE',
    label: 'Signature events',
    shortLabel: 'T3 Signature',
    cadence: '1–2/wk',
    color: '#EAB308',
    bg: 'rgba(234,179,8,0.1)',
    border: 'rgba(234,179,8,0.3)',
    emoji: '🟡',
  },
  T4_SOCIAL: {
    key: 'T4_SOCIAL',
    label: 'Social & community',
    shortLabel: 'T4 Social',
    cadence: '1–2/mo',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
    emoji: '🔵',
  },
  T5_TOURNAMENT: {
    key: 'T5_TOURNAMENT',
    label: 'Tournaments',
    shortLabel: 'T5 Tournament',
    cadence: 'monthly + 4/yr',
    color: '#A855F7',
    bg: 'rgba(168,85,247,0.1)',
    border: 'rgba(168,85,247,0.3)',
    emoji: '🟣',
  },
  T6_PREMIUM: {
    key: 'T6_PREMIUM',
    label: 'Premium programming',
    shortLabel: 'T6 Premium',
    cadence: 'monthly + quarterly',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    emoji: '🟢',
  },
  T7_YOUTH: {
    key: 'T7_YOUTH',
    label: 'Youth pipeline',
    shortLabel: 'T7 Youth',
    cadence: 'ongoing',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.15)',
    border: 'rgba(107,114,128,0.4)',
    emoji: '⚫',
  },
}

interface ClassifyInput {
  title?: string | null
  format?: string | null  // PlaySessionFormat: OPEN_PLAY / CLINIC / DRILL / LEAGUE_PLAY / SOCIAL
  category?: string | null
}

/**
 * Classify a CR session into one of 7 IPC tiers. Returns T1_CORE as
 * the safe fallback when nothing matches — daily core is the default
 * bucket, matches the "non-negotiable" framing in IPC's spec.
 */
export function classifyProgrammingTier(input: ClassifyInput): ProgrammingTier {
  const title = (input.title ?? '').toLowerCase()
  const format = (input.format ?? '').toUpperCase()
  const category = (input.category ?? '').toLowerCase()

  // T7 Youth — specific keywords (kids/junior/academy/youth) wherever
  // they appear, including in tournament names. Order: highest priority.
  if (/\b(youth|junior|kids|teen|academy|high\s*school|college\s*student|youth\s*league)\b/.test(title)) {
    return 'T7_YOUTH'
  }
  if (/youth|junior|academy|kids/.test(category)) {
    return 'T7_YOUTH'
  }

  // T5 Tournament — explicit tournament cues. Big branded events
  // (Winter Slam, Rally for Riley) usually have "tournament", "slam",
  // "rally", "championship" in the title.
  if (/\btournament|championship|\bslam\b|\brally\s+for\b|moneyball\s+(?:tournament|championship)/.test(title)) {
    return 'T5_TOURNAMENT'
  }

  // T6 Premium — specialty / visiting-pro / advanced clinics.
  if (/\b(specialty|specialist|visiting\s+pro|guest\s+pro|pro\s+clinic|masterclass|advanced\s+clinic)\b/.test(title)) {
    return 'T6_PREMIUM'
  }

  // T2 Leagues — format flag is the primary signal; title fallback.
  if (format === 'LEAGUE_PLAY') return 'T2_LEAGUE'
  if (/\bleague\b/.test(title)) return 'T2_LEAGUE'

  // T3 Signature events — the recurring branded weekly hooks.
  if (/\bround\s*robin\b/.test(title)) return 'T3_SIGNATURE'
  if (/\bmoneyball\b/.test(title)) return 'T3_SIGNATURE'
  if (/\bking\s*\/?\s*queen\b|king\s+of\s+the\s+court|queen\s+of\s+the\s+court/.test(title)) return 'T3_SIGNATURE'
  if (/\bdupr\s+(event|night|session|play)\b/.test(title)) return 'T3_SIGNATURE'
  if (/\bmix\s*&?\s*match\b|mix\s+and\s+match|partner\s+switch/.test(title)) return 'T3_SIGNATURE'

  // T4 Social & community events.
  if (/\bcosmic\b|glow\s+pickleball/.test(title)) return 'T4_SOCIAL'
  if (/\btrivia\b/.test(title)) return 'T4_SOCIAL'
  if (/\b(themed|theme\s+night|halloween|christmas|holiday|easter|valentine|new\s+year)\b/.test(title)) return 'T4_SOCIAL'
  if (/\bcharity|fundraiser|benefit/.test(title)) return 'T4_SOCIAL'
  if (/\b(mixer|social\s+night|pickle\s*&\s*pour|paddle\s*&\s*pints)\b/.test(title)) return 'T4_SOCIAL'

  // T1 Core fallback — Open Play, Classes & Clinics, Pickleball 101,
  // skill-level segmentation. Anything that doesn't match a more
  // specific tier lives here.
  return 'T1_CORE'
}

/**
 * Convenience wrapper that returns the tier metadata in one call.
 * Useful for UI that needs label + color in the same render pass.
 */
export function getTierMeta(input: ClassifyInput): TierMeta {
  return PROGRAMMING_TIER_META[classifyProgrammingTier(input)]
}
