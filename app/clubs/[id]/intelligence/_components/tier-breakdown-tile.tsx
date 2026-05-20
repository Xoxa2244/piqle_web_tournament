'use client'

/**
 * Programming Health Overview tile.
 *
 * Originally landed as "Programming tier breakdown" in Sprint 1 P1.4 to
 * surface the 7-tier session distribution. Per
 * DASHBOARD_AND_ACTION_CENTER_SPEC.md v1.2 §3.5 — Dashboard block,
 * symmetric with Customer Health Overview ("здоровье клиентов" vs
 * "здоровье программ").
 *
 * Two views on the same week of programming data:
 *
 *   1. Tier distribution — count + fill rate per tier 1-7 over the
 *      selected window (7/30/90d), classified via
 *      lib/ai/programming-tier-classifier.
 *
 *   2. Execution check — the 4 Y/N indicators from Solomon's IPC
 *      Weekly Scorecard (core daily? leagues active? signature event
 *      this week? monthly social/tournament cadence?). Always scoped
 *      to the current ISO week, regardless of the breakdown window.
 *
 * "Open Programming Health →" cross-link drops the operator straight
 * into the full weekly view (/scorecard route, renamed page).
 */

import { useState } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { motion } from 'motion/react'
import { Layers, CheckCircle2, XCircle, ChevronRight, MinusCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

const WINDOW_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

type CheckStatus = 'pass' | 'fail' | 'unknown'

function statusFromBool(v: boolean | null | undefined): CheckStatus {
  if (v === true) return 'pass'
  if (v === false) return 'fail'
  return 'unknown'
}

function CheckRow({ label, status }: { label: string; status: CheckStatus }) {
  const color =
    status === 'pass' ? '#10B981' : status === 'fail' ? '#EF4444' : 'var(--t4)'
  const bg =
    status === 'pass'
      ? 'rgba(16,185,129,0.08)'
      : status === 'fail'
      ? 'rgba(239,68,68,0.08)'
      : 'var(--subtle)'
  const Icon =
    status === 'pass' ? CheckCircle2 : status === 'fail' ? XCircle : MinusCircle
  const valueLabel =
    status === 'pass' ? 'Yes' : status === 'fail' ? 'No' : '—'

  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: bg, border: `1px solid ${color}26` }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="text-[11px]" style={{ color: 'var(--t2)' }}>
          {label}
        </span>
      </div>
      <span className="text-[11px]" style={{ color, fontWeight: 700 }}>
        {valueLabel}
      </span>
    </div>
  )
}

