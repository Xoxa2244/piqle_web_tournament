'use client'

/**
 * Wizard Step 2 — Goal (P4-T3).
 *
 * 6 goal cards. Selected goal drives Step 3 default message template.
 */

import {
  RotateCcw, UserPlus, CalendarDays, ArrowUpRight, BellRing, Sparkles, Check,
} from 'lucide-react'
import type { CampaignGoal } from './types'

interface Step2Props {
  goal: CampaignGoal | null
  onChange: (next: CampaignGoal) => void
}

const GOALS: Array<{
  key: CampaignGoal
  label: string
  description: string
  icon: typeof RotateCcw
  channel: 'Email' | 'Email + SMS' | 'Custom'
  accent: string
}> = [
  {
    key: 'reactivate_dormant',
    label: 'Reactivate dormant players',
    description: 'Members who haven\'t played in 21+ days. Personal "we miss you" outreach.',
    icon: RotateCcw,
    channel: 'Email + SMS',
    accent: '#EF4444',
  },
  {
    key: 'onboard_new',
    label: 'Onboard new members',
    description: 'First-month engagement series. Lock in long-term LTV.',
    icon: UserPlus,
    channel: 'Email',
    accent: '#10B981',
  },
  {
    key: 'promote_event',
    label: 'Promote event / program',
    description: 'Drive sign-ups for an upcoming league, clinic, or social.',
    icon: CalendarDays,
    channel: 'Email + SMS',
    accent: '#06B6D4',
  },
  {
    key: 'upsell_tier',
    label: 'Upsell membership tier',
    description: 'Move package members up to monthly / unlimited.',
    icon: ArrowUpRight,
    channel: 'Email',
    accent: '#F59E0B',
  },
  {
    key: 'renewal_reminder',
    label: 'Renewal reminder',
    description: 'Package expires soon, nudge to renew.',
    icon: BellRing,
    channel: 'Email + SMS',
    accent: '#8B5CF6',
  },
  {
    key: 'custom',
    label: 'Custom',
    description: 'Write your own message from scratch.',
    icon: Sparkles,
    channel: 'Custom',
    accent: '#94A3B8',
  },
]

export function Step2Goal({ goal, onChange }: Step2Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--heading)' }}>What’s the goal?</h3>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>Pick a goal — Step 3 will draft a tailored message.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {GOALS.map((g) => {
          const Icon = g.icon
          const selected = goal === g.key
          return (
            <button
              key={g.key}
              onClick={() => onChange(g.key)}
              className="text-left rounded-xl p-4 transition-all hover:scale-[1.01] flex items-start gap-3"
              style={{
                background: selected ? `${g.accent}12` : 'var(--card-bg)',
                border: `1px solid ${selected ? g.accent : 'var(--card-border)'}`,
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${g.accent}1F` }}
              >
                <Icon className="w-4 h-4" style={{ color: g.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{g.label}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" style={{ color: g.accent }} />}
                </div>
                <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--t3)' }}>{g.description}</div>
                <div className="text-[10px] mt-2 inline-block px-1.5 py-0.5 rounded" style={{ background: `${g.accent}14`, color: g.accent, fontWeight: 600 }}>
                  {g.channel}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
