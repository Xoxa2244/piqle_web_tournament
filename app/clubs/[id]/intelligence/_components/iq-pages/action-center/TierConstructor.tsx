'use client'

/**
 * TierConstructor — per-club tier override + distribution table.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.4 + Appendix D.
 *
 * Live UI:
 *   - 7-row distribution table (Step 19b)
 *     · per-tier active toggle (writes through `updateTierOverride`)
 *     · cadence + success-metric editor modal (Step 20)
 *   - "Apply Solomon Preset" / "Reset to defaults" buttons (Step 19b)
 *   - Custom Rules section (Step 20)
 *     · list rules with summary + delete
 *     · "Add custom rule" modal — name_pattern / CR reservation type id /
 *       CR event category id → targetTier, priority
 */

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Check,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
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

interface ClassifierRuleRow {
  id: string
  match:
    | { kind: 'name_pattern'; regex: string }
    | { kind: 'cr_reservation_type_id'; id: number }
    | { kind: 'cr_event_category_id'; id: number }
  targetTier: TierKey
  priority: number
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
    onSuccess: () => {
      configQuery.refetch()
      distributionQuery.refetch()
    },
  })
  const resetMutation = trpc.intelligence.resetTierConfig.useMutation({
    onSuccess: () => {
      configQuery.refetch()
      distributionQuery.refetch()
    },
  })
  const addRuleMutation = trpc.intelligence.addClassifierRule.useMutation({
    onSuccess: () => {
      configQuery.refetch()
      distributionQuery.refetch()
      suggestionsQuery.refetch()
    },
  })
  const removeRuleMutation = trpc.intelligence.removeClassifierRule.useMutation({
    onSuccess: () => {
      configQuery.refetch()
      distributionQuery.refetch()
      suggestionsQuery.refetch()
    },
  })
  // Suggestion engine: frequent session titles currently falling to T1
  // Core that an operator might want to re-tier (Private Lessons that
  // CR labels as "Reservation", recurring branded events, etc).
  const suggestionsQuery = trpc.intelligence.getFrequentUntaggedTitles.useQuery(
    { clubId, lookbackDays: 30, minFrequency: 3, limit: 50 },
    { enabled: !!clubId },
  )

  const [editingTier, setEditingTier] = useState<TierKey | null>(null)
  const [showAddRule, setShowAddRule] = useState(false)

  const overrides = useMemo<OverrideRow[]>(
    () => (configQuery.data?.config.overrides ?? []) as OverrideRow[],
    [configQuery.data],
  )
  const customRules = useMemo<ClassifierRuleRow[]>(
    () =>
      (configQuery.data?.config.customRules ?? []) as ClassifierRuleRow[],
    [configQuery.data],
  )
  const overridesByKey = useMemo(() => {
    const map = new Map<TierKey, OverrideRow>()
    for (const o of overrides) map.set(o.tierKey, o)
    return map
  }, [overrides])

  const distribution = distributionQuery.data?.countsByTier ?? {}
  const totalSessions = distributionQuery.data?.totalSessions ?? 0
  const customRuleCount = customRules.length
  const hasAnyOverride = overrides.length > 0 || customRuleCount > 0

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
              onEdit={() => setEditingTier(key)}
              isPending={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Custom Rules section */}
      <div
        className="rounded-xl"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        <div className="p-4 flex items-start justify-between gap-3">
          <div>
            <p
              className="text-sm"
              style={{ color: 'var(--heading)', fontWeight: 600 }}
            >
              Custom classifier rules
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
              Map sessions by name pattern or CR reservation/event id when
              the regex layer misses them. Highest-priority match wins.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddRule(true)}
            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'rgba(139,92,246,0.12)',
              color: '#A78BFA',
              border: '1px solid rgba(139,92,246,0.25)',
              fontWeight: 600,
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add custom rule
          </button>
        </div>

        {customRules.length > 0 && (
          <div style={{ borderTop: '1px solid var(--card-border)' }}>
            {customRules.map((r, i) => (
              <ClassifierRuleEntry
                key={r.id}
                rule={r}
                isLast={i === customRules.length - 1}
                onDelete={() =>
                  removeRuleMutation.mutate({ clubId, ruleId: r.id })
                }
                isDeleting={
                  removeRuleMutation.isPending &&
                  removeRuleMutation.variables?.ruleId === r.id
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggestion engine — frequent untagged titles */}
      {suggestionsQuery.data && suggestionsQuery.data.candidates.length > 0 && (
        <UntaggedTitlesSection
          candidates={suggestionsQuery.data.candidates}
          lookbackDays={suggestionsQuery.data.lookbackDays}
          onAddRule={(title, targetTier) => {
            addRuleMutation.mutate({
              clubId,
              rule: {
                match: { kind: 'name_pattern', regex: escapeRegex(title) },
                targetTier,
                priority: 100,
              },
            })
          }}
          isPending={addRuleMutation.isPending}
          pendingTitle={
            addRuleMutation.isPending
              ? extractPendingTitle(addRuleMutation.variables?.rule)
              : null
          }
        />
      )}

      {/* Add custom rule modal */}
      {showAddRule && (
        <AddRuleModal
          onClose={() => setShowAddRule(false)}
          onSubmit={payload => {
            addRuleMutation.mutate(
              { clubId, rule: payload },
              { onSuccess: () => setShowAddRule(false) },
            )
          }}
          isPending={addRuleMutation.isPending}
        />
      )}

      {/* Per-tier cadence + metric editor modal */}
      {editingTier && (
        <TierEditModal
          tierKey={editingTier}
          current={overridesByKey.get(editingTier)}
          onClose={() => setEditingTier(null)}
          onSubmit={override => {
            updateMutation.mutate(
              { clubId, tierKey: editingTier, override },
              { onSuccess: () => setEditingTier(null) },
            )
          }}
          isPending={updateMutation.isPending}
        />
      )}
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
  onEdit,
  isPending,
}: {
  tierKey: TierKey
  override?: OverrideRow
  sessionCount: number
  isLast: boolean
  onToggle: (next: boolean) => void
  onEdit: () => void
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

        <button
          type="button"
          onClick={onEdit}
          className="p-1 rounded hover:bg-white/5"
          style={{ color: 'var(--t4)' }}
          aria-label="Edit cadence + metric"
          title="Edit cadence + metric"
        >
          <Pencil className="w-3 h-3" />
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

// ─── Classifier rule list entry ────────────────────────────────────────

function ClassifierRuleEntry({
  rule,
  isLast,
  onDelete,
  isDeleting,
}: {
  rule: ClassifierRuleRow
  isLast: boolean
  onDelete: () => void
  isDeleting: boolean
}) {
  const matchLabel =
    rule.match.kind === 'name_pattern'
      ? `name matches /${rule.match.regex}/i`
      : rule.match.kind === 'cr_reservation_type_id'
        ? `CR reservation_type_id = ${rule.match.id}`
        : `CR event_category_id = ${rule.match.id}`
  const meta = PROGRAMMING_TIER_META[rule.targetTier]
  return (
    <div
      className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-[12px]"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--card-border)',
        opacity: isDeleting ? 0.5 : 1,
      }}
    >
      <div className="col-span-7 truncate" title={matchLabel}>
        <span style={{ color: 'var(--t4)' }}>match · </span>
        <span style={{ color: 'var(--t2)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
          {matchLabel}
        </span>
      </div>
      <div className="col-span-3 flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: meta.color }}
        />
        <span style={{ color: 'var(--t2)' }}>{meta.shortLabel}</span>
      </div>
      <div
        className="col-span-1 text-[11px] tabular-nums"
        style={{ color: 'var(--t4)' }}
      >
        p{rule.priority}
      </div>
      <div className="col-span-1 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Delete this classifier rule?')) onDelete()
          }}
          disabled={isDeleting}
          className="p-1 rounded hover:bg-white/5 disabled:opacity-50"
          style={{ color: 'var(--t4)' }}
          aria-label="Delete rule"
          title="Delete rule"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Add custom rule modal ─────────────────────────────────────────────

interface AddRulePayload {
  match:
    | { kind: 'name_pattern'; regex: string }
    | { kind: 'cr_reservation_type_id'; id: number }
    | { kind: 'cr_event_category_id'; id: number }
  targetTier: TierKey
  priority: number
}

function AddRuleModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void
  onSubmit: (payload: AddRulePayload) => void
  isPending: boolean
}) {
  const [matchKind, setMatchKind] = useState<
    'name_pattern' | 'cr_reservation_type_id' | 'cr_event_category_id'
  >('name_pattern')
  const [regex, setRegex] = useState('')
  const [crId, setCrId] = useState('')
  const [targetTier, setTargetTier] = useState<TierKey>('T1_CORE')
  const [priority, setPriority] = useState(100)
  const [regexError, setRegexError] = useState<string | null>(null)

  const handleSave = () => {
    setRegexError(null)
    let match: AddRulePayload['match']
    if (matchKind === 'name_pattern') {
      if (!regex.trim()) {
        setRegexError('Pattern is required')
        return
      }
      try {
        // Validate regex compiles
        new RegExp(regex, 'i')
      } catch (err: any) {
        setRegexError(`Invalid regex: ${err.message ?? 'unknown error'}`)
        return
      }
      match = { kind: 'name_pattern', regex: regex.trim() }
    } else {
      const id = Number(crId)
      if (!Number.isFinite(id) || id <= 0) {
        setRegexError('Numeric id required')
        return
      }
      match = { kind: matchKind, id }
    }
    onSubmit({ match, targetTier, priority })
  }

  return (
    <ModalShell title="Add custom classifier rule" onClose={onClose}>
      <div className="space-y-3 text-[12px]">
        {/* Match kind */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Match by
          </label>
          <select
            value={matchKind}
            onChange={e => setMatchKind(e.target.value as typeof matchKind)}
            className="w-full mt-1 rounded-md px-2 py-1.5 border"
            style={{
              background: 'var(--card-bg)',
              color: 'var(--t2)',
              borderColor: 'var(--card-border)',
            }}
          >
            <option value="name_pattern">Session title regex</option>
            <option value="cr_reservation_type_id">
              CR reservation type id
            </option>
            <option value="cr_event_category_id">CR event category id</option>
          </select>
        </div>

        {/* Match value */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            {matchKind === 'name_pattern' ? 'Regex (case-insensitive)' : 'Id'}
          </label>
          {matchKind === 'name_pattern' ? (
            <input
              type="text"
              value={regex}
              onChange={e => setRegex(e.target.value)}
              placeholder="^drill\\s+night$  or  cosmic|glow"
              className="w-full mt-1 rounded-md px-2 py-1.5 border font-mono text-[11px]"
              style={{
                background: 'var(--card-bg)',
                color: 'var(--t2)',
                borderColor: regexError ? '#F87171' : 'var(--card-border)',
              }}
            />
          ) : (
            <input
              type="number"
              value={crId}
              onChange={e => setCrId(e.target.value)}
              placeholder="e.g. 12345"
              className="w-full mt-1 rounded-md px-2 py-1.5 border tabular-nums"
              style={{
                background: 'var(--card-bg)',
                color: 'var(--t2)',
                borderColor: regexError ? '#F87171' : 'var(--card-border)',
              }}
            />
          )}
          {regexError && (
            <p className="text-[10px] mt-1" style={{ color: '#F87171' }}>
              {regexError}
            </p>
          )}
        </div>

        {/* Target tier */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Target tier
          </label>
          <select
            value={targetTier}
            onChange={e => setTargetTier(e.target.value as TierKey)}
            className="w-full mt-1 rounded-md px-2 py-1.5 border"
            style={{
              background: 'var(--card-bg)',
              color: 'var(--t2)',
              borderColor: 'var(--card-border)',
            }}
          >
            {ALL_TIER_KEYS.map(k => (
              <option key={k} value={k}>
                {PROGRAMMING_TIER_META[k].shortLabel} —{' '}
                {PROGRAMMING_TIER_META[k].label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Priority (0-1000; higher fires first)
          </label>
          <input
            type="number"
            min={0}
            max={1000}
            value={priority}
            onChange={e => setPriority(Number(e.target.value))}
            className="w-full mt-1 rounded-md px-2 py-1.5 border tabular-nums"
            style={{
              background: 'var(--card-bg)',
              color: 'var(--t2)',
              borderColor: 'var(--card-border)',
            }}
          />
        </div>
      </div>

      <ModalFooter
        onCancel={onClose}
        onConfirm={handleSave}
        confirmLabel={isPending ? 'Saving…' : 'Add rule'}
        confirmDisabled={isPending}
      />
    </ModalShell>
  )
}

// ─── Tier cadence + metric editor modal ────────────────────────────────

type CadenceKind = 'daily' | 'weekly' | 'monthly' | 'gap_max_days'
type MetricKind =
  | 'session_count'
  | 'avg_fill_rate'
  | 'peak_utilization'
  | 'avg_players_per_session'
  | 'p101_to_member_conversion'
  | 'continuity'
  | 'revenue'
  | 'non_member_share'
  | 'participant_count'
  | 'manual_y_n'

function TierEditModal({
  tierKey,
  current,
  onClose,
  onSubmit,
  isPending,
}: {
  tierKey: TierKey
  current?: OverrideRow
  onClose: () => void
  onSubmit: (override: Record<string, any>) => void
  isPending: boolean
}) {
  const meta = PROGRAMMING_TIER_META[tierKey]
  const [isActive, setIsActive] = useState<boolean>(current?.isActive ?? true)
  const [scope, setScope] = useState<'global' | 'per_location'>(
    typeof current?.scope === 'string' && current.scope === 'per_location'
      ? 'per_location'
      : 'global',
  )
  const [cadenceKind, setCadenceKind] = useState<CadenceKind | 'unset'>(
    (current?.cadence?.kind as CadenceKind | undefined) ?? 'unset',
  )
  const [cadenceN, setCadenceN] = useState<number>(
    current?.cadence?.minSessions ??
      current?.cadence?.maxGapDays ??
      1,
  )
  const [metricKind, setMetricKind] = useState<MetricKind | 'unset'>(
    (current?.successMetric?.kind as MetricKind | undefined) ?? 'unset',
  )
  const [metricN, setMetricN] = useState<number>(
    current?.successMetric?.min ??
      current?.successMetric?.minPct ??
      current?.successMetric?.maxGapDays ??
      current?.successMetric?.minAmount ??
      0,
  )
  const [metricLabel, setMetricLabel] = useState<string>(
    current?.successMetric?.label ?? '',
  )

  const buildCadence = (): any => {
    if (cadenceKind === 'unset') return undefined
    if (cadenceKind === 'gap_max_days') {
      return { kind: 'gap_max_days', maxGapDays: cadenceN }
    }
    return { kind: cadenceKind, minSessions: cadenceN }
  }
  const buildMetric = (): any => {
    if (metricKind === 'unset') return undefined
    switch (metricKind) {
      case 'session_count':
      case 'avg_players_per_session':
      case 'participant_count':
        return { kind: metricKind, min: metricN }
      case 'avg_fill_rate':
      case 'peak_utilization':
      case 'p101_to_member_conversion':
      case 'non_member_share':
        return { kind: metricKind, minPct: metricN }
      case 'continuity':
        return { kind: metricKind, maxGapDays: metricN }
      case 'revenue':
        return { kind: metricKind, minAmount: metricN }
      case 'manual_y_n':
        return { kind: metricKind, label: metricLabel || 'manual Y/N' }
    }
  }

  const handleSave = () => {
    const override: Record<string, any> = {
      tierKey,
      isActive,
      scope,
    }
    const cadence = buildCadence()
    if (cadence) override.cadence = cadence
    const metric = buildMetric()
    if (metric) override.successMetric = metric
    onSubmit(override)
  }

  return (
    <ModalShell
      title={
        <span className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: meta.color }}
          />
          Edit {meta.shortLabel}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3 text-[12px]">
        {/* Active toggle */}
        <label className="flex items-center justify-between gap-3">
          <span style={{ color: 'var(--t3)' }}>Tier is active</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            style={{ accentColor: '#A78BFA' }}
          />
        </label>

        {/* Scope */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Scope
          </label>
          <select
            value={scope}
            onChange={e =>
              setScope(e.target.value as 'global' | 'per_location')
            }
            className="w-full mt-1 rounded-md px-2 py-1.5 border"
            style={{
              background: 'var(--card-bg)',
              color: 'var(--t2)',
              borderColor: 'var(--card-border)',
            }}
          >
            <option value="global">global (one rule for the whole club)</option>
            <option value="per_location">
              per location (each location independently)
            </option>
          </select>
        </div>

        {/* Cadence */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Cadence
          </label>
          <div className="flex gap-2 mt-1">
            <select
              value={cadenceKind}
              onChange={e =>
                setCadenceKind(e.target.value as CadenceKind | 'unset')
              }
              className="flex-1 rounded-md px-2 py-1.5 border"
              style={{
                background: 'var(--card-bg)',
                color: 'var(--t2)',
                borderColor: 'var(--card-border)',
              }}
            >
              <option value="unset">— use default</option>
              <option value="daily">daily · N sessions/day</option>
              <option value="weekly">weekly · N sessions/wk</option>
              <option value="monthly">monthly · N sessions/mo</option>
              <option value="gap_max_days">max gap · N days</option>
            </select>
            {cadenceKind !== 'unset' && (
              <input
                type="number"
                min={1}
                value={cadenceN}
                onChange={e => setCadenceN(Number(e.target.value))}
                className="w-20 rounded-md px-2 py-1.5 border tabular-nums"
                style={{
                  background: 'var(--card-bg)',
                  color: 'var(--t2)',
                  borderColor: 'var(--card-border)',
                }}
              />
            )}
          </div>
        </div>

        {/* Success metric */}
        <div>
          <label
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--t4)' }}
          >
            Success metric
          </label>
          <div className="flex gap-2 mt-1">
            <select
              value={metricKind}
              onChange={e =>
                setMetricKind(e.target.value as MetricKind | 'unset')
              }
              className="flex-1 rounded-md px-2 py-1.5 border"
              style={{
                background: 'var(--card-bg)',
                color: 'var(--t2)',
                borderColor: 'var(--card-border)',
              }}
            >
              <option value="unset">— use default</option>
              <option value="session_count">≥ N sessions</option>
              <option value="avg_fill_rate">avg fill ≥ N%</option>
              <option value="peak_utilization">peak utilization ≥ N%</option>
              <option value="avg_players_per_session">
                ≥ N players/session
              </option>
              <option value="p101_to_member_conversion">
                P101 → member ≥ N%
              </option>
              <option value="continuity">gap ≤ N days</option>
              <option value="revenue">revenue ≥ $N</option>
              <option value="non_member_share">non-member ≥ N%</option>
              <option value="participant_count">≥ N participants</option>
              <option value="manual_y_n">manual Y/N (custom label)</option>
            </select>
            {metricKind === 'manual_y_n' ? (
              <input
                type="text"
                value={metricLabel}
                onChange={e => setMetricLabel(e.target.value)}
                placeholder="label"
                className="w-32 rounded-md px-2 py-1.5 border text-[11px]"
                style={{
                  background: 'var(--card-bg)',
                  color: 'var(--t2)',
                  borderColor: 'var(--card-border)',
                }}
              />
            ) : metricKind !== 'unset' ? (
              <input
                type="number"
                min={0}
                value={metricN}
                onChange={e => setMetricN(Number(e.target.value))}
                className="w-20 rounded-md px-2 py-1.5 border tabular-nums"
                style={{
                  background: 'var(--card-bg)',
                  color: 'var(--t2)',
                  borderColor: 'var(--card-border)',
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <ModalFooter
        onCancel={onClose}
        onConfirm={handleSave}
        confirmLabel={isPending ? 'Saving…' : 'Save'}
        confirmDisabled={isPending}
      />
    </ModalShell>
  )
}

// ─── Modal shell shared by Add Rule + Tier Edit ────────────────────────

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: React.ReactNode
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-md p-5"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3
            className="text-sm"
            style={{ color: 'var(--heading)', fontWeight: 600 }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5"
            style={{ color: 'var(--t4)' }}
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmDisabled: boolean
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-[12px] px-3 py-1.5 rounded-lg"
        style={{
          background: 'transparent',
          color: 'var(--t3)',
          border: '1px solid var(--card-border)',
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="text-[12px] px-3 py-1.5 rounded-lg disabled:opacity-50"
        style={{
          background: 'rgba(139,92,246,0.18)',
          color: '#A78BFA',
          border: '1px solid rgba(139,92,246,0.32)',
          fontWeight: 600,
        }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Suggestion engine — surfaces frequent session titles that currently
// fall to T1 Core after the club's saved rules + default classifier.
// One-click "Add rule" pre-fills a name_pattern rule with the title
// verbatim (regex-escaped) so the operator's click maps that exact
// session series to the chosen tier.
// ─────────────────────────────────────────────────────────────────────────

interface Candidate {
  title: string
  format: string | null
  sessions: number
  currentTier: string
}

function UntaggedTitlesSection({
  candidates,
  lookbackDays,
  onAddRule,
  isPending,
  pendingTitle,
}: {
  candidates: readonly Candidate[]
  lookbackDays: number
  onAddRule: (title: string, tier: TierKey) => void
  isPending: boolean
  pendingTitle: string | null
}) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
      }}
    >
      <div className="p-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(234,179,8,0.15)' }}
        >
          <Sparkles className="w-5 h-5" style={{ color: '#EAB308' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--t1)' }}>
            Frequent untagged titles
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            {candidates.length} title{candidates.length === 1 ? '' : 's'} currently bucketed as T1 Core over the last {lookbackDays} days.
            Pick the correct tier to add a custom rule.
          </div>
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {candidates.map((c) => (
          <UntaggedTitleRow
            key={`${c.title}__${c.format ?? 'null'}`}
            candidate={c}
            onAddRule={onAddRule}
            isPending={isPending && pendingTitle === c.title}
          />
        ))}
      </div>
    </div>
  )
}

// Tier choices an operator can pick for an untagged title. T1 is
// excluded because the title is *already* falling to T1 — picking T1
// here would just be a no-op rule.
const SUGGEST_TARGET_TIERS: readonly TierKey[] = [
  'T2_LEAGUE',
  'T3_SIGNATURE',
  'T4_SOCIAL',
  'T5_TOURNAMENT',
  'T6_PREMIUM',
  'T7_YOUTH',
]

function UntaggedTitleRow({
  candidate,
  onAddRule,
  isPending,
}: {
  candidate: Candidate
  onAddRule: (title: string, tier: TierKey) => void
  isPending: boolean
}) {
  const [selectedTier, setSelectedTier] = useState<TierKey | ''>('')

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] truncate" style={{ color: 'var(--t1)' }} title={candidate.title}>
          {candidate.title}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--t4)' }}>
          {candidate.sessions} session{candidate.sessions === 1 ? '' : 's'}
          {candidate.format ? ` · ${candidate.format}` : ''}
        </div>
      </div>

      <select
        value={selectedTier}
        onChange={(e) => setSelectedTier(e.target.value as TierKey | '')}
        className="text-[12px] px-2 py-1.5 rounded-md"
        style={{
          background: 'var(--card-bg)',
          color: 'var(--t1)',
          border: '1px solid var(--card-border)',
        }}
      >
        <option value="">— pick tier —</option>
        {SUGGEST_TARGET_TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {PROGRAMMING_TIER_META[tier].shortLabel}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!selectedTier || isPending}
        onClick={() => selectedTier && onAddRule(candidate.title, selectedTier)}
        className="text-[12px] px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        style={{
          background: 'rgba(139,92,246,0.18)',
          color: '#A78BFA',
          border: '1px solid rgba(139,92,246,0.32)',
          fontWeight: 600,
        }}
      >
        {isPending ? '...' : (<><Plus className="w-3.5 h-3.5" /> Add rule</>)}
      </button>
    </div>
  )
}

/**
 * Escape regex special characters so a verbatim title is matched as
 * a literal string when used as a `name_pattern` rule. Without this,
 * a title like "Private Lesson for 1 - Court #9 (IPC East)" would be
 * an invalid pattern (unescaped parens / +) or silently match too many
 * other titles.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pull the title out of the in-flight addRule mutation variables so we
 * can show a spinner on the right row only. Best-effort — returns null
 * when the variable shape isn't what we expect.
 */
function extractPendingTitle(
  rule: { match?: { kind?: string; regex?: string } } | undefined,
): string | null {
  if (!rule || rule.match?.kind !== 'name_pattern' || typeof rule.match.regex !== 'string') {
    return null
  }
  // Reverse the regex-escape so the displayed title matches the source
  // candidate row. Only handles the escapes we add ourselves.
  return rule.match.regex.replace(/\\([.*+?^${}()|[\]\\])/g, '$1')
}
