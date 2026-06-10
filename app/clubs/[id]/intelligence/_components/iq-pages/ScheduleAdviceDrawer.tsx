'use client'

/**
 * ScheduleAdviceDrawer — right slide-in panel behind the Schedule page's
 * "Advise" button (sol2-lean).
 *
 * Shows deterministic week-level recommendations from
 * intelligence.getScheduleAdvice (lib/ai/schedule-advice.ts):
 *   REMOVE — structurally dead sessions (slot never fills historically)
 *   FILL   — weak signups in a historically strong slot (promote, don't cut)
 *   ADD    — proven slots with nothing scheduled this week
 *
 * Advisory only: CourtReserve is read-only for IQSport, so the drawer is an
 * action plan the operator applies in CR, plus a "Discuss in Advisor"
 * handoff that opens the AI Advisor with the plan prefilled (?prompt= is
 * already supported by AdvisorIQ).
 */

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import {
  X, Sparkles, Trash2, Megaphone, CalendarPlus, Brain, ShieldCheck, Eye,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { useScheduleAdvice } from '../../_hooks/use-intelligence'

const FORMAT_LABELS: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}
const fmt = (f: string) => FORMAT_LABELS[f] ?? f
const skillLabel = (s: string | null) =>
  s && s !== 'ALL_LEVELS' ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : 'All levels'

const dayShort = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

type Advice = NonNullable<ReturnType<typeof useScheduleAdvice>['data']>

function buildAdvisorPrompt(advice: Advice): string {
  // The weak list is uncapped in the drawer, but the ?prompt= URL must stay
  // small — take the top 5 per bucket (already sorted most-actionable
  // first) and note the remainder.
  const cap = <T,>(items: T[], render: (t: T) => string) => ({
    text: items.slice(0, 5).map(render).join('; '),
    more: Math.max(0, items.length - 5),
  })
  const removes = cap(advice.weak.filter((w) => w.verdict === 'remove'),
    (w) => `${dayShort(w.date)} ${w.startTime} ${w.title} (${w.occupancy}% filled, slot avg ${w.peerAvgOccupancy}%)`)
  const fills = cap(advice.weak.filter((w) => w.verdict === 'fill'),
    (w) => `${dayShort(w.date)} ${w.startTime} ${w.title} (${w.occupancy}% now, slot avg ${w.peerAvgOccupancy}%)`)
  const adds = cap(advice.create,
    (c) => `${c.dayLabel} ${c.startTime} ${fmt(c.format)} ${skillLabel(c.skillLevel)} (historically ${c.histOccupancy}% / ~${c.avgPlayers} players)`)
  const withMore = (label: string, c: { text: string; more: number }) =>
    c.text ? `${label}: ${c.text}${c.more > 0 ? ` (+${c.more} more in the Advise panel)` : ''}.` : ''
  const parts = [
    `Review my schedule for the week of ${advice.weekStart}.`,
    withMore('Candidates to remove', removes),
    withMore('Underfilled but historically strong (worth promoting)', fills),
    withMore('Suggested new sessions', adds),
    'Help me decide what to change and draft any member messages needed.',
  ].filter(Boolean)
  return parts.join(' ')
}

const VERDICT_META = {
  remove: { icon: Trash2, color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Consider removing' },
  fill: { icon: Megaphone, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Worth filling' },
  review: { icon: Eye, color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', label: 'Watch' },
} as const

export function ScheduleAdviceDrawer({
  open,
  onClose,
  clubId,
  weekStart,
}: {
  open: boolean
  onClose: () => void
  clubId: string
  weekStart: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isDark } = useTheme()
  const { data: advice, isLoading, error } = useScheduleAdvice(clubId, weekStart, open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    // House drawer pattern (MembersFilterDrawer): lock body scroll while open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const openInAdvisor = () => {
    if (!advice) return
    const demoParam = searchParams?.get('demo') === 'true' ? '&demo=true' : ''
    router.push(`/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(buildAdvisorPrompt(advice))}${demoParam}`)
  }

  const hasContent = !!advice && (advice.weak.length > 0 || advice.create.length > 0)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="advice-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.aside
            key="advice-drawer"
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed inset-y-0 right-0 z-[70] w-[420px] max-w-[92vw] flex flex-col"
            // Solid theme-aware background (same pair as ScheduleIQ's date
            // picker) — var(--card-bg) is 60%-alpha glass and let the grid
            // bleed through the panel.
            style={{ background: isDark ? '#111225' : '#FFFFFF', borderLeft: '1px solid var(--card-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-16 shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Schedule Advice</div>
                  <div className="text-[11px]" style={{ color: 'var(--t4)' }}>Week of {dayShort(weekStart)}</div>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoading && !advice ? (
                <div className="animate-pulse space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-xl" style={{ background: 'var(--subtle)' }} />
                  ))}
                </div>
              ) : error ? (
                <p className="text-xs text-center py-10" style={{ color: 'var(--t4)' }}>
                  Couldn&apos;t analyze this week. It will retry automatically.
                </p>
              ) : !hasContent ? (
                <div className="flex flex-col items-center text-center py-12">
                  <ShieldCheck className="w-9 h-9 mb-3" style={{ color: '#10B981' }} />
                  <p className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>This week looks healthy</p>
                  <p className="text-xs mt-1 max-w-[260px]" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                    No underfilled upcoming sessions and no proven open slots —
                    nothing to change{advice ? ` across ${advice.analyzedUpcoming} upcoming sessions` : ''}.
                  </p>
                </div>
              ) : advice ? (
                <>
                  {/* Weak sessions */}
                  {advice.weak.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>
                        Underfilled sessions · {advice.weak.length}
                      </h4>
                      {advice.weak.map((w) => {
                        const meta = VERDICT_META[w.verdict]
                        const Icon = meta.icon
                        return (
                          <div key={w.sessionId} className="rounded-xl p-3" style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                              <span className="text-[10px] uppercase tracking-wide" style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                              <span className="ml-auto text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>{w.occupancy}% filled</span>
                            </div>
                            <div className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                              {w.title} · {dayShort(w.date)} {w.startTime}
                            </div>
                            <p className="text-xs mt-1" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>{w.reason}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Create suggestions */}
                  {advice.create.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>
                        Add instead · {advice.create.length}
                      </h4>
                      {advice.create.map((c, i) => (
                        <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                          <div className="flex items-center gap-2 mb-1">
                            <CalendarPlus className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: '#10B981', fontWeight: 700 }}>Create</span>
                            <span className="ml-auto text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>~{c.histOccupancy}% expected</span>
                          </div>
                          <div className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                            {fmt(c.format)} ({skillLabel(c.skillLevel)}) · {dayShort(c.date)} {c.startTime}
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>{c.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 space-y-2 shrink-0" style={{ borderTop: '1px solid var(--divider)' }}>
              {hasContent && (
                <button
                  onClick={openInAdvisor}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
                >
                  <Brain className="w-4 h-4" /> Discuss in Advisor
                </button>
              )}
              <p className="text-[10px] text-center" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                IQSport reads your schedule and never edits it — apply changes
                in CourtReserve.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
