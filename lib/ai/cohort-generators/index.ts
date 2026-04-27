/**
 * AI cohort generators (P3-T1).
 *
 * Each generator is a pure async function producing a CohortSuggestion
 * for a given club. Consumed by `intelligence.listSuggestedCohorts` to
 * populate the AI-Suggested Cohorts section on the Cohorts page.
 *
 * Per SPEC §5 P3-T1 / D4 — three generators ship in Phase 3:
 *   - renewal-in-14d
 *   - lost-evening-players
 *   - new-and-engaged
 *
 * Three more (vip-power-users, birthday-this-month, declining-casuals)
 * are slated for a follow-up sprint per PLAN §4.5.
 *
 * Output shape contract:
 *   - userIds — concrete list of users matching the cohort. Used by the
 *     UI's "Create cohort" CTA to mutate trpc.intelligence.createCohort
 *     with `userId IN [...]` filter.
 *   - estImpactCents — placeholder formula × user count. Real attribution
 *     numbers wired in P5-T3 ($ attribution pipeline).
 *   - When a generator has no matches, return an entry with empty
 *     userIds and estImpactCents=0; the router filters those out.
 */

import type { PrismaClient } from '@prisma/client'

export interface CohortSuggestion {
  /** Stable id used for cache keys + UI keys; format `<generatorKey>:<clubId>:<dateBucket>`. */
  id: string
  /** Generator key — also used in suggestedTemplateKey for Campaign Wizard. */
  generatorKey: 'renewal_in_14d' | 'lost_evening_players' | 'new_and_engaged'
  /** Display name (e.g. "Renewal in 14d"). */
  name: string
  /** One-line description shown on the card. */
  description: string
  /** Suggested next action (e.g. "Renewal nudge"). */
  suggestedAction: string
  /** Maps to a Phase-4 Campaign Wizard template key. */
  suggestedTemplateKey: string
  /** Member userIds that qualify for this cohort. */
  userIds: string[]
  /** Number of qualifying members (== userIds.length). Convenience field. */
  memberCount: number
  /** Estimated $ impact (cents). Placeholder formula until P5-T3. */
  estImpactCents: number
  /** Emoji shown in the card header. */
  emoji: string
}

/** A generator function: club id + db client → optional suggestion. */
export type CohortGenerator = (
  clubId: string,
  db: PrismaClient,
) => Promise<CohortSuggestion | null>

import { generateRenewalIn14d } from './renewal-in-14d'
import { generateLostEveningPlayers } from './lost-evening-players'
import { generateNewAndEngaged } from './new-and-engaged'

/** Ordered registry; runtime sort by estImpactCents desc happens in the router. */
export const COHORT_GENERATORS: CohortGenerator[] = [
  generateRenewalIn14d,
  generateLostEveningPlayers,
  generateNewAndEngaged,
]

/** Run all generators for a club, drop empties, return non-null suggestions. */
export async function runAllCohortGenerators(
  clubId: string,
  db: PrismaClient,
): Promise<CohortSuggestion[]> {
  const settled = await Promise.allSettled(
    COHORT_GENERATORS.map((gen) => gen(clubId, db).catch(() => null)),
  )
  return settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((c): c is CohortSuggestion => !!c && c.userIds.length > 0)
}
