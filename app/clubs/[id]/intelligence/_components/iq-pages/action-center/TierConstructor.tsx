'use client'

/**
 * TierConstructor — per-club tier override + distribution table.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.4 + Appendix D.
 *
 * Step 19b ships:
 *   - Live 7-row table fed by `intelligence.getTierConfig` +
 *     `intelligence.getTierDistribution`
 *   - Per-tier active toggle (writes through `updateTierOverride`)
 *   - "Apply Solomon Preset" button (Appendix D bulk replace)
 *   - "Reset to defaults" button
 *
 * Step 20 will add the cadence / successMetric inline editor + the
 * Custom Rules section (Add / Remove ClassifierRule).
 */

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Check,
  Layers,
  RotateCcw,
  Sparkles,
  X as XIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { PROGRAMMING_TIER_META } from '@/lib/ai/programming-tier-classifier'

interface Props {
  clubId: string
}

type TierKey =
  | 'T1_CORE'
  | 'T2_LEAGUE'
  | 'T3_SIGNATURE'
  | 'T4_SOCIAL'
  | 'T5_TOURNAMENT'
  | 'T6_PREMIUM'
  | 'T7_YOUTH'

const ALL_TIER_KEYS: readonly TierKey[] = [
  'T1_CORE',
  'T2_LEAGUE',
  'T3_SIGNATURE',
  'T4_SOCIAL',
  'T5_TOURNAMENT',
  'T6_PREMIUM',
  'T7_YOUTH',
]

interface OverrideRow {
  tierKey: TierKey
  isActive: boolean
  cadence?: any
  successMetric?: any
  scope?: any
}