export function TierBreakdownTile({ clubId }: Props) {
  const [windowDays, setWindowDays] = useState(7)
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const routeClubId = (params?.id as string | undefined) ?? clubId
  const demoParam = searchParams?.get('demo') === 'true' ? '?demo=true' : ''

  const breakdownQuery = trpc.intelligence.getProgrammingTierBreakdown.useQuery(
    { clubId, windowDays },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const data = breakdownQuery.data

  // Execution Check — most recently completed Mon-Sun week (server
  // default). Fixed weekly cadence, independent of the breakdown
  // window above; weekStart string comes back in the response so we
  // don't recompute it client-side.
  const scorecardQuery = trpc.intelligence.getWeeklyScorecard.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const exec = scorecardQuery.data?.executionCheck
  const weekStartIso = scorecardQuery.data?.weekStart
  const weekStartLabel = weekStartIso ? weekStartIso.slice(0, 10) : null

  const goToProgrammingHealth = () => {
    router.push(`/clubs/${routeClubId}/intelligence/scorecard${demoParam}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-purple-600 shrink-0"
              style={{ boxShadow: '0 4px 12px rgba(217,70,239,0.3)' }}
            >
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3
                className="flex items-center gap-1.5"
                style={{ fontSize: 14, fontWeight: 700, color: 'var(--heading)' }}
                title="Health of the programming side of the club, symmetric with Customer Health Overview. Tier distribution from IPC's 7-tier Programming OS plus Solomon's weekly Execution Check (core daily? leagues active? signature event? monthly cadence?). Open Programming Health for the full weekly report."
              >
                Programming Health Overview
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] cursor-help"
                  style={{ background: 'var(--card-border)', color: 'var(--t4)', fontWeight: 700 }}
                  aria-hidden
                >
                  ?
                </span>
              </h3>
              <p style={{ fontSize: 11, color: 'var(--t4)' }}>
                Tier distribution + weekly execution check
              </p>
            </div>
          </div>
          {/* Right side: window selector + cross-link */}
          <div className="flex items-center gap-1.5 shrink-0">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setWindowDays(opt.days)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all"
                style={{
                  background: windowDays === opt.days ? 'var(--pill-active)' : 'transparent',
                  color: windowDays === opt.days ? '#A855F7' : 'var(--t3)',
                  border: `1px solid ${windowDays === opt.days ? 'rgba(168,85,247,0.35)' : 'var(--card-border)'}`,
                  fontWeight: windowDays === opt.days ? 600 : 500,
                }}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={goToProgrammingHealth}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(168,85,247,0.1)',
                color: '#A855F7',
                border: '1px solid rgba(168,85,247,0.25)',
                fontWeight: 600,
              }}
              title="Open the full Programming Health weekly report"
            >
              Open <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Tier breakdown body */}
        {breakdownQuery.isLoading ? (
          <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading…</div>
        ) : !data || data.totalSessions === 0 ? (
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              background: 'var(--subtle)',
              border: '1px dashed var(--card-border)',
              color: 'var(--t3)',
            }}
          >
            No sessions in the last {windowDays} {windowDays === 1 ? 'day' : 'days'}.
          </div>
        ) : (
          <>
            <div className="text-xs mb-3" style={{ color: 'var(--t4)' }}>
              <span style={{ color: 'var(--heading)', fontWeight: 700 }}>{data.totalSessions}</span>{' '}
              {data.totalSessions === 1 ? 'session' : 'sessions'} in the last {windowDays}{' '}
              {windowDays === 1 ? 'day' : 'days'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {data.breakdown.map((row) => (
                <div
                  key={row.tier}
                  className="rounded-lg p-3 transition-all"
                  style={{
                    background: row.count > 0 ? row.bg : 'var(--subtle)',
                    border: `1px solid ${row.count > 0 ? row.border : 'var(--card-border)'}`,
                    opacity: row.count > 0 ? 1 : 0.55,
                  }}
                  title={`${row.label} · expected cadence: ${row.cadence}`}
                >
                  <div
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{
                      color: row.count > 0 ? row.color : 'var(--t4)',
                      fontWeight: 700,
                    }}
                  >
                    {row.shortLabel}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: row.count > 0 ? row.color : 'var(--t3)',
                      lineHeight: 1,
                    }}
                  >
                    {row.count}
                  </div>
                  {row.fillRate != null && row.count > 0 && (
                    <div className="text-[10px] mt-1" style={{ color: 'var(--t4)' }}>
                      {row.fillRate}% fill
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Execution Check — current ISO week. Only render once the
            scorecard query resolves; we deliberately don't show a
            "Loading…" skeleton here because the tier breakdown above
            is the primary content. */}
        {exec && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ color: 'var(--t4)', fontWeight: 600 }}
              >
                This week's execution check
              </span>
              {weekStartLabel && (
                <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
                  Week of {weekStartLabel}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CheckRow
                label="Core programming delivered daily?"
                status={statusFromBool(exec.coreProgrammingDaily)}
              />
              <CheckRow
                label="Leagues continuous (no gaps)?"
                status={statusFromBool(exec.leaguesContinuous)}
              />
              <CheckRow
                label="At least 1 signature event run?"
                status={statusFromBool(exec.signatureEventRun)}
              />
              <CheckRow
                label="Monthly social / tournament cadence?"
                status={statusFromBool(exec.socialTournamentOnTrack)}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
