'use client'

/**
 * BusinessInsightCard — canon-driven Dashboard insight tile.
 *
 * Renders one `BusinessInsight` row (from `intelligence.getBusinessInsights`)
 * with the canon-shaped action button and ⋯ menu for snooze/dismiss/source.
 *
 * Card responsibilities (Spec §3.6):
 *   - Show analysis + insight + key metric pills
 *   - Primary action button (or "advice only" mode if action.primary.type === 'advice')
 *   - Secondary actions surface inside a dropdown when present
 *   - Snooze / Dismiss / Open-in-source via the ⋯ menu
 *
 * Out of scope for this step: the deeplink draft-id pattern (Step 11
 * wires it up). For now the primary button shows the label but routes
 * to the relevant target page without prefill — enough to validate the
 * card shape on real data.
 *
 * sol2-lean: the draft-creating CTAs (create_cohort / create_campaign /
 * programming) deep-link into gated or removed sections, so the action
 * row renders advice-style only — every insight resolves via "Got it".
 * Restore the primary/secondary CTA wiring from branch Sol2 when those
 * sections ship.
 */

import { useState } from 'react'
import {
  Sparkles,
  Clock,
  X,
  MoreHorizontal,
  AlertTriangle,
  TrendingUp,
  Target,
  Shield,
} from 'lucide-react'

// ── Canon types (subset shared with backend — see business-insights-engine.ts).
// Duplicated here intentionally: the client bundle should not pull the
// backend module (Prisma types, etc.). Keep in sync by hand.

export interface BusinessInsightRow {
  id: string
  dedupeKey: string
  category: 'retention' | 'growth' | 'optimization' | 'risk'
  severity: 'high' | 'medium' | 'low'
  analysis: string
  metrics: Record<string, number>
  insight: string
  action: {
    primary:
      | { type: 'create_cohort'; label: string; cohortRules: unknown[]; draftId?: string }
      | { type: 'create_campaign'; label: string; templateKey: string; cohortRef?: string; draftId?: string }
      | { type: 'programming'; label: string; params: Record<string, unknown>; draftId?: string }
      | { type: 'advice'; label: string }
    secondary?: Array<BusinessInsightRow['action']['primary']>
  }
  status: 'active' | 'snoozed' | 'resolved' | 'dismissed'
  createdAt: string
  lastSeenAt: string
  resolvedAt: string | null
  snoozeUntil: string | null
}

interface Props {
  insight: BusinessInsightRow
  clubId: string
  onResolve: (reason: 'manual' | 'dismissed' | 'snoozed', snoozeUntil?: Date) => void
}

// ── Visual mapping by category. Lucide icon + tint colours.
//    Reuse the existing Dashboard purple/blue/emerald palette so the new
//    cards visually nest with the legacy AI Insights chips for the pilot.

const CATEGORY_META: Record<
  BusinessInsightRow['category'],
  { icon: typeof Sparkles; tint: string; tintBg: string }
> = {
  retention: { icon: Shield, tint: '#A78BFA', tintBg: 'rgba(139,92,246,0.08)' },
  growth: { icon: TrendingUp, tint: '#34D399', tintBg: 'rgba(16,185,129,0.08)' },
  optimization: { icon: Target, tint: '#60A5FA', tintBg: 'rgba(59,130,246,0.08)' },
  risk: { icon: AlertTriangle, tint: '#F87171', tintBg: 'rgba(239,68,68,0.08)' },
}

const SEVERITY_DOT: Record<BusinessInsightRow['severity'], string> = {
  high: '#F87171',
  medium: '#FBBF24',
  low: '#60A5FA',
}

export function BusinessInsightCard({ insight, onResolve }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  const meta = CATEGORY_META[insight.category]
  const Icon = meta.icon

  return (
    <div
      className="rounded-2xl p-4 mb-3 relative"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* severity bar — left edge tint */}
      <div
        className="absolute top-3 left-0 bottom-3 w-[3px] rounded-r"
        style={{ background: SEVERITY_DOT[insight.severity] }}
      />

      <div className="pl-2">
        {/* Header: icon + category + severity */}
        <div className="flex items-start gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: meta.tintBg }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: meta.tint }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase tracking-wide font-semibold"
                style={{ color: meta.tint }}
              >
                {insight.category}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: SEVERITY_DOT[insight.severity] }}
                title={insight.severity}
              />
              {insight.status === 'snoozed' && (
                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--t4)' }}>
                  <Clock className="w-3 h-3" />
                  snoozed
                </span>
              )}
            </div>
            <p
              className="text-sm leading-snug mt-0.5"
              style={{ color: 'var(--heading)', fontWeight: 600 }}
            >
              {insight.analysis}
            </p>
          </div>

          {/* ⋯ menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="p-1 rounded hover:bg-white/5"
              style={{ color: 'var(--t4)' }}
              aria-label="Actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg py-1 z-10 min-w-[160px]"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    // 7 days from now — Phase 2 will let admin pick custom interval.
                    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    onResolve('snoozed', until)
                  }}
                >
                  <Clock className="w-3.5 h-3.5" /> Snooze 7 days
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    onResolve('dismissed')
                  }}
                >
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
                {/* sol2-lean: "Open in source" removed — it deep-linked into
                    gated/removed sections. Restore from branch Sol2. */}
              </div>
            )}
          </div>
        </div>

        {/* Insight body (the non-obvious conclusion). */}
        <p
          className="text-[12px] leading-relaxed mb-3 pl-9"
          style={{ color: 'var(--t3)' }}
        >
          {insight.insight}
        </p>

        {/* Metric pills */}
        {Object.keys(insight.metrics).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pl-9">
            {Object.entries(insight.metrics).map(([k, v]) => (
              <span
                key={k}
                className="text-[10px] px-2 py-0.5 rounded-md"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--t4)',
                }}
              >
                {k}: <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{v}</span>
              </span>
            ))}
          </div>
        )}

        {/* Action row — sol2-lean: advice-style resolve only (see header). */}
        <div className="flex items-center gap-2 pl-9">
          <button
            type="button"
            onClick={() => onResolve('manual')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--t3)',
              border: '1px solid var(--card-border)',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