export function TierConstructor({ clubId }: Props) {
  const configQuery = trpc.intelligence.getTierConfig.useQuery(
    { clubId },
    { enabled: !!clubId },
  )
  const distributionQuery = trpc.intelligence.getTierDistribution.useQuery(
    { clubId },
    { enabled: !!clubId },
  )

  const updateMutation = trpc.intelligence.updateTierOverride.useMutation({
    onSuccess: () => configQuery.refetch(),
  })
  const applyPresetMutation = trpc.intelligence.applyTierPreset.useMutation({
    onSuccess: () => configQuery.refetch(),
  })
  const resetMutation = trpc.intelligence.resetTierConfig.useMutation({
    onSuccess: () => configQuery.refetch(),
  })

  const overrides = useMemo<OverrideRow[]>(
    () => (configQuery.data?.config.overrides ?? []) as OverrideRow[],
    [configQuery.data],
  )
  const customRuleCount = configQuery.data?.config.customRules?.length ?? 0
  const overridesByKey = useMemo(() => {
    const map = new Map<TierKey, OverrideRow>()
    for (const o of overrides) map.set(o.tierKey, o)
    return map
  }, [overrides])

  const distribution = distributionQuery.data?.countsByTier ?? {}
  const totalSessions = distributionQuery.data?.totalSessions ?? 0
  const hasAnyOverride = overrides.length > 0

  const handleToggle = (tierKey: TierKey, next: boolean) => {
    const existing = overridesByKey.get(tierKey)
    updateMutation.mutate({
      clubId,
      tierKey,
      override: {
        ...(existing ?? {}),
        tierKey,
        isActive: next,
      },
    })
  }

  return (
    <div className="space-y-3">
      {/* Header card with action buttons */}
      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(139,92,246,0.10)', color: '#A78BFA' }}
          >
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <p
              className="text-sm"
              style={{ color: 'var(--heading)', fontWeight: 600 }}
            >
              Tier Constructor
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: 'var(--t4)' }}
            >
              {totalSessions} session{totalSessions === 1 ? '' : 's'} classified
              in last 30 days · {hasAnyOverride
                ? `${overrides.length} tier${overrides.length === 1 ? '' : 's'} customized`
                : 'no overrides yet'}
              {customRuleCount > 0
                ? ` · ${customRuleCount} custom rule${customRuleCount === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPresetMutation.mutate({ clubId })}
            disabled={applyPresetMutation.isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: 'rgba(139,92,246,0.12)',
              color: '#A78BFA',
              border: '1px solid rgba(139,92,246,0.25)',
              fontWeight: 600,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {applyPresetMutation.isPending
              ? 'Applying…'
              : 'Apply Solomon Preset'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  'Reset all tier overrides + custom rules to empty defaults? ' +
                    'This cannot be undone.',
                )
              ) {
                return
              }
              resetMutation.mutate({ clubId })
            }}
            disabled={resetMutation.isPending || !hasAnyOverride}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--t3)',
              border: '1px solid var(--card-border)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resetMutation.isPending ? 'Resetting…' : 'Reset to defaults'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {configQuery.isLoading || distributionQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div
              key={i}
              className="h-16 rounded-xl animate-pulse"
              style={{ background: 'var(--subtle)' }}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
          }}
        >
          {/* Column headers */}
          <div
            className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wide"
            style={{
              color: 'var(--t4)',
              background: 'var(--subtle)',
              borderBottom: '1px solid var(--card-border)',
            }}
          >
            <div className="col-span-4">Tier</div>
            <div className="col-span-2 text-right">Sessions (30d)</div>
            <div className="col-span-3">Cadence</div>
            <div className="col-span-2">Success metric</div>
            <div className="col-span-1 text-right">Active</div>
          </div>

          {/* 7 tier rows */}
          {ALL_TIER_KEYS.map((key, i) => (
            <TierRow
              key={key}
              tierKey={key}
              override={overridesByKey.get(key)}
              sessionCount={distribution[key] ?? 0}
              isLast={i === ALL_TIER_KEYS.length - 1}
              onToggle={next => handleToggle(key, next)}
              isPending={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Step 20 placeholder for Custom Rules */}
      <div
        className="rounded-xl p-4 flex items-center justify-between gap-3"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        <div>
          <p
            className="text-sm"
            style={{ color: 'var(--heading)', fontWeight: 600 }}
          >
            Custom rules
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
            Add club-specific overrides for sessions the regex layer misses —
            UI lands in the next commit (Step 20). Backend is live: see
            <code className="mx-1">intelligence.addClassifierRule</code> /
            <code className="mx-1">removeClassifierRule</code>.
          </p>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-md"
          style={{
            background: 'rgba(139,92,246,0.10)',
            color: '#A78BFA',
            border: '1px solid rgba(139,92,246,0.20)',
            fontWeight: 600,
          }}
        >
          {customRuleCount} rule{customRuleCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function TierRow({
  tierKey,
  override,
  sessionCount,
  isLast,
  onToggle,
  isPending,
}: {
  tierKey: TierKey
  override?: OverrideRow
  sessionCount: number
  isLast: boolean
  onToggle: (next: boolean) => void
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = PROGRAMMING_TIER_META[tierKey]
  // Default "active" = true when no override is set (matches preset intent).
  const isActive = override?.isActive ?? true
  const cadenceLabel = override?.cadence
    ? formatCadence(override.cadence)
    : `default · ${meta.cadence}`
  const metricLabel = override?.successMetric
    ? formatMetric(override.successMetric)
    : 'default'

  return (
    <div
      className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-[12px]"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--card-border)',
        opacity: isActive ? 1 : 0.6,
      }}
    >
      {/* Tier label */}
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: meta.color }}
        />
        <div className="min-w-0">
          <p
            className="truncate"
            style={{ color: 'var(--heading)', fontWeight: 600 }}
          >
            {meta.shortLabel}
          </p>
          <p
            className="text-[10px] truncate"
            style={{ color: 'var(--t4)' }}
          >
            {meta.label}
          </p>
        </div>
      </div>

      {/* Session count */}
      <div
        className="col-span-2 text-right tabular-nums"
        style={{
          color: sessionCount > 0 ? 'var(--heading)' : 'var(--t4)',
          fontWeight: sessionCount > 0 ? 600 : 500,
        }}
      >
        {sessionCount}
      </div>

      {/* Cadence */}
      <div
        className="col-span-3 truncate text-[11px]"
        style={{
          color: override?.cadence ? 'var(--t2)' : 'var(--t4)',
          fontStyle: override?.cadence ? 'normal' : 'italic',
        }}
        title={cadenceLabel}
      >
        {cadenceLabel}
      </div>

      {/* Success metric */}
      <div
        className="col-span-2 truncate text-[11px]"
        style={{
          color: override?.successMetric ? 'var(--t2)' : 'var(--t4)',
          fontStyle: override?.successMetric ? 'normal' : 'italic',
        }}
        title={metricLabel}
      >
        {metricLabel}
      </div>

      {/* Active toggle + (Step 20) edit expander */}
      <div className="col-span-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onToggle(!isActive)}
          disabled={isPending}
          aria-label={isActive ? 'Disable tier' : 'Enable tier'}
          className="w-8 h-5 rounded-full transition-colors flex items-center disabled:opacity-50"
          style={{
            background: isActive ? 'rgba(52,211,153,0.25)' : 'rgba(107,114,128,0.25)',
            border: `1px solid ${
              isActive ? 'rgba(52,211,153,0.45)' : 'rgba(107,114,128,0.45)'
            }`,
            padding: '0 2px',
            justifyContent: isActive ? 'flex-end' : 'flex-start',
          }}
        >
          <span
            className="w-3 h-3 rounded-full flex items-center justify-center"
            style={{
              background: isActive ? '#34D399' : '#9CA3AF',
              color: '#fff',
            }}
          >
            {isActive ? (
              <Check className="w-2.5 h-2.5" />
            ) : (
              <XIcon className="w-2.5 h-2.5" />
            )}
          </span>
        </button>

        {(override?.cadence || override?.successMetric) && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="p-0.5 rounded hover:bg-white/5"
            style={{ color: 'var(--t4)' }}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Expanded details — read-only summary until Step 20 edit lands. */}
      {expanded && (
        <div
          className="col-span-12 mt-2 text-[11px] rounded-lg p-2.5"
          style={{
            background: 'var(--subtle)',
            border: '1px solid var(--card-border)',
            color: 'var(--t3)',
          }}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <span style={{ color: 'var(--t4)' }}>Scope:</span>{' '}
              {typeof override?.scope === 'string'
                ? override.scope
                : override?.scope
                  ? 'custom locations'
                  : 'default'}
            </span>
            <span>
              <span style={{ color: 'var(--t4)' }}>Cadence:</span>{' '}
              {cadenceLabel}
            </span>
            <span>
              <span style={{ color: 'var(--t4)' }}>Metric:</span>{' '}
              {metricLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formatting helpers ────────────────────────────────────────────────

function formatCadence(c: any): string {
  if (!c || typeof c !== 'object') return 'default'
  switch (c.kind) {
    case 'daily':
      return `daily · ${c.minSessions} session${c.minSessions === 1 ? '' : 's'}/day`
    case 'weekly': {
      const dow =
        typeof c.dayOfWeek === 'number'
          ? ` (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.dayOfWeek] ?? '?'})`
          : ''
      return `weekly · ${c.minSessions}/wk${dow}`
    }
    case 'monthly':
      return `monthly · ${c.minSessions}/mo`
    case 'gap_max_days':
      return `max gap ${c.maxGapDays}d`
    default:
      return String(c.kind ?? 'custom')
  }
}

function formatMetric(m: any): string {
  if (!m || typeof m !== 'object') return 'default'
  switch (m.kind) {
    case 'session_count':
      return `≥${m.min} sessions`
    case 'avg_fill_rate':
      return `avg fill ≥${m.minPct}%`
    case 'peak_utilization':
      return `peak ≥${m.minPct}%`
    case 'avg_players_per_session':
      return `≥${m.min} players/session`
    case 'p101_to_member_conversion':
      return `P101 → member ≥${m.minPct}%`
    case 'continuity':
      return `gap ≤${m.maxGapDays}d`
    case 'revenue':
      return `revenue ≥$${m.minAmount}`
    case 'non_member_share':
      return `non-member ≥${m.minPct}%`
    case 'participant_count':
      return `≥${m.min} participants`
    case 'manual_y_n':
      return m.label || 'manual Y/N'
    default:
      return String(m.kind ?? 'custom')
  }
}
