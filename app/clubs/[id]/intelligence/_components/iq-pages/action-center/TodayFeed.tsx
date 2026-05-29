'use client'

/**
 * TodayFeed — the "Today" tab of the Action Center.
 *
 * An engagement to-do, not a dashboard: "what should I do today to raise
 * member engagement?" Each card is a concrete action grounded in the club's
 * real numbers (how many members, how much $ at risk) and deep-links into the
 * Campaign Wizard pre-scoped via handoffs that already exist
 * (?goal= auto-audience, and ?goal=&tier=&bucket= tier-exact).
 *
 * No metrics snapshot (that's the Dashboard) and no ops items (approvals /
 * sync / kill-switch stay in the Signal feed tab) — this screen is strictly
 * about engagement. Actions are counts over live data, so they self-update as
 * members re-engage / sessions fill on the next sync; no per-item resolve.
 *
 * Architecture: client-side composition over existing queries (mirrors how
 * SignalFeed fires tRPC queries and composes the result) — no new backend.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import {
  ArrowRight,
  CalendarClock,
  HeartPulse,
  Megaphone,
  RotateCcw,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import {
  useMemberHealthSummary,
  useNewMembers,
  useReactivationCandidates,
} from '../../../_hooks/use-intelligence'

interface Props {
  clubId: string
}

interface EngagementAction {
  key: string
  icon: LucideIcon
  accent: string
  title: string
  why: string
  /** Optional "$X/mo at risk" style impact line. */
  impact: string | null
  /** $ used for ranking (0 when not money-quantified). */
  impactUsd: number
  /** member/session count, used for ranking + the empty check. */
  count: number
  href: string
  cta: string
}

// Tier names are long ("Open Play Pass - $49.99/Month ... (Network)"); show
// just the human label for the card title.
function shortTier(name: string): string {
  return name.split(' - ')[0].split(' (')[0].trim()
}

// "$10,228/mo" → "~$10.2K"; small values stay exact.
function money(usd: number): string {
  return usd >= 1000 ? `~$${(usd / 1000).toFixed(1)}K` : `~$${Math.round(usd)}`
}

