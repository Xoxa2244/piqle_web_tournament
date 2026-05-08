'use client'

/**
 * Leagues IQ page — Sprint 2 P2.1.
 *
 * Read-only catalog of league families derived from CR session data.
 * Shows continuity status, sponsors, session counts, fill rate, and
 * a 5-session drilldown per family. Critical gaps surface to the top
 * so admins see "leagues between sessions" first.
 *
 * Backed by intelligence.getLeaguesCatalog (regex grouping over
 * play_sessions; no schema migration, no CRUD).
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { Trophy, AlertTriangle, AlertCircle, CheckCircle2, Hourglass, ChevronDown, ChevronUp, Tag } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

const WINDOW_OPTIONS = [
  { days: 60, label: '60d' },
  { days: 180, label: '180d' },
  { days: 365, label: '1y' },
]

const STATUS_META = {
  active: {
    label: 'Active',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.3)',
    Icon: CheckCircle2,
  },
  gap_warning: {
    label: 'Gap warning',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.3)',
    Icon: AlertCircle,
  },
  gap_critical: {
    label: 'Gap critical',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
    Icon: AlertTriangle,
  },
  ended: {
    label: 'Ended',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.25)',
    Icon: Hourglass,
  },
} as const

export function LeaguesIQ({ clubId }: Props) {
  const [windowDays, setWindowDays] = useState(180)
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)

  const query = trpc.intelligence.getLeaguesCatalog.useQuery(
    { clubId, windowDays },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )

  const data = query.data

  return (
    <div className="px-6 py-6 space-y-6" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-500 to-amber-600"
            style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}
          >
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--heading)' }}>Leagues</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              Continuous play structure — IPC&apos;s Tier 2 in the Programming OS
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setWindowDays(opt.days)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: windowDays === opt.days ? 'var(--pill-active)' : 'transparent',
                color: windowDays === opt.days ? '#F59E0B' : 'var(--t3)',
                border: `1px solid ${windowDays === opt.days ? 'rgba(245,158,11,0.35)' : 'var(--card-border)'}`,
                fontWeight: windowDays === opt.days ? 600 : 500,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status KPI strip */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCell label="Active" value={data.activeCount} status="active" />
          <KpiCell label="Gap warning" value={data.gapWarningCount} status="gap_warning" />
          <KpiCell label="Gap critical" value={data.gapCriticalCount} status="gap_critical" />
          <KpiCell label="Ended" value={data.endedCount} status="ended" />
        </div>
      )}

      {/* Body */}
      {query.isLoading ? (
        <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : !data || data.families.length === 0 ? (
        <div
          className="rounded-xl p-5 text-sm"
          style={{
            background: 'var(--subtle)',
            border: '1px dashed var(--card-border)',
            color: 'var(--t3)',
          }}
        >
          <p style={{ color: 'var(--t2)', fontWeight: 500, marginBottom: 4 }}>
            No leagues detected in the last {windowDays} days
          </p>
          <p className="text-xs">
            We look for CR sessions with format=LEAGUE_PLAY or &quot;league&quot; in the
            title. Group them into families (Casual League / DUPR League / etc.)
            by stripping season markers and sponsor phrases.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.families.map((f) => (
            <FamilyCard
              key={f.family}
              family={f}
              expanded={expandedFamily === f.family}
              onToggle={() => setExpandedFamily(expandedFamily === f.family ? null : f.family)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KpiCell({
  label,
  value,
  status,
}: {
  label: string
  value: number
  status: keyof typeof STATUS_META
}) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3"
      style={{
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: meta.color }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: meta.color, lineHeight: 1 }}>{value}</div>
    </motion.div>
  )
}

interface FamilyCardProps {
  family: {
    family: string
    sponsors: string[]
    sessionCount: number
    pastSessionCount: number
    futureSessionCount: number
    lastSessionDate: string | null
    nextSessionDate: string | null
    daysSinceLast: number | null
    daysUntilNext: number | null
    totalRegistered: number
    totalCapacity: number
    fillRate: number | null
    status: 'active' | 'gap_warning' | 'gap_critical' | 'ended'
    recentSessions: Array<{
      id: string
      title: string
      date: string
      registered: number
      capacity: number
    }>
  }
  expanded: boolean
  onToggle: () => void
}

function FamilyCard({ family, expanded, onToggle }: FamilyCardProps) {
  const meta = STATUS_META[family.status]
  const Icon = meta.Icon

  const lastDateLabel = family.lastSessionDate
    ? new Date(family.lastSessionDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const nextDateLabel = family.nextSessionDate
    ? new Date(family.nextSessionDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <div
      className="rounded-xl"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${meta.border}`,
        borderLeft: `4px solid ${meta.color}`,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
        type="button"
      >
        <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
              {family.family}
            </h3>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
            >
              {meta.label}
            </span>
            {family.sponsors.map((sp) => (
              <span
                key={sp}
                className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: 'var(--subtle)', color: 'var(--t3)', border: '1px solid var(--card-border)' }}
                title={`Sponsor: ${sp}`}
              >
                <Tag className="w-2.5 h-2.5" />
                {sp}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs" style={{ color: 'var(--t3)' }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>Sessions</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--heading)' }}>{family.sessionCount}</div>
              <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                {family.pastSessionCount} past · {family.futureSessionCount} upcoming
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>Last</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--heading)' }}>
                {lastDateLabel ?? '—'}
              </div>
              {family.daysSinceLast != null && (
                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                  {family.daysSinceLast === 0 ? 'today' : `${family.daysSinceLast}d ago`}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>Next</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: family.nextSessionDate ? 'var(--heading)' : meta.color }}>
                {nextDateLabel ?? 'None scheduled'}
              </div>
              {family.daysUntilNext != null && (
                <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                  {family.daysUntilNext === 0 ? 'today' : `in ${family.daysUntilNext}d`}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>Fill rate</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--heading)' }}>
                {family.fillRate != null ? `${family.fillRate}%` : '—'}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                {family.totalRegistered}/{family.totalCapacity}
              </div>
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--t4)' }} />
        ) : (
          <ChevronDown className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--t4)' }} />
        )}
      </button>

      {expanded && family.recentSessions.length > 0 && (
        <div
          className="px-4 pb-4 pt-0"
          style={{ borderTop: '1px solid var(--card-border)' }}
        >
          <div className="text-[10px] uppercase tracking-wider mt-3 mb-2" style={{ color: 'var(--t4)', fontWeight: 700 }}>
            Recent sessions
          </div>
          <div className="space-y-1">
            {family.recentSessions.map((s) => {
              const pct = s.capacity > 0 ? Math.round((s.registered / s.capacity) * 100) : 0
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-xs py-1.5 px-2 rounded-md"
                  style={{ background: 'var(--subtle)' }}
                >
                  <div className="truncate" style={{ color: 'var(--t2)' }}>{s.title}</div>
                  <div className="flex items-center gap-3 shrink-0" style={{ color: 'var(--t4)' }}>
                    <span>
                      {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ color: 'var(--t3)', fontWeight: 600 }}>
                      {s.registered}/{s.capacity} · {pct}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
