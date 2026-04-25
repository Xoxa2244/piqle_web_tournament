'use client'

import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { useTheme } from '../IQThemeProvider'
import { useSearchParams } from 'next/navigation'
import {
  Users, Clock, XCircle, TrendingUp, AlertTriangle, BarChart3, Loader2,
} from 'lucide-react'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--card-shadow)' }}>
      {children}
    </div>
  )
}

function InsightCard({ title, icon: Icon, color, loading, children }: {
  title: string; icon: any; color: string; loading?: boolean; children: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <h3 className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{title}</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--t4)' }} />
          </div>
        ) : children}
      </Card>
    </motion.div>
  )
}

export function AnalyticsIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'

  const socialClusters = trpc.intelligence.getInsightsSocialClusters.useQuery({ clubId }, { enabled: !isDemo })
  const bookingLeadTime = trpc.intelligence.getInsightsBookingLeadTime.useQuery({ clubId }, { enabled: !isDemo })
  const cancellations = trpc.intelligence.getInsightsCancellationPatterns.useQuery({ clubId }, { enabled: !isDemo })
  const skillMigration = trpc.intelligence.getInsightsSkillMigration.useQuery({ clubId }, { enabled: !isDemo })
  const churnRisk = trpc.intelligence.getInsightsChurnRiskBySocialGraph.useQuery({ clubId }, { enabled: !isDemo })
  const fillRate = trpc.intelligence.getInsightsFillRate.useQuery({ clubId }, { enabled: !isDemo })

  const formatLabel = (f: string) => f?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || f

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>Analytics</h1>
            <p className="text-sm" style={{ color: 'var(--t3)' }}>Cross-data insights from your club activity</p>
          </div>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-5">

        {/* 1. Social Clusters */}
        <InsightCard title="Social Clusters" icon={Users} color="#8B5CF6" loading={socialClusters.isLoading}>
          {socialClusters.data?.length ? (
            <div className="space-y-3">
              {socialClusters.data.slice(0, 5).map((cluster, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                    {cluster.size}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: 'var(--t1)', fontWeight: 600 }}>
                      {cluster.members.slice(0, 4).map(m => m.name?.split(' ')[0]).join(', ')}
                      {cluster.size > 4 ? ` +${cluster.size - 4}` : ''}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--t4)' }}>{cluster.size} players always play together</div>
                  </div>
                </div>
              ))}
              <p className="text-[11px] mt-2" style={{ color: 'var(--t4)' }}>
                {socialClusters.data.length} cluster{socialClusters.data.length > 1 ? 's' : ''} detected. If one member churns, the whole group is at risk.
              </p>
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>No social clusters detected yet</p>}
        </InsightCard>

        {/* 2. Booking Lead Time */}
        <InsightCard title="Booking Lead Time" icon={Clock} color="#06B6D4" loading={bookingLeadTime.isLoading}>
          {bookingLeadTime.data?.buckets?.length ? (
            <div className="space-y-2">
              {bookingLeadTime.data.buckets.map(b => {
                const labels: Record<string, string> = { same_day: 'Same day', last_minute: 'Last minute (<24h)', '1_3_days': '1-3 days', '3_7_days': '3-7 days', week_plus: '7+ days' }
                return (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="text-xs w-28 shrink-0" style={{ color: 'var(--t2)' }}>{labels[b.label] || b.label}</span>
                    <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
                      <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: '#06B6D4', minWidth: b.pct > 0 ? 4 : 0 }} />
                    </div>
                    <span className="text-xs w-10 text-right" style={{ fontWeight: 600, color: 'var(--t1)' }}>{b.pct}%</span>
                  </div>
                )
              })}
              <p className="text-[11px] mt-2" style={{ color: 'var(--t4)' }}>
                Total: {bookingLeadTime.data.total.toLocaleString()} bookings analyzed
              </p>
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>No booking data yet</p>}
        </InsightCard>

        {/* 3. Cancellation Patterns */}
        <InsightCard title="Cancellation Patterns" icon={XCircle} color="#EF4444" loading={cancellations.isLoading}>
          {cancellations.data?.byFormat?.length ? (
            <div className="space-y-3">
              <div className="text-xs" style={{ fontWeight: 600, color: 'var(--t2)' }}>By format:</div>
              <div className="space-y-1.5">
                {cancellations.data.byFormat.map(r => (
                  <div key={r.format} className="flex items-center gap-2">
                    <span className="text-[11px] w-24 truncate" style={{ color: 'var(--t2)' }}>{formatLabel(r.format)}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(r.rate, 100)}%`, background: r.rate > 15 ? '#EF4444' : r.rate > 8 ? '#F59E0B' : '#10B981', minWidth: r.rate > 0 ? 3 : 0 }} />
                    </div>
                    <span className="text-[11px] w-8 text-right" style={{ fontWeight: 600, color: r.rate > 15 ? '#EF4444' : 'var(--t1)' }}>{r.rate}%</span>
                  </div>
                ))}
              </div>
              {cancellations.data.topCancellers.length > 0 && (
                <>
                  <div className="text-xs mt-3" style={{ fontWeight: 600, color: 'var(--t2)' }}>Top cancellers:</div>
                  <div className="space-y-1">
                    {cancellations.data.topCancellers.slice(0, 3).map(c => (
                      <div key={c.userId} className="text-[11px] flex justify-between" style={{ color: 'var(--t3)' }}>
                        <span>{c.name}</span>
                        <span style={{ color: '#EF4444' }}>{c.cancelled}/{c.total} cancelled</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>No cancellation data yet</p>}
        </InsightCard>

        {/* 4. Skill Migration */}
        <InsightCard title="Skill Progression" icon={TrendingUp} color="#10B981" loading={skillMigration.isLoading}>
          {skillMigration.data?.length ? (
            <div className="space-y-2">
              {skillMigration.data.slice(0, 6).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded-lg" style={{ background: 'var(--subtle)', color: 'var(--t2)', fontWeight: 600 }}>{formatLabel(m.from)}</span>
                  <span style={{ color: 'var(--t4)' }}>→</span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', fontWeight: 600 }}>{formatLabel(m.to)}</span>
                  <span className="ml-auto" style={{ color: 'var(--t3)', fontWeight: 600 }}>{m.count} players</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>Not enough data for skill progression</p>}
        </InsightCard>

        {/* 5. Churn Risk by Social Graph */}
        <InsightCard title="Partner Churn Risk" icon={AlertTriangle} color="#F59E0B" loading={churnRisk.isLoading}>
          {churnRisk.data?.length ? (
            <div className="space-y-2">
              {churnRisk.data.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={{ color: 'var(--t1)', fontWeight: 600 }}>{r.userName}</div>
                    <div className="text-[10px]" style={{ color: 'var(--t4)' }}>
                      Partner <strong>{r.partnerName}</strong> inactive
                      {r.partnerLastPlayed ? ` since ${r.partnerLastPlayed}` : ''}
                      {' · '}{r.sharedSessions} shared sessions
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-lg shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}>
                    AT RISK
                  </span>
                </div>
              ))}
              <p className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
                {churnRisk.data.length} player{churnRisk.data.length > 1 ? 's' : ''} at elevated churn risk
              </p>
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>No partner churn risks detected</p>}
        </InsightCard>

        {/* 6. Fill Rate by Attributes */}
        <InsightCard title="Session Fill Rate" icon={BarChart3} color="#6366F1" loading={fillRate.isLoading}>
          {fillRate.data?.length ? (
            <div className="space-y-2">
              <div className="text-[10px] mb-2" style={{ color: 'var(--t4)' }}>Best → worst performing combinations</div>
              {fillRate.data.slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] w-36 truncate" style={{ color: 'var(--t2)' }}>
                    {formatLabel(r.format)} · {r.day} {r.timeBucket}
                  </span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(r.avgFill, 100)}%`,
                      background: r.avgFill >= 80 ? '#10B981' : r.avgFill >= 50 ? '#F59E0B' : '#EF4444',
                      minWidth: r.avgFill > 0 ? 3 : 0,
                    }} />
                  </div>
                  <span className="text-[10px] w-10 text-right" style={{
                    fontWeight: 700,
                    color: r.avgFill >= 80 ? '#10B981' : r.avgFill >= 50 ? '#F59E0B' : '#EF4444',
                  }}>{r.avgFill}%</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs py-4 text-center" style={{ color: 'var(--t4)' }}>Not enough session data yet</p>}
        </InsightCard>
      </div>
    </div>
  )
}
