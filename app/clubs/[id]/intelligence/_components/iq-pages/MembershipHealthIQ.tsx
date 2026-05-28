'use client'

import { useState } from "react"
import { motion } from "motion/react"
import Link from "next/link"
import {
  Heart, DollarSign, AlertTriangle, TrendingUp, ChevronDown, ChevronUp,
  Sparkles, Activity, ShieldAlert, ArrowUpRight, Megaphone,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { trpc } from "@/lib/trpc"

// ── Verdict styling ──
type Verdict = 'healthy' | 'watch' | 'at_risk' | 'critical' | 'tiny'
const VERDICT_META: Record<Verdict, { label: string; color: string }> = {
  critical: { label: 'Critical', color: '#EF4444' },
  at_risk: { label: 'At risk', color: '#F97316' },
  watch: { label: 'Watch', color: '#F59E0B' },
  healthy: { label: 'Healthy', color: '#10B981' },
  tiny: { label: 'Too small', color: '#94A3B8' },
}

const CAMPAIGN_HINT_LABEL: Record<string, string> = {
  RETENTION_BOOST: 'Re-engage',
  UPSELL: 'Upsell',
  WINBACK: 'Win back',
  BILLING_AUDIT: 'Billing audit',
  PRICE_REVIEW: 'Pricing',
}

type Treatment = {
  action: string
  campaignHint: string
  potentialMRRImpactUsd: number
  targetMemberCount: number
}

type Tier = {
  name: string
  monthlyPrice: number
  annualPrice: number
  isFreeTier: boolean
  active: number
  suspended: number
  expired: number
  zombies: number
  powerUsers: number
  zombieSharePct: number
  powerUserSharePct: number
  suspendedRatePct: number
  bookings30d: number
  bookingsPerActive: number
  estimatedMRR: number
  mrrAtRiskUsd: number
  upsellPotentialMRRUsd: number
  verdict: Verdict
  healthScore: number
  diagnostics: string[]
  treatments: Treatment[]
  description: string
  benefits: string[]
  suspendDays: number | null
  cancelDays: number | null
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  )
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--t4)" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, color: color || "var(--heading)" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>{sub}</div>}
    </Card>
  )
}

