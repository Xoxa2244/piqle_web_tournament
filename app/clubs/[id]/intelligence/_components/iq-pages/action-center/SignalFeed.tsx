'use client'

/**
 * SignalFeed — operational signal list for Action Center.
 *
 * Step 15 (foundation): renders the empty-state skeleton + filter
 * chips. Live signal generation lands in Steps 16-18 of
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.3 (5 sources: member_health,
 * membership_lifecycle, scorecard_execution, league_gap, vip_at_risk).
 *
 * Once the signal-generator + getOperationalSignals endpoint ship,
 * this component fetches and renders signals through SignalCard.
 */

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import {
  Activity,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crown,
  Filter,
  HeartPulse,
  Inbox,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import { SignalCard, type OperationalSignalRow } from './SignalCard'

// ─── Source grouping metadata ─────────────────────────────────────────────
//
// signals fan out across 5 sources. We render them as collapsible groups
// instead of a flat list — per-member groups (vip_at_risk, member_health,
// membership_lifecycle) can blow out to dozens of entries each, and an
// operator scanning the feed needs to see "47 VIPs at risk" before
// drilling into individuals. Programming-level groups (scorecard,
// league_gap) stay expanded by default because they have few items each
// and each needs a unique decision.

type SignalSource = OperationalSignalRow['source']

interface SourceMeta {
  label: string
  // Initially expanded? Per-member groups start collapsed; per-program
  // / per-league groups stay open.
  defaultExpanded: boolean
  // Order in the feed — programming gaps surface first (club-level
  // structural), leagues next, then per-member which are bulk-able.
  order: number
  Icon: typeof Activity
  tint: string
}

const SOURCE_META: Record<SignalSource, SourceMeta> = {
  scorecard_execution: {
    label: 'Programming gaps',
    defaultExpanded: true,
    order: 1,
    Icon: BarChart3,
    tint: '#A78BFA',
  },
  league_gap: {
    label: 'League gaps',
    defaultExpanded: true,
    order: 2,
    Icon: Trophy,
    tint: '#F97316',
  },
  vip_at_risk: {
    label: 'VIP at risk',
    defaultExpanded: false,
    order: 3,
    Icon: Crown,
    tint: '#FBBF24',
  },
  member_health: {
    label: 'Member health drops',
    defaultExpanded: false,
    order: 4,
    Icon: HeartPulse,
    tint: '#F87171',
  },
  membership_lifecycle: {
    label: 'Membership lifecycle',
    defaultExpanded: false,
    order: 5,
    Icon: Calendar,
    tint: '#60A5FA',
  },
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'nudge'
type SourceFilter =
  | 'all'
  | 'member_health'
  | 'membership_lifecycle'
  | 'scorecard_execution'
  | 'league_gap'
  | 'vip_at_risk'

interface Props {
  clubId: string
}

export function SignalFeed({ clubId }: Props) {
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')

  const signalsQuery = trpc.intelligence.getOperationalSignals.useQuery(
    {
      clubId,
      severity: severity === 'all' ? undefined : severity,
      source: source === 'all' ? undefined : source,
    },
    { enabled: !!clubId },
  )

  const resolveMutation = trpc.intelligence.resolveSignal.useMutation()
  const refreshMutation = trpc.intelligence.refreshOperationalSignals.useMutation({
    onSuccess: () => signalsQuery.refetch(),
  })

  const signals = (signalsQuery.data?.signals ?? []) as OperationalSignalRow[]

  // Group signals by source. Within each group preserve the server's
  // severity-then-recency ordering (critical first, then warning, then
  // nudge — `getOperationalSignals` already returns rows that way).
  const groups = useMemo(() => {
    const map = new Map<SignalSource, OperationalSignalRow[]>()
    for (const sig of signals) {
      const bucket = map.get(sig.source) ?? []
      bucket.push(sig)
      map.set(sig.source, bucket)
    }
    // Stable order from SOURCE_META.order so the feed reads top-down
    // the same way every time.
    return Array.from(map.entries()).sort(
      ([a], [b]) => SOURCE_META[a].order - SOURCE_META[b].order,
    )
  }, [signals])

  // Collapsed/expanded state per group. Default comes from SOURCE_META
  // (per-member groups collapsed). Operator can override per session.
  const [collapsed, setCollapsed] = useState<Set<SignalSource>>(
    () =>
      new Set(
        (Object.entries(SOURCE_META) as [SignalSource, SourceMeta][])
          .filter(([, m]) => !m.defaultExpanded)
          .map(([s]) => s),
      ),
  )
  const toggleGroup = (source: SignalSource) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div
        className="flex flex-wrap items-center gap-2 p-3 rounded-xl"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        <div className="flex items-center gap-1.5" style={{ color: 'var(--t4)' }}>
          <Filter className="w-3.5 h-3.5" />
          <span className="text-[11px] uppercase tracking-wide">Filter</span>
        </div>

        <FilterChip
          active={severity === 'all'}
          onClick={() => setSeverity('all')}
          label="All severities"
        />
        <FilterChip
          active={severity === 'critical'}
          onClick={() => setSeverity('critical')}
          label="Critical"
          tint="#F87171"
        />
        <FilterChip
          active={severity === 'warning'}
          onClick={() => setSeverity('warning')}
          label="Warning"
          tint="#FBBF24"
        />
        <FilterChip
          active={severity === 'nudge'}
          onClick={() => setSeverity('nudge')}
          label="Nudge"
          tint="#60A5FA"
        />

        <div className="w-px h-4" style={{ background: 'var(--divider)' }} />

        <select
          value={source}
          onChange={e => setSource(e.target.value as SourceFilter)}
          className="text-[11px] rounded-md px-2 py-1 border"
          style={{
            background: 'var(--card-bg)',
            color: 'var(--t2)',
            borderColor: 'var(--card-border)',
          }}
        >
          <option value="all">All sources</option>
          <option value="member_health">Member health</option>
          <option value="membership_lifecycle">Membership lifecycle</option>
          <option value="scorecard_execution">Scorecard execution</option>
          <option value="league_gap">League gap</option>
          <option value="vip_at_risk">VIP at risk</option>
        </select>

        {/* Spacer pushes Refresh to the far right */}
        <div className="flex-1" />

        <button
          type="button"
          onClick={() => refreshMutation.mutate({ clubId })}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
          style={{
            background: 'rgba(139,92,246,0.10)',
            color: '#A78BFA',
            border: '1px solid rgba(139,92,246,0.20)',
            fontWeight: 600,
          }}
        >
          <RefreshCw
            className={`w-3 h-3 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
          />
          {refreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Body */}
      {signalsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-24 rounded-xl animate-pulse"
              style={{ background: 'var(--subtle)' }}
            />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <div
          className="rounded-xl p-10 flex flex-col items-center justify-center text-center"
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
          }}
        >
          <Inbox className="w-10 h-10 mb-3 opacity-30" style={{ color: 'var(--t3)' }} />
          <p className="text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
            Inbox zero — no active signals.
          </p>
          <p className="text-[11px] mt-1 max-w-md" style={{ color: 'var(--t4)' }}>
            Once Member Health, Membership Lifecycle, Scorecard Execution,
            League gap, and VIP at-risk sources are wired (Steps 16-18 of
            the Action Center spec), per-subject signals will appear here
            with one-click actions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([source, sourceSignals]) => {
            const meta = SOURCE_META[source]
            const isCollapsed = collapsed.has(source)
            return (
              <div
                key={source}
                className="rounded-xl overflow-hidden"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(source)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-90"
                  style={{
                    background: 'transparent',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--card-border)',
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t4)' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t4)' }} />
                  )}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${meta.tint}1f`,
                      color: meta.tint,
                    }}
                  >
                    <meta.Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--t1)' }}>
                      {meta.label}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--t4)' }}>
                      {sourceSignals.length} {sourceSignals.length === 1 ? 'item' : 'items'}
                    </div>
                  </div>
                  {/* Severity dots — quick visual breakdown */}
                  <div className="flex items-center gap-1.5">
                    {(['critical', 'warning', 'nudge'] as const).map(sev => {
                      const count = sourceSignals.filter(s => s.severity === sev).length
                      if (count === 0) return null
                      const dotColor =
                        sev === 'critical' ? '#F87171' : sev === 'warning' ? '#FBBF24' : '#60A5FA'
                      return (
                        <span
                          key={sev}
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: `${dotColor}1f`,
                            color: dotColor,
                          }}
                          title={`${count} ${sev}`}
                        >
                          {count}
                        </span>
                      )
                    })}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="space-y-2 p-3">
                    {sourceSignals.map(sig => (
                      <SignalCard
                        key={sig.id}
                        signal={sig}
                        clubId={clubId}
                        onResolve={async (reason, snoozeUntil) => {
                          await resolveMutation.mutateAsync({
                            clubId,
                            signalId: sig.id,
                            reason,
                            snoozeUntil: snoozeUntil?.toISOString(),
                          })
                          signalsQuery.refetch()
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  tint,
}: {
  active: boolean
  onClick: () => void
  label: string
  tint?: string
}) {
  const bg = active
    ? tint
      ? `${tint}26`
      : 'rgba(139,92,246,0.15)'
    : 'transparent'
  const fg = active ? (tint ?? '#A78BFA') : 'var(--t3)'
  const border = active
    ? tint
      ? `${tint}33`
      : 'rgba(139,92,246,0.30)'
    : 'var(--card-border)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-md transition-colors"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  )
}
