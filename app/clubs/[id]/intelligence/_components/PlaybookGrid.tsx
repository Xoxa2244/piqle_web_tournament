'use client'

/**
 * PlaybookGrid — pre-filled campaign templates on the Campaigns page.
 *
 * Solves the blank-canvas problem: club managers aren't marketers and
 * the empty Wizard intimidates them. This grid offers ~5 ready-made
 * scenarios (Welcome / Win-back / Renewal / Birthday / Event invite).
 * Click a card → CampaignWizard opens with format / goal / schedule /
 * message all pre-populated. Admin only picks the audience and
 * tweaks copy if they want.
 *
 * Card styling intentionally distinct from AI-Recommended Campaigns
 * (which suggest specific real audiences). Playbooks are templates,
 * not recommendations.
 */

import { Gift, Mail, RefreshCw, Calendar, TrendingUp, Sparkles, ChevronRight } from 'lucide-react'
import { PLAYBOOKS, type Playbook } from './CampaignWizard/playbooks'

const ICON_COMPONENTS: Record<Playbook['icon'], typeof Gift> = {
  gift: Gift,
  mail: Mail,
  refresh: RefreshCw,
  calendar: Calendar,
  'trending-up': TrendingUp,
  sparkles: Sparkles,
}

const ICON_COLORS: Record<Playbook['icon'], string> = {
  gift: '#F472B6',
  mail: '#A78BFA',
  refresh: '#67E8F9',
  calendar: '#FBBF24',
  'trending-up': '#34D399',
  sparkles: '#A78BFA',
}

interface PlaybookGridProps {
  /** Called when admin clicks a playbook card. Parent opens the
   *  CampaignWizard with this playbook as the initial state. */
  onSelect: (playbook: Playbook) => void
}

export function PlaybookGrid({ onSelect }: PlaybookGridProps) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
            Start from a playbook
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
            Ready-made scenarios — click one and the wizard opens with format, goal, and message pre-filled. You only pick the audience.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PLAYBOOKS.map((p) => {
          const Icon = ICON_COMPONENTS[p.icon]
          const iconColor = ICON_COLORS[p.icon]
          const isSequence = p.schedule.format === 'sequence'
          const stepCount = (p.message.steps?.length ?? 0)
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="text-left rounded-xl p-3 transition-all hover:scale-[1.01] hover:border-purple-400/40"
              style={{
                background: 'var(--subtle)',
                border: '1px solid var(--card-border)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${iconColor}22` }}
                >
                  <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h3 className="text-sm font-bold leading-tight" style={{ color: 'var(--heading)' }}>{p.title}</h3>
                  </div>
                  <p className="text-[11px] leading-relaxed mb-2" style={{ color: 'var(--t3)' }}>
                    {p.description}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                      style={{
                        background: isSequence ? 'rgba(139,92,246,0.16)' : 'rgba(148,163,184,0.16)',
                        color: isSequence ? '#A78BFA' : 'var(--t3)',
                        fontWeight: 700,
                      }}
                    >
                      {isSequence ? `Sequence · ${stepCount} steps` : 'One-time'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
                      {p.audienceHint}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: 'var(--t4)' }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
