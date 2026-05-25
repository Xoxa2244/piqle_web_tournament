/**
 * Tier classifier — per-club extension layer.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.4 + Appendix D.
 *
 * The default `classifyProgrammingTier` (lib/ai/programming-tier-classifier.ts)
 * is a regex/format taxonomy that's static across clubs. This wrapper
 * adds two things on top:
 *
 *   1. Per-club `ClassifierRule[]` — name patterns or CR reservation /
 *      event ids that the club explicitly maps to a tier. Higher
 *      priority short-circuits the default classifier.
 *   2. The TierConfig + TierOverride canonical types used by the
 *      Tier Constructor UI and by the (Phase 2) Tier Compliance
 *      signal generators.
 *
 * Type definitions live here so the engine, the router, and the UI
 * can import a single source of truth.
 */

import {
  classifyProgrammingTier,
  type ProgrammingTier,
} from './programming-tier-classifier'

// ─── Tier config canon (Spec §4.4) ─────────────────────────────────────

export type TierKey = ProgrammingTier

export type TierCadence =
  | { kind: 'daily'; minSessions: number }
  | { kind: 'weekly'; minSessions: number; dayOfWeek?: number }
  | { kind: 'monthly'; minSessions: number }
  | { kind: 'gap_max_days'; maxGapDays: number }

export type TierSuccessMetric =
  | { kind: 'session_count'; min: number }
  | { kind: 'avg_fill_rate'; minPct: number }
  | { kind: 'peak_utilization'; minPct: number }
  | { kind: 'avg_players_per_session'; min: number }
  | { kind: 'p101_to_member_conversion'; minPct: number }
  | { kind: 'continuity'; maxGapDays: number }
  | { kind: 'revenue'; minAmount: number }
  | { kind: 'non_member_share'; minPct: number }
  | { kind: 'participant_count'; min: number }
  | { kind: 'manual_y_n'; label: string }

export interface TierOverride {
  tierKey: TierKey
  isActive: boolean
  cadence?: TierCadence
  successMetric?: TierSuccessMetric
  /** Per-location scope. `'per_location'` is treated identically to
   * `'global'` until multi-location lands; structure stays compatible
   * with the Appendix D preset for forward compat. */
  scope?: 'global' | 'per_location' | { locationIds: string[] }
}

export type ClassifierRuleMatch =
  | { kind: 'name_pattern'; regex: string }
  | { kind: 'cr_reservation_type_id'; id: number }
  | { kind: 'cr_event_category_id'; id: number }

export interface ClassifierRule {
  id: string
  match: ClassifierRuleMatch
  targetTier: TierKey
  priority: number // higher = fires before defaults
}

export interface TierConfig {
  clubId: string
  overrides: TierOverride[]
  customRules: ClassifierRule[]
  updatedAt: Date
  updatedBy: string | null
}

// ─── Extended classifier ───────────────────────────────────────────────

interface ClassifyInputExtended {
  title?: string | null
  format?: string | null
  category?: string | null
  /** CR-side metadata, if present on the source row. */
  reservationTypeId?: number | null
  eventCategoryId?: number | null
}

/**
 * Classify a session against a club's custom rules first, falling
 * through to the global regex classifier when no rule matches.
 *
 * Rules are evaluated in descending priority order. The first rule
 * whose `match` clause matches wins — its `targetTier` is returned.
 * If no rule matches, we fall back to `classifyProgrammingTier(input)`.
 *
 * Invalid regexes in user-supplied `name_pattern` rules are skipped
 * silently (we never want a config row to break the entire run); a
 * Phase 2 admin UI can show validation errors at edit time.
 */
export function classifyProgrammingTierWithRules(
  input: ClassifyInputExtended,
  customRules: ClassifierRule[] | undefined,
): TierKey {
  if (!customRules || customRules.length === 0) {
    return classifyProgrammingTier(input)
  }

  const rules = [...customRules].sort((a, b) => b.priority - a.priority)
  const title = (input.title ?? '').toString()

  for (const rule of rules) {
    const m = rule.match
    if (m.kind === 'name_pattern') {
      try {
        const re = new RegExp(m.regex, 'i')
        if (title && re.test(title)) return rule.targetTier
      } catch {
        // ignore malformed regex; move on
      }
    } else if (m.kind === 'cr_reservation_type_id') {
      if (
        typeof input.reservationTypeId === 'number' &&
        input.reservationTypeId === m.id
      ) {
        return rule.targetTier
      }
    } else if (m.kind === 'cr_event_category_id') {
      if (
        typeof input.eventCategoryId === 'number' &&
        input.eventCategoryId === m.id
      ) {
        return rule.targetTier
      }
    }
  }

  return classifyProgrammingTier(input)
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Type guard for tier_config row coming back as JSONB from the DB.
 * We use this in the router after `$queryRawUnsafe` so callers can
 * trust the shape without re-running schema validation.
 */
export function isValidTierKey(value: unknown): value is TierKey {
  return (
    typeof value === 'string' &&
    [
      'T1_CORE',
      'T2_LEAGUE',
      'T3_SIGNATURE',
      'T4_SOCIAL',
      'T5_TOURNAMENT',
      'T6_PREMIUM',
      'T7_YOUTH',
    ].includes(value)
  )
}

export const ALL_TIER_KEYS: readonly TierKey[] = [
  'T1_CORE',
  'T2_LEAGUE',
  'T3_SIGNATURE',
  'T4_SOCIAL',
  'T5_TOURNAMENT',
  'T6_PREMIUM',
  'T7_YOUTH',
]

/**
 * Narrowly-typed Prisma surface for `loadClubCustomRules` — only needs
 * `$queryRawUnsafe`. Avoids importing the heavy `PrismaClient` type
 * (and the implicit dependency cycle) into a utility module.
 */
type PrismaQueryable = {
  $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * Loads a club's saved custom classifier rules from the `tier_config`
 * table. Returns an empty array when no row exists, when the JSON
 * column is null, or when the column doesn't validate as an array.
 *
 * Callers that need to classify sessions for a specific club should
 * call this once per request, then pass the result to
 * `classifyProgrammingTierWithRules` for every session in the loop.
 *
 * The single SELECT is cheap (1 row by PK) but it's still a round-trip
 * — don't call it inside a session-level loop; load it before the loop
 * and reuse the array.
 *
 * Note on the `$1::uuid` cast: tier_config.club_id is typed as UUID
 * even on Sol2 production (where clubs.id is TEXT) because the FK was
 * created with the UUID variant of the migration. The values are still
 * valid UUID strings, so the cast succeeds at query time.
 */
export async function loadClubCustomRules(
  prisma: PrismaQueryable,
  clubId: string,
): Promise<ClassifierRule[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT custom_rules FROM tier_config WHERE club_id = $1::uuid`,
    clubId,
  )) as Array<{ custom_rules: unknown }>
  const raw = rows[0]?.custom_rules
  return Array.isArray(raw) ? (raw as ClassifierRule[]) : []
}
