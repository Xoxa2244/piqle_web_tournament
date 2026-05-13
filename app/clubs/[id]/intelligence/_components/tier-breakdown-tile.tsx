'use client'

/**
 * Programming Tier breakdown tile.
 *
 * Sprint 1 P1.4 — surfaces the 7-tier session distribution from IPC's
 * Programming OS so admins can answer "what kind of programming did
 * we run this week?" at a glance, instead of scanning the schedule.
 *
 * Driven by intelligence.getProgrammingTierBreakdown which classifies
 * sessions via lib/ai/programming-tier-classifier (regex on title +
 * format-aware shortcuts).
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { Layers } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

const WINDOW_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

export function TierBreakdownTile({ clubId }: Props) {
  const [windowDays, setWindowDays] = useState(7)
  const query = trpc.intelligence.getProgrammingTierBreakdown.useQuery(
    { clubId, windowDays },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const data = query.data

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
                title="Sessions classified into IPC's 7-tier Programming OS taxonomy. T1 Core (daily) → T2 Leagues → T3 Signature events → T4 Social → T5 Tournaments → T6 Premium → T7 Youth. Auto-classified from session name + format; admins can override patterns in Settings (coming in Sprint 2 polish)."
              >
                Programming tier breakdown
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] cursor-help"
                  style={{ background: 'var(--card-border)', color: 'var(--t4)', fontWeight: 700 }}
                  aria-hidden
                >
                  ?
                </span>
              </h3>
              <p style={{ fontSize: 11, color: 'var(--t4)' }}>
                Sessions classified into IPC&apos;s 7 programming tiers
              </p>
            </div>
          </div>
          {/* Window selector */}
          <div className="flex gap-1 shrink-0">
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
          </div>
        </div>

        {/* Body */}
        {query.isLoading ? (
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
      </div>
    </motion.div>
  )
}
