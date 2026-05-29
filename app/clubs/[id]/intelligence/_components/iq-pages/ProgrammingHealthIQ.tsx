'use client'

/**
 * Programming Health — family view (redesign Phase 1, §1d).
 *
 * Replaces the abstract T1–T7 tier scorecard (WeeklyScorecardIQ) with
 * human-readable program *families* derived from what the club actually
 * runs. Part 1 of the redesign (§3 "две части страницы"): the numbers.
 *
 *   [period selector 7d/30d/90d/1y]
 *   [Total sessions] [Participants] [Avg fill]
 *   family rows — emoji · label · trend · fill · sessions · participants
 *     ▶/▼ chevron expands inline → normalized programs inside the family,
 *        each with its own trend (the "don't lose the detail" requirement)
 *
 * Backed by intelligence.getProgrammingFamilyHealth, which runs the pure
 * aggregateProgramFamilies() over a 2·periodDays window.
 *
 * Deferred to later substeps:
 *   - 1e custom date range (presets only here)
 *   - 1f click-a-program → line-chart modal (chevron expand is the 1d gesture)
 *   - 1g Part 2 insights ("что делать") below the numbers
 *   - 1h removing the old tier scorecard
 */

import { useState } from 'react'
import {
  FileBarChart, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

const PERIOD_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
] as const

type Trend = { deltaPct: number; direction: 'up' | 'down' | 'flat' } | null

