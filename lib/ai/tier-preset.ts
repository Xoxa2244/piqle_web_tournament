/**
 * Solomon Preset — sealed defaults for Tier Constructor.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md Appendix D.
 *
 * 7 TierOverride entries derived from IPC's Programming Operating
 * System v1.0. Drops into `tier_config.overrides` when the operator
 * clicks "Apply Solomon Preset" in the Tier Constructor.
 *
 * The preset is a starting point — once applied the club edits or
 * removes individual rows. Re-applying replaces all 7 rows (it's a
 * snapshot, not a merge).
 */

import type { TierOverride } from './tier-classifier-extended'

export const SOLOMON_PRESET_VERSION = '1.0' as const

export const SOLOMON_PRESET_SOURCE =
  'Indianapolis Pickleball Club — Programming Operating System v1.0' as const

export const SOLOMON_PRESET: ReadonlyArray<TierOverride> = [
  {
    tierKey: 'T1_CORE',
    isActive: true,
    scope: 'per_location',
    cadence: { kind: 'daily', minSessions: 1 },
    successMetric: { kind: 'peak_utilization', minPct: 70 },
  },
  {
    tierKey: 'T2_LEAGUE',
    isActive: true,
    scope: 'per_location',
    cadence: { kind: 'gap_max_days', maxGapDays: 7 },
    successMetric: { kind: 'continuity', maxGapDays: 7 },
  },
  {
    tierKey: 'T3_SIGNATURE',
    isActive: true,
    scope: 'per_location',
    cadence: { kind: 'weekly', minSessions: 1 },
    successMetric: { kind: 'avg_fill_rate', minPct: 70 },
  },
  {
    tierKey: 'T4_SOCIAL',
    isActive: true,
    scope: 'per_location',
    cadence: { kind: 'monthly', minSessions: 1 },
    successMetric: { kind: 'non_member_share', minPct: 25 },
  },
  {
    tierKey: 'T5_TOURNAMENT',
    isActive: true,
    scope: 'global',
    cadence: { kind: 'gap_max_days', maxGapDays: 60 },
    successMetric: { kind: 'participant_count', min: 50 },
  },
  {
    tierKey: 'T6_PREMIUM',
    isActive: true,
    scope: 'per_location',
    cadence: { kind: 'monthly', minSessions: 1 },
    successMetric: { kind: 'session_count', min: 1 },
  },
  {
    tierKey: 'T7_YOUTH',
    isActive: true,
    scope: 'global',
    cadence: { kind: 'weekly', minSessions: 1 },
    successMetric: { kind: 'participant_count', min: 10 },
  },
]
