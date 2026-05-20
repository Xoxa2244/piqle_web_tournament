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

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Filter, Inbox } from 'lucide-react'
import { SignalCard, type OperationalSignalRow } from './SignalCard'

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

  const signals = (signalsQuery.data?.signals ?? []) as OperationalSignalRow[]

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
        <div className="space-y-2">
          {signals.map(sig => (
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