export function ProgrammingHealthIQ({ clubId }: Props) {
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const query = trpc.intelligence.getProgrammingFamilyHealth.useQuery(
    { clubId, periodDays },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const data = query.data

  const toggle = (family: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(family)) next.delete(family)
      else next.add(family)
      return next
    })

  const periodLabel = PERIOD_PRESETS.find((p) => p.days === periodDays)?.label ?? `${periodDays}d`

  return (
    <div className="px-6 py-6 space-y-6" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-purple-600"
            style={{ boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}
          >
            <FileBarChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--heading)' }}>Programming Health</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              What your club runs — by program family, with {periodLabel} trends
            </p>
          </div>
        </div>
        {/* Period selector (presets; custom range lands in 1e) */}
        <div
          className="inline-flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--card-border)' }}
        >
          {PERIOD_PRESETS.map((p) => {
            const active = p.days === periodDays
            return (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                className="px-3 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  background: active ? 'var(--accent, #A855F7)' : 'var(--subtle)',
                  color: active ? '#fff' : 'var(--t2)',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {query.isLoading || !data ? (
        <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading Programming Health…</div>
      ) : data.families.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <p style={{ color: 'var(--t2)', fontWeight: 600 }}>No programming in the last {periodLabel}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>
            Try a longer period, or check that sessions are syncing for this club.
          </p>
        </div>
      ) : (
        <>
          {/* Part 1 — rollup KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Total sessions" value={String(data.rollup.sessions)} />
            <KpiTile label="Participants" value={String(data.rollup.participants)} />
            <KpiTile
              label="Avg fill (organized)"
              value={data.rollup.fillRate != null ? `${data.rollup.fillRate}%` : '—'}
              accent="green"
            />
          </div>

          {!data.hasComparison && (
            <p className="text-xs" style={{ color: 'var(--t4)' }}>
              No prior-period data yet — trends appear once there&apos;s a full previous {periodLabel} to compare against.
            </p>
          )}

          {/* Family list */}
          <div className="space-y-3">
            {data.families.map((fam) => {
              const isOpen = expanded.has(fam.family)
              return (
                <div
                  key={fam.family}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    borderLeft: `4px solid ${fam.color}`,
                  }}
                >
                  <button
                    onClick={() => toggle(fam.family)}
                    className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--subtle)]"
                  >
                    <span style={{ fontSize: 18 }}>{fam.emoji}</span>
                    <span className="flex-1 font-semibold" style={{ color: 'var(--heading)', fontSize: 15 }}>
                      {fam.label}
                    </span>
                    <MetricCluster
                      trend={fam.trend}
                      fill={fam.fillRate}
                      fillMeaningful={fam.fillRateMeaningful}
                      sessions={fam.sessions}
                      participants={fam.participants}
                    />
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--t3)' }} />
                    ) : (
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--t3)' }} />
                    )}
                  </button>

                  {isOpen && (
                    <div
                      className="px-4 pb-3 pt-1 space-y-1"
                      style={{ borderTop: '1px solid var(--card-border)' }}
                    >
                      {fam.programs.length === 0 ? (
                        <p className="text-xs py-2" style={{ color: 'var(--t4)' }}>
                          No individual programs to break out.
                        </p>
                      ) : (
                        fam.programs.map((p, i) => (
                          <div
                            key={`${fam.family}-${i}`}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg"
                            style={{ background: 'var(--subtle)' }}
                          >
                            <span className="flex-1 text-sm truncate" style={{ color: 'var(--t2)' }} title={p.title}>
                              {p.title}
                            </span>
                            <MetricCluster
                              trend={p.trend}
                              fill={p.fillRate}
                              fillMeaningful={fam.fillRateMeaningful}
                              sessions={p.sessions}
                              participants={p.participants}
                              small
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── presentational helpers ──────────────────────────────────────────────

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green' }) {
  const color = accent === 'green' ? '#10B981' : 'var(--heading)'
  const bg = accent === 'green' ? 'rgba(16,185,129,0.06)' : 'var(--card-bg)'
  return (
    <div className="rounded-xl p-3" style={{ background: bg, border: '1px solid var(--card-border)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

/** The right-aligned metric block shared by family rows and program rows. */
function MetricCluster({
  trend,
  fill,
  fillMeaningful,
  sessions,
  participants,
  small,
}: {
  trend: Trend
  fill: number | null
  fillMeaningful: boolean
  sessions: number
  participants: number
  small?: boolean
}) {
  const fs = small ? 12 : 13
  return (
    <div className="flex items-center gap-3 shrink-0" style={{ fontSize: fs }}>
      <span className="w-16 text-right tabular-nums">
        <TrendPill trend={trend} />
      </span>
      <span className="w-16 text-right" style={{ color: 'var(--t3)' }}>
        <FillValue value={fill} meaningful={fillMeaningful} />
      </span>
      <span className="w-20 text-right tabular-nums" style={{ color: 'var(--t2)' }}>
        {sessions} sess
      </span>
      <span className="w-20 text-right tabular-nums" style={{ color: 'var(--t2)' }}>
        {participants} ppl
      </span>
    </div>
  )
}

function TrendPill({ trend }: { trend: Trend }) {
  if (!trend) {
    return (
      <span style={{ color: 'var(--t4)' }} title="Not enough history to compare">
        —
      </span>
    )
  }
  const { direction, deltaPct } = trend
  const color = direction === 'up' ? '#10B981' : direction === 'down' ? '#EF4444' : 'var(--t3)'
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
  const sign = deltaPct > 0 ? '+' : ''
  return (
    <span className="inline-flex items-center gap-0.5 justify-end" style={{ color, fontWeight: 600 }}>
      <Icon className="w-3.5 h-3.5" />
      {sign}
      {deltaPct}%
    </span>
  )
}

function FillValue({ value, meaningful }: { value: number | null; meaningful: boolean }) {
  // Self-serve families (court bookings / private / equipment) are booked to
  // capacity by definition — fill isn't meaningful, so we suppress it.
  if (!meaningful || value == null) return <span style={{ color: 'var(--t4)' }}>—</span>
  // >100% = oversubscribed (bookings exceed maxPlayers). We keep the real
  // number (it's a demand signal for the insights engine) and tint it amber
  // rather than capping at 100%.
  const over = value > 100
  return (
    <span
      style={{ color: over ? '#F59E0B' : 'var(--t2)', fontWeight: over ? 700 : 400 }}
      title={over ? 'Oversubscribed — confirmed bookings exceed listed capacity' : undefined}
    >
      {value}%{over ? '+' : ''}
    </span>
  )
}
