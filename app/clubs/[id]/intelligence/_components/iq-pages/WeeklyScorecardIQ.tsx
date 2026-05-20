'use client'

/**
 * Weekly Programming Scorecard — Sprint 2 P2.2.
 *
 * One-page scorecard per location per week, mirroring the IPC
 * Programming Operating System v1.0 submission template. Backed by
 * intelligence.getWeeklyScorecard.
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileBarChart, CheckCircle2, XCircle, AlertCircle, Trophy, Users, GraduationCap, Sparkles } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart)
  const e = new Date(weekEnd)
  e.setDate(e.getDate() - 1) // weekEnd is exclusive (next Mon)
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function isoWeekStartFromDate(d: Date): string {
  const day = d.getUTCDay()
  const daysSinceLastMonday = day === 0 ? 6 : day - 1
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - daysSinceLastMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

export function WeeklyScorecardIQ({ clubId }: Props) {
  // Default: most recent completed Mon-Sun.
  const today = new Date()
  const lastCompletedMonday = new Date(today.getTime() - 7 * 86400000)
  const [weekStart, setWeekStart] = useState(isoWeekStartFromDate(lastCompletedMonday))

  const query = trpc.intelligence.getWeeklyScorecard.useQuery(
    { clubId, weekStart },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )
  const data = query.data

  const shiftWeek = (deltaDays: number) => {
    const d = new Date(weekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + deltaDays)
    setWeekStart(d.toISOString().slice(0, 10))
  }

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
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--heading)' }}>Weekly Programming Scorecard</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              IPC Programming OS rollup — one report per location per week
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-7)}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" style={{ color: 'var(--t2)' }} />
          </button>
          <div
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--heading)' }}
          >
            {data ? formatWeekRange(data.weekStart, data.weekEnd) : 'Loading…'}
          </div>
          <button
            onClick={() => shiftWeek(7)}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--t2)' }} />
          </button>
        </div>
      </div>

      {query.isLoading || !data ? (
        <div className="text-sm" style={{ color: 'var(--t3)' }}>Loading scorecard…</div>
      ) : (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiTile label="Total sessions" value={String(data.kpiSummary.totalSessions)} />
            <KpiTile label="Unique participants" value={String(data.kpiSummary.uniqueParticipants)} />
            <KpiTile label="New players" value={String(data.kpiSummary.newPlayersThisWeek)} accent="green" />
            <KpiTile
              label="Court utilization"
              value={data.kpiSummary.courtUtilizationPercent != null ? `${data.kpiSummary.courtUtilizationPercent}%` : '—'}
            />
            <KpiTile
              label="Revenue (week)"
              value={formatRevenue(data.kpiSummary.revenueCents)}
              accent="green"
            />
          </div>

          {/* Execution check */}
          <SectionCard
            title="Execution check"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            tint="emerald"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ExecRow label="Core programming delivered daily?" value={data.executionCheck.coreProgrammingDaily} />
              <ExecRow label="Leagues continuous (no gaps)?" value={data.executionCheck.leaguesContinuous} />
              <ExecRow label="At least 1 signature event run?" value={data.executionCheck.signatureEventRun} />
              <ExecRow label="Monthly social/tournament cadence on track?" value={data.executionCheck.socialTournamentOnTrack} />
            </div>
          </SectionCard>

          {/* T1 Core */}
          <SectionCard
            title="T1 — Core programming"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EF4444' }} />}
            tint="red"
            subtitle="Daily Open Play, Classes & Clinics, Pickleball 101"
            footer={<RevenueRow value={data.tier1.revenueCents} />}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SubBlock title="Open Play">
                <Stat label="Sessions" value={String(data.tier1.openPlay.sessions)} />
                <Stat label="Players" value={String(data.tier1.openPlay.players)} />
                <Stat label="Avg/session" value={String(data.tier1.openPlay.avgPlayers)} />
                <Stat label="Peak utilization" value={data.tier1.openPlay.peakUtilization != null ? `${data.tier1.openPlay.peakUtilization}%` : '—'} />
              </SubBlock>
              <SubBlock title="Classes & Clinics">
                <Stat label="Sessions" value={String(data.tier1.classes.sessions)} />
                <Stat label="Participants" value={String(data.tier1.classes.participants)} />
                <Stat label="Avg fill" value={data.tier1.classes.avgFillRate != null ? `${data.tier1.classes.avgFillRate}%` : '—'} />
              </SubBlock>
              <SubBlock title="Pickleball 101" icon={<GraduationCap className="w-3.5 h-3.5 text-emerald-500" />}>
                <Stat label="Sessions run" value={String(data.tier1.pickleball101.sessions)} />
                <Stat label="New players" value={String(data.tier1.pickleball101.attendees)} />
                <Stat label="Now paying" value={String(data.tier1.pickleball101.convertedToPaying)} />
                <Stat
                  label="Conversion"
                  value={data.tier1.pickleball101.conversionRate != null ? `${data.tier1.pickleball101.conversionRate}%` : '—'}
                  accent
                />
              </SubBlock>
            </div>
          </SectionCard>

          {/* T2 League */}
          <SectionCard
            title="T2 — Leagues"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F97316' }} />}
            tint="orange"
            subtitle="Always active, never between sessions"
            footer={<RevenueRow value={data.tier2.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Active families" value={String(data.tier2.activeLeagues)} />
              <Stat label="Sessions this week" value={String(data.tier2.sessionsThisWeek)} />
              <Stat label="Total participants" value={String(data.tier2.totalParticipants)} />
              <Stat
                label="Fill rate"
                value={data.tier2.fillRate != null ? `${data.tier2.fillRate}%` : '—'}
              />
              <Stat
                label="Waitlisted"
                value={String(data.tier2.waitlistedPlayers)}
                accent={data.tier2.waitlistedPlayers > 0}
              />
            </div>
            {data.tier2.gapCriticalCount > 0 && (
              <div
                className="mt-3 rounded-lg p-3 text-sm flex gap-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--t2)' }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                <span>
                  <strong style={{ color: 'var(--heading)' }}>{data.tier2.gapCriticalCount}</strong>{' '}
                  league {data.tier2.gapCriticalCount === 1 ? 'family is' : 'families are'} in a critical gap
                  (no upcoming session, last past 14-60d ago). The League Gap detector will draft an
                  open-enrollment campaign suggestion in the agent queue.
                </span>
              </div>
            )}
          </SectionCard>

          {/* T3 Signature */}
          <SectionCard
            title="T3 — Signature events"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EAB308' }} />}
            tint="yellow"
            subtitle="1–2 per week — Round Robins, Moneyball, DUPR events, K/Q court"
            footer={<RevenueRow value={data.tier3.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Events run" value={String(data.tier3.eventsRun)} />
              <Stat label="Total participants" value={String(data.tier3.totalParticipants)} />
              <Stat
                label="Avg fill"
                value={data.tier3.fillRate != null ? `${data.tier3.fillRate}%` : '—'}
              />
            </div>
            {data.tier3.topPerformingEvent && (
              <div className="mt-3 text-xs" style={{ color: 'var(--t3)' }}>
                Top performer:{' '}
                <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{data.tier3.topPerformingEvent.title}</span>
                {' '}({data.tier3.topPerformingEvent.fillRate}% fill)
              </div>
            )}
          </SectionCard>

          {/* T4 Social */}
          <SectionCard
            title="T4 — Social & community"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#3B82F6' }} />}
            tint="blue"
            subtitle="1–2 per month — Cosmic, Trivia, themed, charity"
            footer={<RevenueRow value={data.tier4.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Events run" value={String(data.tier4.eventsRun)} />
              <Stat label="Total participants" value={String(data.tier4.totalParticipants)} />
              <Stat
                label="Non-member %"
                value={data.tier4.nonMemberPercent != null ? `${data.tier4.nonMemberPercent}%` : '—'}
                hint={
                  data.tier4.nonMemberPercent != null
                    ? 'Share of CONFIRMED bookings made by guests / drop-ins / trial members'
                    : 'No T4 bookings in this week'
                }
                accent={
                  data.tier4.nonMemberPercent != null &&
                  data.tier4.nonMemberPercent >= 25
                }
              />
            </div>
          </SectionCard>

          {/* T5 Tournaments */}
          <SectionCard
            title="T5 — Tournaments"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#A855F7' }} />}
            tint="purple"
            subtitle="Monthly local + 4 system-wide per year"
            footer={<RevenueRow value={data.tier5.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Held this week" value={data.tier5.held ? 'Yes' : 'No'} />
              <Stat label="Total players" value={String(data.tier5.totalPlayers)} />
              <Stat
                label="Profit"
                value={data.tier5.profitabilityCents != null ? `$${(data.tier5.profitabilityCents / 100).toFixed(0)}` : '—'}
                hint="Requires cost model — coming in Sprint 9 P5.2"
              />
            </div>
          </SectionCard>

          {/* T6 Premium */}
          <SectionCard
            title="T6 — Premium programming"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#10B981' }} />}
            tint="green"
            subtitle="Monthly specialty clinics + quarterly visiting pros"
            footer={<RevenueRow value={data.tier6.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Specialty clinics" value={String(data.tier6.specialtyClinics)} />
              <Stat label="Participants" value={String(data.tier6.participants)} />
              <Stat label="Pro clinic held?" value={data.tier6.proClinicHeld ? 'Yes' : 'No'} />
            </div>
          </SectionCard>

          {/* T7 Youth */}
          <SectionCard
            title="T7 — Youth pipeline"
            icon={<div className="w-2.5 h-2.5 rounded-full" style={{ background: '#6B7280' }} />}
            tint="grey"
            subtitle="Intro / Development / Academy"
            footer={<RevenueRow value={data.tier7.revenueCents} />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Youth sessions" value={String(data.tier7.youthSessions)} />
              <Stat label="Participants" value={String(data.tier7.participants)} />
              <Stat
                label="School partners"
                value={data.tier7.schoolPartnersActive != null ? String(data.tier7.schoolPartnersActive) : '—'}
                hint="Requires SchoolPartnership entity — coming in Sprint 9 P5.3"
              />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green' }) {
  const color = accent === 'green' ? '#10B981' : 'var(--heading)'
  const bg = accent === 'green' ? 'rgba(16,185,129,0.06)' : 'var(--card-bg)'
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: bg, border: '1px solid var(--card-border)' }}
    >
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  subtitle,
  tint,
  children,
  footer,
}: {
  title: string
  icon: React.ReactNode
  subtitle?: string
  tint: 'red' | 'orange' | 'yellow' | 'blue' | 'purple' | 'green' | 'grey' | 'emerald'
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const tintMap: Record<string, string> = {
    red: '#EF4444',
    orange: '#F97316',
    yellow: '#EAB308',
    blue: '#3B82F6',
    purple: '#A855F7',
    green: '#10B981',
    grey: '#6B7280',
    emerald: '#10B981',
  }
  const accent = tintMap[tint]
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--heading)' }}>{title}</h3>
      </div>
      {subtitle && (
        <p className="text-xs mb-3" style={{ color: 'var(--t4)' }}>{subtitle}</p>
      )}
      {children}
      {footer && (
        <div
          className="mt-4 pt-3"
          style={{ borderTop: '1px dashed var(--card-border)' }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

function SubBlock({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-3 space-y-1.5"
      style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--t3)' }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: string
  accent?: boolean
  hint?: string
}) {
  return (
    <div
      className="rounded-lg p-2"
      style={{
        background: accent ? 'rgba(16,185,129,0.06)' : 'var(--subtle)',
        border: `1px solid ${accent ? 'rgba(16,185,129,0.2)' : 'var(--card-border)'}`,
      }}
      title={hint}
    >
      <div className="text-[10px] uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--t4)' }}>
        {label}
        {hint && (
          <span
            className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full text-[7px] cursor-help"
            style={{ background: 'var(--card-border)', color: 'var(--t4)', fontWeight: 700 }}
            aria-hidden
          >
            ?
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? '#10B981' : 'var(--heading)' }}>{value}</div>
    </div>
  )
}

// Sprint 9 Step 12 — revenue footer rendered at the bottom of each
// tier section. `value` is cents; null prints "—" so we never show
// $0.00 when sessions have no price data.
function RevenueRow({ value }: { value: number | null }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: 'var(--t4)' }} className="uppercase tracking-wider font-semibold">
        Revenue (week)
      </span>
      <span
        style={{
          color: value != null && value > 0 ? '#10B981' : 'var(--t3)',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {formatRevenue(value)}
      </span>
    </div>
  )
}

function formatRevenue(cents: number | null | undefined): string {
  if (cents == null) return '—'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1000) {
    return `$${Math.round(dollars).toLocaleString('en-US')}`
  }
  return `$${dollars.toFixed(0)}`
}

function ExecRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm"
      style={{
        background: value ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
        border: `1px solid ${value ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        color: 'var(--t2)',
      }}
    >
      <span>{label}</span>
      {value ? (
        <span className="inline-flex items-center gap-1 text-emerald-500" style={{ fontWeight: 700 }}>
          <CheckCircle2 className="w-4 h-4" /> Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-red-500" style={{ fontWeight: 700 }}>
          <XCircle className="w-4 h-4" /> No
        </span>
      )}
    </div>
  )
}
