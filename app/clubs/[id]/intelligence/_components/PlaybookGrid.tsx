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
 * Visually positioned as a secondary "starter library" — sits below
 * AI-Recommended Campaigns (which carry data-driven $ impact and
 * deserve the spotlight). Compact cards, monochrome muted treatment,
 * dense 5-up grid on desktop so the whole library fits one row and
 * doesn't compete with the AI-Recommended block above.
 */

import { Gift, Calendar, RefreshCw, Sparkles, Send, BookOpen, ChevronRight, type LucideIcon } from 'lucide-react'
import { PLAYBOOKS, type Playbook } from './CampaignWizard/playbooks'

const ICON_COMPONENTS: Record<Playbook['icon'], LucideIcon> = {
  gift: Gift,
  mail: Send,
  refresh: RefreshCw,
  calendar: Calendar,
  'trending-up': Send,
  sparkles: Sparkles,
}

interface PlaybookGridProps {
  /** Called when admin clicks a playbook card. Parent opens the
   *  CampaignWizard with this playbook as the initial state. */
  onSelect: (playbook: Playbook) => void
}

export function PlaybookGrid({ onSelect }: PlaybookGridProps) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(148,163,184,0.14)' }}
        >
          <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--t3)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
            Template library
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--t4)' }}>
            Generic starting points — pick a shape, then choose the audience yourself. Use these when you already know what you want to send.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {PLAYBOOKS.map((p) => {
          const Icon = ICON_COMPONENTS[p.icon]
          const isSequence = p.schedule.format === 'sequence'
          const stepCount = p.message.steps?.length ?? 0
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="group flex flex-col gap-1.5 text-left rounded-lg p-2.5 transition-all hover:border-purple-400/40"
              style={{
                background: 'var(--subtle)',
                border: '1px solid var(--card-border)',
              }}
              title={p.description}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-3.5 h-3.5" style={{ color: 'var(--t3)' }} />
                <ChevronRight
                  className="w-3 h-3 opacity-0 transition-opacity group-hover:opacity-60"
                  style={{ color: 'var(--t3)' }}
                />
              </div>
              <h3
                className="text-[12px] font-semibold leading-tight"
                style={{ color: 'var(--heading)' }}
              >
                {p.title}
              </h3>
              <span
                className="text-[9px] uppercase tracking-wider"
                style={{
                  color: 'var(--t4)',
                  fontWeight: 600,
                }}
              >
                {isSequence ? `Sequence · ${stepCount}` : 'One-time'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