// Local YYYY-MM-DD (operator's timezone ≈ club's) for the same-day cutoff.
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TodayFeed({ clubId }: Props) {
  const base = `/clubs/${clubId}/intelligence`

  // Silent paid subscribers ("zombies") + $ at risk, per tier.
  const membershipHealth = trpc.intelligence.getMembershipHealth.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 60_000 },
  )
  // Lapsed (21+ days inactive).
  const reactivation = useReactivationCandidates(clubId, 21)
  // Recently joined members.
  const newMembers = useNewMembers(clubId, 14)
  // At-risk / critical member-health counts (fast summary, ~50ms).
  const memberHealth = useMemberHealthSummary(clubId)
  // Underfilled sessions in the next few days.
  const underfilled = trpc.intelligence.getUnderfilledSessions.useQuery(
    { clubId, days: 5 },
    { enabled: !!clubId, staleTime: 60_000 },
  )

  const actions = useMemo<EngagementAction[]>(() => {
    const out: EngagementAction[] = []

    // 1. Re-engage silent paid subscribers (top paid tier by $ at risk).
    const tiers = (membershipHealth.data?.tiers ?? []) as any[]
    const topTier = tiers
      .filter((t) => !t.isFreeTier && (t.monthlyPrice ?? 0) > 0 && (t.zombies ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.mrrAtRiskUsd ?? 0) - (a.mrrAtRiskUsd ?? 0) || (b.zombies ?? 0) - (a.zombies ?? 0),
      )[0]
    if (topTier) {
      const z = Number(topTier.zombies)
      const atRiskUsd = Number(topTier.mrrAtRiskUsd ?? 0)
      out.push({
        key: 'silent',
        icon: Megaphone,
        accent: '#8B5CF6',
        title: `Re-engage ${z.toLocaleString()} silent ${shortTier(topTier.name)} subscriber${z === 1 ? '' : 's'}`,
        why: "They pay but haven't booked in 30+ days — your biggest engagement + revenue lever.",
        impact: atRiskUsd > 0 ? `${money(atRiskUsd)}/mo at risk` : null,
        impactUsd: atRiskUsd,
        count: z,
        href: `${base}/campaigns?goal=retention_boost&tier=${encodeURIComponent(topTier.name)}&bucket=zombies`,
        cta: 'Win-back campaign',
      })
    }

    // 2. Win back lapsed members (21+ days).
    const lapsed = (reactivation.data as any)?.candidates?.length ?? 0
    if (lapsed > 0) {
      out.push({
        key: 'lapsed',
        icon: RotateCcw,
        accent: '#F97316',
        title: `Win back ${lapsed.toLocaleString()} member${lapsed === 1 ? '' : 's'} who haven't played in 21+ days`,
        why: 'A personalized reactivation nudge brings a share of them back before they fully lapse.',
        impact: null,
        impactUsd: 0,
        count: lapsed,
        href: `${base}/campaigns?goal=reactivate_dormant`,
        cta: 'Reactivation campaign',
      })
    }

    // 3. Welcome new members.
    const newCount =
      (newMembers.data as any)?.count ?? (newMembers.data as any)?.members?.length ?? 0
    if (newCount > 0) {
      out.push({
        key: 'new',
        icon: UserPlus,
        accent: '#10B981',
        title: `Welcome ${newCount.toLocaleString()} new member${newCount === 1 ? '' : 's'}`,
        why: 'Joined in the last 14 days — an early nudge drives the next booking and sticks the habit.',
        impact: null,
        impactUsd: 0,
        count: newCount,
        href: `${base}/campaigns?goal=onboard_new`,
        cta: 'Welcome campaign',
      })
    }

    // 4. Fill underfilled sessions in the next 1–5 days (exclude same-day —
    //    too late to fill by outreach today).
    const sessions = ((underfilled.data as any)?.sessions ?? []) as any[]
    const cutoff = localToday()
    const upcoming = sessions.filter((s) => String(s.date ?? '') > cutoff)
    if (upcoming.length > 0) {
      out.push({
        key: 'fill',
        icon: CalendarClock,
        accent: '#06B6D4',
        title: `Fill ${upcoming.length} under-capacity session${upcoming.length === 1 ? '' : 's'} in the next 1–5 days`,
        why: 'Still time to invite matching players before these slots run — closing soonest first.',
        impact: null,
        impactUsd: 0,
        count: upcoming.length,
        href: `${base}/slot-filler`,
        cta: 'Fill sessions',
      })
    }

    // 5. Check in on at-risk members (declining activity).
    const summary = (memberHealth.data as any)?.summary
    const atRisk = (summary?.atRisk ?? 0) + (summary?.critical ?? 0)
    if (atRisk > 0) {
      const revAtRisk = Number(summary?.revenueAtRisk ?? 0)
      out.push({
        key: 'atrisk',
        icon: HeartPulse,
        accent: '#EF4444',
        title: `Check in on ${atRisk.toLocaleString()} at-risk member${atRisk === 1 ? '' : 's'}`,
        why: 'Declining activity — a timely check-in is far cheaper than winning them back later.',
        impact: revAtRisk > 0 ? `${money(revAtRisk)}/mo at risk` : null,
        impactUsd: revAtRisk,
        count: atRisk,
        href: `${base}/campaigns?goal=retention_boost`,
        cta: 'Check-in campaign',
      })
    }

    // Highest-impact first: $ at risk, then raw count.
    return out.sort((a, b) => b.impactUsd - a.impactUsd || b.count - a.count)
  }, [membershipHealth.data, reactivation.data, newMembers.data, underfilled.data, memberHealth.data, base])

  const coreLoading =
    membershipHealth.isLoading ||
    reactivation.isLoading ||
    newMembers.isLoading ||
    memberHealth.isLoading ||
    underfilled.isLoading
  const showSkeleton = coreLoading && actions.length === 0
  const showEmpty = !coreLoading && actions.length === 0

  return (
    <div className="space-y-3">
      <p className="text-[12px]" style={{ color: 'var(--t4)' }}>
        Your highest-impact engagement moves today — each opens a ready-to-send campaign.
      </p>

      {showSkeleton ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--subtle)' }} />
          ))}
        </div>
      ) : showEmpty ? (
        <div
          className="rounded-xl p-10 flex flex-col items-center justify-center text-center"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <Sparkles className="w-10 h-10 mb-3 opacity-30" style={{ color: 'var(--t3)' }} />
          <p className="text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
            Nothing urgent for engagement today.
          </p>
          <p className="text-[11px] mt-1 max-w-md" style={{ color: 'var(--t4)' }}>
            Your silent, lapsed, new and at-risk member counts are all low right now. Check back
            tomorrow, or browse Members and Campaigns to engage proactively.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.key}
                href={a.href}
                className="group block rounded-xl p-4 transition-colors"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${a.accent}1f` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: a.accent }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
                        {a.title}
                      </span>
                      {a.impact && (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-md"
                          style={{ background: '#10B98114', color: '#10B981', fontWeight: 700 }}
                        >
                          {a.impact}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] mt-1" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
                      {a.why}
                    </p>
                  </div>

                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] self-center"
                    style={{ color: a.accent, fontWeight: 600 }}
                  >
                    {a.cta}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
