'use client'

/**
 * Programming dynamics modal — Programming Health redesign Phase 1 (§1f-ii).
 *
 * Click a family card or a program row → this modal plots that unit's
 * dynamics over the page's current period (it inherits periodDays — the
 * period selector stays global, doc §5). Metric toggle: Participants /
 * Fill% / Sessions. Backed by intelligence.getProgrammingFamilySeries.
 *
 * Reuses the codebase conventions: motion/react overlay (Esc + backdrop +
 * scroll lock), recharts LineChart with the --chart-* / --tooltip-* theme
 * vars (same as MembersChartsDrawer).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { X, ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ProgramFamily } from '@/lib/ai/program-family-classifier'
import { trpc } from '@/lib/trpc'

export interface DrillTarget {
  family: ProgramFamily
  label: string
  emoji: string
  color: string
  /** Set when drilling into a single program inside the family. */
  programKey?: string | null
  programTitle?: string | null
}

interface Props {
  clubId: string
  periodDays: number
  /** Custom range (§1e) — when set, the modal inherits it from the page. */
  startDate?: string | null
  endDate?: string | null
  target: DrillTarget | null
  onClose: () => void
}

type Metric = 'participants' | 'fillRate' | 'sessions'

const METRIC_META: Record<Metric, { label: string }> = {
  participants: { label: 'Signups' },
  fillRate: { label: 'Fill %' },
  sessions: { label: 'Sessions' },
}

