'use client'

/**
 * Pickleball 101 → Membership conversion funnel tile.
 *
 * Sprint 1 P1.3 — Tier 1.3 of IPC's Programming OS sits at the top of
 * the acquisition funnel. This tile measures whether intro programs
 * actually move people into paying tiers.
 *
 * Backed by intelligence.getIntroConversionFunnel which does the
 * regex-based intro detection (lib/ai/intro-program-detection.ts) and
 * cross-references attendees with current users.membership_status.
 *
 * Snapshot semantics: "converted" means the attendee currently holds an
 * Active subscription on a non-guest tier. We don't have historical
 * subscription state, so the tile labels this trade-off explicitly.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { GraduationCap, TrendingUp, Users, Target } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Props {
  clubId: string
}

const PERIOD_OPTIONS = [
  { weeks: 4, label: '4w' },
  { weeks: 12, label: '12w' },
  { weeks: 26, label: '26w' },
]

export function IntroFunnelTile({ clubId }: Props) {
  const [weeks, setWeeks] = useState(12)

  const query = trpc.intelligence.getIntroConversionFunnel.useQuery(
    { clubId, weeks },
    { enabled: !!clubId, staleTime: 5 * 60_000 },
  )

  const data = query.data

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
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
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0"
              style={{ boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
            >
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3
                className="flex items-center gap-1.5"
                style={{ fontSize: 14, fontWeight: 700, color: 'var(--heading)' }}
                title="Members who attended an intro session (Pickleball 101 / Free Beginner Class / similar) and now hold an Active subscription on a non-guest tier. Conversion is a snapshot of current paying status — historical subscription state is not tracked."
              >
                Pickleball 101 funnel
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] cursor-help"
                  style={{ background: 'var(--card-border)', color: 'var(--t4)', fontWeight: 700 }}
                  aria-hidden
                >
                  ?
                </span>
              </h3>
              <p style={{ fontSize: 11, color: 'var(--t4)' }}>
                Intro sessions → paying members
              </p>
            </div>
          </div>
          {/* Period selector */}
          <div className="flex gap-1 shrink-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.weeks}
                onClick={() => setWeeks(opt.weeks)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all"
                style={{
                  background: weeks === opt.weeks ? 'var(--pill-active)' : 'transparent',
                  color: weeks === opt.weeks ? '#10B981' : 'var(--t3)',
                  border: `1px solid ${weeks === opt.weeks ? 'rgba(16,185,129,0.35)' : 'var(--card-border)'}`,
                  fontWeight: weeks === opt.weeks ? 600 : 500,
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
        ) : !data || data.totalAttendees === 0 ? (
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              background: 'var(--subtle)',
              border: '1px dashed var(--card-border)',
              color: 'var(--t3)',
            }}
          >
            <p style={{ color: 'var(--t2)', fontWeight: 500, marginBottom: 4 }}>
              No intro sessions detected in the last {weeks} weeks
            </p>
            <p className="text-xs">
              Intro programs are detected by name (e.g. &quot;Pickleball 101&quot;,
              &quot;Free Beginner Class&quot;, &quot;Intro to Pickleball&quot;).
              If your sessions use different naming, contact support to add a
              custom pattern.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                icon={<GraduationCap className="w-4 h-4 text-emerald-500" />}
                value={String(data.totalIntroSessions)}
                label="Intro sessions run"
              />
              <Stat
                icon={<Users className="w-4 h-4 text-blue-500" />}
                value={String(data.totalAttendees)}
                label="Unique attendees"
              />
              <Stat
                icon={<Target className="w-4 h-4 text-purple-500" />}
                value={String(data.convertedToPayingMember)}
                label="Now paying members"
              />
              <Stat
                icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
                value={`${data.conversionRate}%`}
                label="Conversion rate"
                accent
              />
            </div>

            {data.sampleConvertedTiers && data.sampleConvertedTiers.length > 0 && (
              <div
                className="mt-4 pt-3 text-xs"
                style={{ borderTop: '1px solid var(--card-border)', color: 'var(--t4)' }}
              >
                Top tiers converted into:{' '}
                <span style={{ color: 'var(--t2)' }}>
                  {data.sampleConvertedTiers.slice(0, 3).join(' · ')}
                  {data.sampleConvertedTiers.length > 3 ? ` · +${data.sampleConvertedTiers.length - 3} more` : ''}
                </span>
              </div>
            )}

            <p
              className="mt-3 text-[10px]"
              style={{ color: 'var(--t4)' }}
            >
              Snapshot — &quot;paying&quot; means an Active subscription on a non-guest tier today.
              Recent attendees may still be in their decision window.
            </p>
          </>
        )}
      </div>
    </motion.div>
  )
}

function Stat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode
  value: string
  label: string
  accent?: boolean
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: accent ? 'rgba(16,185,129,0.06)' : 'var(--subtle)',
        border: `1px solid ${accent ? 'rgba(16,185,129,0.2)' : 'var(--card-border)'}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: accent ? '#10B981' : 'var(--heading)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}
