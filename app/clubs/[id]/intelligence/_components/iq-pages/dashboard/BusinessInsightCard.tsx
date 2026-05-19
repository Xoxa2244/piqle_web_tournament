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
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Clock,
  X,
  ChevronDown,
  ExternalLink,
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
      | { type: 'cr_api_direct'; label: string; endpoint: string; payload: Record<string, unknown>; requiresConfirmation: boolean }
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

export function BusinessInsightCard({ insight, clubId, onResolve }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  const meta = CATEGORY_META[insight.category]
  const Icon = meta.icon

  const handlePrimary = () => {
    const p = insight.action.primary
    // Step 11 will wire up real draft-id deeplinks. For Step 4 we route to
    // the right destination page without prefill — enough to verify the
    // card shape and click flow end-to-end.
    switch (p.type) {
      case 'create_cohort':
        router.push(`/clubs/${clubId}/intelligence/cohorts?fromInsight=${insight.id}`)
        return
      case 'create_campaign':
        router.push(`/clubs/${clubId}/intelligence/campaigns?fromInsight=${insight.id}`)
        return
      case 'programming':
        router.push(`/clubs/${clubId}/intelligence/programming?fromInsight=${insight.id}`)
        return
      case 'cr_api_direct':
        // Direct-write modal lands in Action Center (Step 15+). For now
        // surface a stub so the operator gets feedback that the button
        // is wired but the confirm modal is still to come.
        // eslint-disable-next-line no-alert
        alert(
          `Direct CR write: ${p.label}\n\nThis action will be available once the Action Center confirmation modal ships (Step 15+).`,
        )
        return
      case 'advice':
        // Advice-only insights don't have an actionable destination —
        // the button label is informational. Treat click as "got it"
        // and mark as manually resolved.
        onResolve('manual')
        return
    }
  }

  const isAdvice = insight.action.primary.type === 'advice'

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
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                  style={{ color: 'var(--t3)' }}
                  onClick={() => {
                    setMenuOpen(false)
                    // Source page wiring lands with Step 11 deeplinks — for
                    // pilot, route to the same place the primary button does.
                    handlePrimary()
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in source
                </button>
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

        {/* Action row */}
        <div className="flex items-center gap-2 pl-9">
          {!isAdvice && (
            <button
              type="button"
              onClick={handlePrimary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{
                background: meta.tintBg,
                color: meta.tint,
                border: `1px solid ${meta.tint}40`,
              }}
            >
              {insight.action.primary.label}
            </button>
          )}
          {isAdvice && (
            <button
              type="button"
              onClick={handlePrimary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--t3)',
                border: '1px solid var(--card-border)',
              }}
            >
              Got it
            </button>
          )}

          {insight.action.secondary && insight.action.secondary.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSecondaryOpen(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--t3)',
                  border: '1px solid var(--card-border)',
                }}
              >
                More <ChevronDown className="w-3 h-3" />
              </button>
              {secondaryOpen && (
                <div
                  className="absolute left-0 top-full mt-1 rounded-lg py-1 z-10 min-w-[200px]"
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  {insight.action.secondary.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className="block w-full px-3 py-1.5 text-[12px] text-left hover:bg-white/5"
                      style={{ color: 'var(--t3)' }}
                      onClick={() => {
                        setSecondaryOpen(false)
                        // Same router behaviour as primary, distinct insight context.
                        switch (a.type) {
                          case 'create_cohort':
                            router.push(`/clubs/${clubId}/intelligence/cohorts?fromInsight=${insight.id}`)
                            return
                          case 'create_campaign':
                            router.push(`/clubs/${clubId}/intelligence/campaigns?fromInsight=${insight.id}`)
                            return
                          case 'programming':
                            router.push(`/clubs/${clubId}/intelligence/programming?fromInsight=${insight.id}`)
                            return
                          case 'cr_api_direct':
                            // eslint-disable-next-line no-alert
                            alert(`Direct CR write: ${a.label} — Action Center modal ships in Step 15+.`)
                            return
                          case 'advice':
                            onResolve('manual')
                            return
                        }
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
