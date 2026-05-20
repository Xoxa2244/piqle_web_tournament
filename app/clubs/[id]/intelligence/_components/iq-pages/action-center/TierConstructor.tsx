'use client'

/**
 * TierConstructor — per-club tier override + custom-rule UI.
 *
 * Spec: DASHBOARD_AND_ACTION_CENTER_SPEC.md §4.4 + Appendix D.
 *
 * MVP scope (Steps 19-20 of §7.5):
 *   - Display the 7 ProgrammingTier rows with current classification
 *     count per period
 *   - Per-tier toggle: active / inactive
 *   - Per-tier cadence + successMetric overrides
 *   - "Apply Solomon Preset" button → drops Appendix D defaults
 *   - "Add custom rule" button → ClassifierRule form
 *
 * Step 15 (this commit) ships the skeleton: tab pane + empty-state
 * pointing at the upcoming work. Live UI lands in 19-20 alongside the
 * tier_config endpoints.
 */

import { Layers, Settings2 } from 'lucide-react'

interface Props {
  clubId: string
}

export function TierConstructor({ clubId: _clubId }: Props) {
  return (
    <div
      className="rounded-xl p-10 flex flex-col items-center justify-center text-center"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
      }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
        style={{ background: 'rgba(139,92,246,0.10)', color: '#A78BFA' }}
      >
        <Layers className="w-5 h-5" />
      </div>
      <p className="text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
        Tier Constructor — coming in Steps 19-20
      </p>
      <p
        className="text-[12px] mt-2 max-w-md leading-relaxed"
        style={{ color: 'var(--t4)' }}
      >
        Per-club overrides on top of the existing 7-tier classifier (T1 Core
        → T7 Youth). One-click "Apply Solomon Preset" drops the IPC defaults
        from Appendix D; custom <code>ClassifierRule</code> entries close
        local gaps for sessions the regex layer misses.
      </p>
      <div
        className="mt-4 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md"
        style={{
          background: 'rgba(139,92,246,0.10)',
          color: '#A78BFA',
          border: '1px solid rgba(139,92,246,0.20)',
          fontWeight: 600,
        }}
      >
        <Settings2 className="w-3 h-3" />
        Wiring: tier_config CRUD + classifyProgrammingTier extension
      </div>
    </div>
  )
}