export function ProgrammingDynamicsModal({ clubId, periodDays, startDate, endDate, target, onClose }: Props) {
  const [metric, setMetric] = useState<Metric>('participants')
  // Sessions tab (operator 3.2): event instances behind the chart, each
  // expandable into its attendee detail.
  const [tab, setTab] = useState<'dynamics' | 'sessions'>('dynamics')

  // Reset to the chart when the modal re-opens on a different target.
  useEffect(() => {
    if (target) setTab('dynamics')
  }, [target])

  // Esc closes + lock body scroll while open.
  useEffect(() => {
    if (!target) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = original
    }
  }, [target, onClose])

  const query = trpc.intelligence.getProgrammingFamilySeries.useQuery(
    {
      clubId,
      periodDays,
      family: (target?.family ?? 'OPEN_PLAY') as ProgramFamily,
      programKey: target?.programKey ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    },
    { enabled: !!target && !!clubId, staleTime: 5 * 60_000 },
  )
  const data = query.data

  // Fill isn't meaningful for self-serve families — drop that toggle and
  // fall back to Participants if it was selected.
  const fillMeaningful = data?.fillRateMeaningful ?? true
  const effectiveMetric: Metric = metric === 'fillRate' && !fillMeaningful ? 'participants' : metric

  const title = target
    ? target.programTitle
      ? `${target.label} › ${target.programTitle}`
      : target.label
    : ''

  return (
    <AnimatePresence>
      {target && (
        <>
          <motion.div
            key="dyn-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="dyn-modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="pointer-events-auto rounded-2xl flex flex-col"
              style={{
                width: 'min(760px, 100vw)',
                maxHeight: '90vh',
                background: 'var(--bg, #0B0B14)',
                border: '1px solid var(--card-border)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid var(--card-border)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ fontSize: 18 }}>{target.emoji}</span>
                  <span className="text-sm font-bold truncate" style={{ color: 'var(--heading)' }} title={title}>
                    {title}
                  </span>
                  <span className="text-xs ml-1 shrink-0" style={{ color: 'var(--t4)' }}>
                    · dynamics
                  </span>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                  style={{ color: 'var(--t3)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Tab strip: Dynamics chart / Sessions list (operator 3.2) */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                    {([['dynamics', 'Dynamics'], ['sessions', 'Sessions']] as const).map(([key, label]) => {
                      const active = tab === key
                      return (
                        <button
                          key={key}
                          onClick={() => setTab(key)}
                          className="px-3 py-1.5 text-sm font-semibold transition-colors"
                          style={{
                            background: active ? target.color : 'var(--subtle)',
                            color: active ? '#fff' : 'var(--t2)',
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {tab === 'dynamics' && (
                    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                      {(Object.keys(METRIC_META) as Metric[])
                        .filter((m) => m !== 'fillRate' || fillMeaningful)
                        .map((m) => {
                          const active = m === effectiveMetric
                          return (
                            <button
                              key={m}
                              onClick={() => setMetric(m)}
                              className="px-3 py-1.5 text-sm font-semibold transition-colors"
                              style={{
                                background: active ? target.color : 'var(--subtle)',
                                color: active ? '#fff' : 'var(--t2)',
                              }}
                            >
                              {METRIC_META[m].label}
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>

                {tab === 'sessions' ? (
                  <SessionsTab
                    clubId={clubId}
                    periodDays={periodDays}
                    startDate={startDate}
                    endDate={endDate}
                    target={target}
                  />
                ) : (
                <>


                {/* Chart */}
                <div
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  {query.isLoading || !data ? (
                    <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--t3)' }}>
                      Loading…
                    </div>
                  ) : data.buckets.length === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--t4)' }}>
                      No sessions in this period.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={data.buckets} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          stroke="var(--chart-axis)"
                          tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                        />
                        <YAxis
                          stroke="var(--chart-axis)"
                          tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                          allowDecimals={false}
                          unit={effectiveMetric === 'fillRate' ? '%' : undefined}
                        />
                        <Tooltip content={<DynamicsTooltip metric={effectiveMetric} />} />
                        <Line
                          type="monotone"
                          dataKey={effectiveMetric}
                          name={METRIC_META[effectiveMetric].label}
                          stroke={target.color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: target.color }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Summary */}
                {data && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm" style={{ color: 'var(--t2)' }}>
                      <strong style={{ color: 'var(--heading)' }}>{data.totals.sessions}</strong> sessions ·{' '}
                      <strong style={{ color: 'var(--heading)' }}>{data.totals.participants}</strong> signups
                      {data.totals.fillRate != null && (
                        <>
                          {' '}· fill <strong style={{ color: 'var(--heading)' }}>{data.totals.fillRate}%</strong>
                        </>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--t4)' }}>
                      {data.granularity === 'day' ? 'daily' : data.granularity === 'week' ? 'weekly' : 'monthly'} ·{' '}
                      {startDate && endDate ? 'custom range' : periodDays >= 365 ? 'last 1y' : `last ${periodDays}d`}
                    </span>
                  </div>
                )}
                </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Sessions tab — event instances + per-event attendee drill (operator 3.2) ──
//
// List of the family's (or program's) session instances over the modal's
// period; each row expands into getSessionAudienceDetail: attendees with
// membership/skill mix, repeat attendance and returned-within-30d. Honesty:
// the column is "Cancelled" (no-shows aren't synced from CourtReserve) and
// revenue is price × confirmed (estimate, not transactions).
function SessionsTab({
  clubId,
  periodDays,
  startDate,
  endDate,
  target,
}: {
  clubId: string
  periodDays: number
  startDate?: string | null
  endDate?: string | null
  target: DrillTarget
}) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const query = trpc.intelligence.getProgramSessions.useQuery(
    {
      clubId,
      periodDays,
      family: target.family,
      programKey: target.programKey ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const sessions = query.data?.sessions ?? []

  if (query.isLoading) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--t3)' }}>
        Loading sessions…
      </div>
    )
  }
  if (sessions.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: 'var(--t4)' }}>
        No sessions in this period.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--t4)' }}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · revenue is estimated (price × confirmed); no-show data isn&apos;t synced, so cancellations are shown instead
        </span>
        <Link
          href={`/clubs/${clubId}/intelligence/sessions`}
          className="text-xs font-semibold inline-flex items-center gap-1 shrink-0"
          style={{ color: target.color }}
        >
          Open in Schedule <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Additional edits §1b: family-level audiences straight from the drill */}
      <FamilyAudienceButtons clubId={clubId} family={target.family} programKey={target.programKey ?? undefined} periodDays={periodDays} />
      {sessions.map((s) => {
        const isOpen = openSessionId === s.sessionId
        return (
          <div
            key={s.sessionId}
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <button
              onClick={() => setOpenSessionId(isOpen ? null : s.sessionId)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
            >
              {isOpen
                ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--t4)' }} />
                : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--t4)' }} />}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }}>
                  {s.title}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
                  {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  {s.startTime ? ` · ${s.startTime}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
                  {s.confirmed}{s.capacity > 0 ? `/${s.capacity}` : ''}
                  {s.fillPct != null && (
                    <span style={{ color: s.fillPct >= 80 ? '#10B981' : s.fillPct >= 50 ? '#F59E0B' : '#EF4444' }}>
                      {' '}· {s.fillPct}%
                    </span>
                  )}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
                  {s.cancelled > 0 ? `${s.cancelled} cancelled · ` : ''}est. ${s.estRevenue.toLocaleString('en-US')}
                </div>
              </div>
            </button>
            {isOpen && <SessionAudienceDetail clubId={clubId} sessionId={s.sessionId} color={target.color} />}
          </div>
        )
      })}
    </div>
  )
}

function SessionAudienceDetail({ clubId, sessionId, color }: { clubId: string; sessionId: string; color: string }) {
  const query = trpc.intelligence.getSessionAudienceDetail.useQuery(
    { clubId, sessionId },
    { staleTime: 5 * 60_000 },
  )
  const data = query.data

  if (query.isLoading || !data) {
    return (
      <div className="px-4 py-3 text-xs" style={{ color: 'var(--t3)', borderTop: '1px solid var(--card-border)' }}>
        Loading attendees…
      </div>
    )
  }

  const MixChips = ({ label, mix }: { label: string; mix: Array<{ value: string; count: number }> }) => (
    mix.length > 0 ? (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--t4)' }}>{label}</span>
        {mix.slice(0, 4).map((m) => (
          <span
            key={m.value}
            className="text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]"
            style={{ background: 'var(--subtle)', color: 'var(--t2)' }}
            title={m.value}
          >
            {m.value} · {m.count}
          </span>
        ))}
      </div>
    ) : null
  )

  return (
    <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid var(--card-border)' }}>
      {/* Mix summary */}
      <div className="space-y-1.5">
        <MixChips label="Membership" mix={data.summary.membershipMix} />
        <MixChips label="Skill" mix={data.summary.skillMix} />
        <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
          {data.summary.confirmed} confirmed · {data.summary.cancelled} cancelled ·{' '}
          {data.summary.returnedAfterPct != null
            ? <>returned within 30d: <strong style={{ color }}>{data.summary.returnedAfterPct}%</strong></>
            : 'return rate available 30 days after the event'}
        </div>
      </div>

      {/* Attendee table */}
      <div className="space-y-0.5">
        {data.attendees.map((a) => (
          <div key={`${a.userId}-${a.status}`} className="flex items-center gap-2 py-1 text-xs">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: a.status === 'CONFIRMED' ? '#10B981' : '#EF4444' }}
              title={a.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}
            />
            {/* Name → member profile (operator feedback v2.0 §5.1) */}
            {a.userId ? (
              <Link
                href={`/clubs/${clubId}/intelligence/members?member=${a.userId}`}
                className="truncate flex-1 min-w-0 hover:underline"
                style={{ color: 'var(--t2)' }}
                title="Open member profile"
              >
                {a.name || a.email || 'Unknown'}
              </Link>
            ) : (
              <span className="truncate flex-1 min-w-0" style={{ color: 'var(--t2)' }}>
                {a.name || a.email || 'Unknown'}
              </span>
            )}
            <span className="shrink-0 truncate max-w-[160px] text-[11px]" style={{ color: 'var(--t4)' }} title={a.membershipType ?? undefined}>
              {a.membershipType || '—'}
            </span>
            <span className="shrink-0 text-[11px] w-14 text-right" style={{ color: 'var(--t4)' }}>
              {a.skillLevel || (a.duprDoubles != null ? a.duprDoubles.toFixed(2) : '—')}
            </span>
            <span
              className="shrink-0 text-[11px] w-16 text-right"
              style={{ color: a.repeatCountInFamily > 0 ? 'var(--t3)' : 'var(--t4)' }}
              title="Visits to this program family in the 90 days before the event"
            >
              {a.repeatCountInFamily}× repeat
            </span>
            <span
              className="shrink-0 text-[11px] w-14 text-right"
              style={{ color: a.returnedAfter ? '#10B981' : 'var(--t4)' }}
              title="Booked anything within 30 days after this event"
            >
              {a.returnedAfter ? 'returned' : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Additional edits §1: insight → targeting without leaving the modal */}
      {data.attendees.some((a: any) => a.status === 'CONFIRMED') && (
        <SessionAudienceButton clubId={clubId} sessionId={sessionId} />
      )}
    </div>
  )
}

/** Family/program-level audience buttons (additional edits §1b):
 *  attendees of the window, or lapsed = played in the prior window but
 *  not since. Both create FROZEN cohorts via createCohortFromProgramContext. */
function FamilyAudienceButtons({ clubId, family, programKey, periodDays }: {
  clubId: string
  family: ProgramFamily
  programKey?: string
  periodDays: number
}) {
  const [created, setCreated] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<'attendees' | 'lapsed' | null>(null)
  const mutation = trpc.intelligence.createCohortFromProgramContext.useMutation()
  const run = (mode: 'attendees' | 'lapsed') => {
    setPendingMode(mode)
    mutation.mutate(
      { clubId, family, programKey, periodDays, mode },
      { onSuccess: () => setCreated(mode), onSettled: () => setPendingMode(null) },
    )
  }

  if (created) {
    return (
      <div className="flex items-center gap-2 text-xs py-1" style={{ color: '#10B981' }}>
        ✓ {created === 'attendees' ? 'Attendees' : 'Lapsed'} audience created —{' '}
        <Link href={`/clubs/${clubId}/intelligence/cohorts`} className="underline" style={{ color: '#10B981' }}>
          open Audiences
        </Link>
      </div>
    )
  }

  const baseStyle = { background: 'rgba(139,92,246,0.12)', color: '#A78BFA', fontWeight: 600 } as const
  return (
    <div className="flex items-center gap-2 flex-wrap py-1">
      <button
        onClick={() => run('attendees')}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
        style={baseStyle}
        title={`Everyone who attended in the last ${periodDays} days`}
      >
        {pendingMode === 'attendees' ? 'Creating…' : `+ Audience: attendees (${periodDays}d)`}
      </button>
      <button
        onClick={() => run('lapsed')}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 600 }}
        title={`Played ${periodDays}–${periodDays * 2} days ago but not since — win-back targets`}
      >
        {pendingMode === 'lapsed' ? 'Creating…' : '+ Audience: lapsed'}
      </button>
      {mutation.error && (
        <span className="text-[11px]" style={{ color: '#F59E0B' }}>{mutation.error.message}</span>
      )}
    </div>
  )
}

/** Create a frozen audience from this session's confirmed attendees —
 *  reuses the Schedule drill's createCohortFromSession (additional edits §1). */
function SessionAudienceButton({ clubId, sessionId }: { clubId: string; sessionId: string }) {
  const [created, setCreated] = useState(false)
  const mutation = trpc.intelligence.createCohortFromSession.useMutation({
    onSuccess: () => setCreated(true),
  })

  if (created) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: '#10B981' }}>
        ✓ Audience created —{' '}
        <Link href={`/clubs/${clubId}/intelligence/cohorts`} className="underline" style={{ color: '#10B981' }}>
          open Audiences
        </Link>
      </div>
    )
  }

  return (
    <button
      onClick={() => mutation.mutate({ clubId, sessionId })}
      disabled={mutation.isPending}
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', fontWeight: 600 }}
    >
      {mutation.isPending ? 'Creating…' : '+ Create audience from attendees'}
    </button>
  )
}

function DynamicsTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  const display = metric === 'fillRate' ? (v == null ? '—' : `${v}%`) : v
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: 'var(--tooltip-bg)',
        border: '1px solid var(--tooltip-border)',
        color: 'var(--tooltip-color)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="mb-1" style={{ fontWeight: 600 }}>{label}</div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: payload[0]?.color }} />
        <span style={{ color: 'var(--t3)' }}>{payload[0]?.name}:</span>
        <span style={{ fontWeight: 600 }}>{display}</span>
      </div>
    </div>
  )
}
