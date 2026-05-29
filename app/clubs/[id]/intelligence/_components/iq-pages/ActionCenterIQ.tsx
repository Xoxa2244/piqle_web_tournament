'use client'

/**
 * ActionCenterIQ — operational layer page.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.1-§4.4.
 *
 * Two tabs:
 *   1. Signal Feed — per-subject operational signals
 *      (member_health / membership_lifecycle / scorecard_execution /
 *      league_gap / vip_at_risk — sources land in Steps 16-18)
 *   2. Tier Constructor — per-club Tier preset + overrides + custom rules
 *      (Steps 19-20)
 *
 * Step 15 ships the skeleton: page + tabs + empty SignalFeed stub +
 * empty TierConstructor stub. Live data flows in subsequent steps.
 */

import { useState } from 'react'
import { Inbox, Layers, Sparkles } from 'lucide-react'
import { TodayFeed } from './action-center/TodayFeed'
import { SignalFeed } from './action-center/SignalFeed'
import { TierConstructor } from './action-center/TierConstructor'

interface Props {
  clubId: string
}

type Tab = 'today' | 'signals' | 'tiers'

export function ActionCenterIQ({ clubId }: Props) {
  const [tab, setTab] = useState<Tab>('today')

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1
            className="text-xl sm:text-2xl"
            style={{ color: 'var(--heading)', fontWeight: 700 }}
          >
            Action Center
          </h1>
          <p
            className="text-[12px] sm:text-sm mt-1"
            style={{ color: 'var(--t4)' }}
          >
            What to do today to raise engagement — plus operational signals and
            the Tier Constructor.
          </p>
        </div>

        <div
          className="inline-flex rounded-xl p-1"
          style={{
            background: 'var(--subtle)',
            border: '1px solid var(--card-border)',
          }}
        >
          <TabBtn active={tab === 'today'} onClick={() => setTab('today')} icon={Sparkles} label="Today" />
          <TabBtn active={tab === 'signals'} onClick={() => setTab('signals')} icon={Inbox} label="Signal feed" />
          <TabBtn active={tab === 'tiers'} onClick={() => setTab('tiers')} icon={Layers} label="Tier Constructor" />
        </div>
      </div>

      {tab === 'today' ? (
        <TodayFeed clubId={clubId} />
      ) : tab === 'signals' ? (
        <SignalFeed clubId={clubId} />
      ) : (
        <TierConstructor clubId={clubId} />
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Inbox
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors"
      style={{
        background: active ? 'var(--card-bg)' : 'transparent',
        color: active ? 'var(--heading)' : 'var(--t3)',
        fontWeight: active ? 600 : 500,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