export function MembershipHealthIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = trpc.intelligence.getMembershipHealth.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 60_000 },
  )

  const tiers = (data?.tiers as Tier[] | undefined) || []
  const rollup = data?.rollup

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1100px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Membership Health</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
            Every tier scored on engagement, revenue and churn risk — with what to do about it
          </p>
        </div>
        {rollup?.catalogSyncedAt && (
          <span className="text-xs shrink-0" style={{ color: "var(--t4)" }}>
            Synced {new Date(rollup.catalogSyncedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
      )}

      {!isLoading && tiers.length === 0 && (
        <Card>
          <div className="flex items-center gap-3 py-6 justify-center text-center">
            <Heart className="w-5 h-5" style={{ color: "var(--t4)" }} />
            <span className="text-sm" style={{ color: "var(--t3)" }}>
              No membership tiers synced yet. Connect CourtReserve to populate tier health.
            </span>
          </div>
        </Card>
      )}

      {/* Rollup strip */}
      {rollup && tiers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Est. MRR" value={usd(rollup.totalMRR)} sub={`${rollup.totalActiveSubscribers.toLocaleString()} active`} />
          <StatTile label="MRR at risk" value={usd(rollup.clubMRRAtRiskUsd)} sub="zombies on paid tiers" color={rollup.clubMRRAtRiskUsd > 0 ? "#EF4444" : undefined} />
          <StatTile label="Upsell potential" value={usd(rollup.clubUpsellPotentialMRRUsd)} sub="free power users" color={rollup.clubUpsellPotentialMRRUsd > 0 ? "#10B981" : undefined} />
          <StatTile
            label="Tier verdicts"
            value={`${(rollup.countByVerdict?.critical || 0) + (rollup.countByVerdict?.at_risk || 0)} need action`}
            sub={`${rollup.countByVerdict?.healthy || 0} healthy · ${rollup.countByVerdict?.watch || 0} watch`}
          />
        </div>
      )}

      {/* Per-tier cards */}
      <div className="space-y-3">
        {tiers.map((t) => {
          const vm = VERDICT_META[t.verdict] ?? VERDICT_META.tiny
          const isOpen = expanded === t.name
          return (
            <Card key={t.name}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `${vm.color}20`, color: vm.color, fontWeight: 700 }}
                    >
                      {vm.label}
                    </span>
                    <h3 className="truncate" style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)" }}>
                      {t.name}
                    </h3>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                    {t.isFreeTier ? "Free / comped / partner" : `$${t.monthlyPrice}/mo`}
                    {" · "}health {t.healthScore}/100
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--heading)" }}>
                    {t.isFreeTier ? "—" : usd(t.estimatedMRR)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--t4)" }}>{t.isFreeTier ? "no MRR" : "MRR"}</div>
                </div>
              </div>

              {/* Signals */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: "var(--t3)" }}>
                <span><Activity className="w-3 h-3 inline mr-1" style={{ color: "var(--t4)" }} />{t.active.toLocaleString()} active</span>
                <span style={{ color: t.zombieSharePct >= 45 ? "#EF4444" : t.zombieSharePct >= 25 ? "#F59E0B" : "var(--t3)" }}>
                  {t.zombieSharePct}% zombie
                </span>
                <span>{t.powerUserSharePct}% power</span>
                {t.suspendedRatePct >= 10 && <span style={{ color: "#F59E0B" }}>{t.suspendedRatePct}% suspended</span>}
                <span>{t.bookingsPerActive}/member · 30d</span>
                {!t.isFreeTier && t.mrrAtRiskUsd > 0 && <span style={{ color: "#EF4444" }}>{usd(t.mrrAtRiskUsd)} at risk</span>}
                {t.isFreeTier && t.upsellPotentialMRRUsd > 0 && <span style={{ color: "#10B981" }}>{usd(t.upsellPotentialMRRUsd)} upsell</span>}
              </div>

              {/* Diagnostics */}
              {t.diagnostics.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {t.diagnostics.map((d, i) => (
                    <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--t2)", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--t4)" }}>•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Treatments */}
              {t.treatments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {t.treatments.map((tx, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3 flex items-start justify-between gap-3"
                      style={{ background: isDark ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6", fontWeight: 700 }}>
                            {CAMPAIGN_HINT_LABEL[tx.campaignHint] || tx.campaignHint}
                          </span>
                          {tx.potentialMRRImpactUsd > 0 && (
                            <span className="text-xs" style={{ color: "#10B981", fontWeight: 700 }}>
                              +{usd(tx.potentialMRRImpactUsd)}/mo potential
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: "var(--t2)", lineHeight: 1.5 }}>{tx.action}</p>
                      </div>
                      <Link
                        href={`/clubs/${clubId}/intelligence/campaigns`}
                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs self-center"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", color: "#fff", fontWeight: 600 }}
                      >
                        <Megaphone className="w-3 h-3" />
                        Campaign
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              {/* Expand: catalog detail */}
              {(t.benefits.length > 0 || t.description || t.suspendDays != null) && (
                <>
                  <button
                    onClick={() => setExpanded(isOpen ? null : t.name)}
                    className="mt-3 inline-flex items-center gap-1 text-xs"
                    style={{ color: "var(--t4)" }}
                  >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isOpen ? "Hide details" : "Tier details"}
                  </button>
                  {isOpen && (
                    <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
                      {t.description && (
                        <p className="text-xs mb-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>{t.description.slice(0, 280)}</p>
                      )}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-2" style={{ color: "var(--t3)" }}>
                        {!t.isFreeTier && <span>${t.monthlyPrice}/mo · ${t.annualPrice}/yr</span>}
                        {t.suspendDays != null && <span>Suspend after {t.suspendDays}d past due</span>}
                        {t.cancelDays != null && <span>Cancel after {t.cancelDays}d past due</span>}
                      </div>
                      {t.benefits.length > 0 && (
                        <ul className="space-y-0.5">
                          {t.benefits.slice(0, 8).map((b, i) => (
                            <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--t2)" }}>
                              <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#8B5CF6" }} />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>
          )
        })}
      </div>

      {/* Methodology footnote */}
      {tiers.length > 0 && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--t4)" }}>
          Zombie = active subscriber with 0 bookings in 30 days. Power user = 8+ bookings. Est. MRR = active × monthly price
          (contracted, not actual transactions). Treatment $ uses conservative recovery rates (50% re-engage/upsell, 30% billing winback) —
          rough guides for prioritisation, not guarantees.
        </p>
      )}
    </motion.div>
  )
}
