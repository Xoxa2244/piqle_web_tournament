'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Send, Calendar, AlertTriangle, Zap, TrendingUp,
  Mail, Loader2, BarChart3, GitBranch, Sparkles,
  ArrowRight, CheckCircle2, XCircle, UserCheck,
  Heart, Ban, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageContext } from '../_hooks/usePageContext'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useCampaignAnalytics, useVariantAnalytics, useSequenceAnalytics, useIsDemo } from '../_hooks/use-intelligence'
import { useBrand } from '@/components/BrandProvider'
import { CampaignsIQ } from '../_components/iq-pages/CampaignsIQ'

// ── Type / Status badge styles ──

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  CHECK_IN: { label: 'Check-in', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  RETENTION_BOOST: { label: 'Retention', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  SLOT_FILLER: { label: 'Slot Filler', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  REACTIVATION: { label: 'Reactivation', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  EVENT_INVITE: { label: 'Event Invite', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  sent: { label: 'Sent', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-500' },
}

// ── Timeline Bar Chart ──

function TimelineChart({ data }: { data: { date: string; sent: number; failed: number; skipped: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.sent + d.failed + d.skipped), 1)

  return (
    <div className="flex items-end gap-[3px] h-[140px]">
      {data.map((d) => {
        const total = d.sent + d.failed + d.skipped
        const sentPct = maxVal > 0 ? (d.sent / maxVal) * 100 : 0
        const failedPct = maxVal > 0 ? (d.failed / maxVal) * 100 : 0
        const day = new Date(d.date)
        const isWeekend = day.getDay() === 0 || day.getDay() === 6

        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
            {/* Tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="bg-popover border rounded-md shadow-md px-2 py-1 text-[10px] whitespace-nowrap text-popover-foreground">
                <strong>{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>: {total} messages
              </div>
            </div>
            {/* Bar */}
            <div className="w-full flex flex-col-reverse gap-[1px]" style={{ height: '120px' }}>
              {d.sent > 0 && (
                <div
                  className="w-full rounded-sm bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all duration-300"
                  style={{ height: `${sentPct}%`, minHeight: d.sent > 0 ? 2 : 0 }}
                />
              )}
              {d.failed > 0 && (
                <div
                  className="w-full rounded-sm bg-red-400"
                  style={{ height: `${failedPct}%`, minHeight: 2 }}
                />
              )}
              {total === 0 && (
                <div className="w-full rounded-sm bg-muted/40" style={{ height: '2px' }} />
              )}
            </div>
            {/* Label - show every Monday + first + last day */}
            {(day.getDay() === 1 || data.indexOf(d) === 0 || data.indexOf(d) === data.length - 1) ? (
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ) : (
              <span className="text-[9px]">&nbsp;</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Relative date formatter ──

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)

  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD === 1) return 'Yesterday'
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Period selector ──

const PERIODS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
]

// ── Variant label mapping ──

const VARIANT_LABELS: Record<string, string> = {
  llm_checkin_pattern: 'Pattern (LLM)',
  llm_checkin_social: 'Social Proof (LLM)',
  llm_checkin_urgency: 'Urgency (LLM)',
  llm_retention_value: 'Value (LLM)',
  llm_retention_community: 'Community (LLM)',
  llm_retention_urgency: 'Urgency (LLM)',
  checkin_frequency: 'Frequency',
  checkin_social: 'Social Proof',
  checkin_casual: 'Casual',
  retention_value: 'Value',
  retention_community: 'Community',
  retention_winback: 'Win-Back',
  resend_new_subject: 'New Subject',
  social_proof: 'Social Proof',
  value_reminder: 'Value Reminder',
  urgency_resend: 'Urgency',
  sms_nudge: 'SMS Nudge',
  final_offer: 'Final Offer',
  final_email: 'Final Email',
  community: 'Community',
  winback_offer: 'Win-Back Offer',
}

function getVariantLabel(id: string): string {
  return VARIANT_LABELS[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function isLLMVariant(id: string): boolean {
  return id.startsWith('llm_')
}

// ── Rate bar component ──

function RateBar({ rate, color }: { rate: number; color: 'green' | 'amber' | 'red' }) {
  const colors = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', colors[color])}
          style={{ width: `${Math.min(rate * 100, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{(rate * 100).toFixed(0)}%</span>
    </div>
  )
}

function getRateColor(rate: number, type: 'open' | 'click'): 'green' | 'amber' | 'red' {
  if (type === 'open') return rate >= 0.4 ? 'green' : rate >= 0.25 ? 'amber' : 'red'
  return rate >= 0.12 ? 'green' : rate >= 0.06 ? 'amber' : 'red'
}

// ── Sequence type labels ──

const SEQ_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  WATCH: { label: 'Watch', className: 'bg-amber-100 text-amber-700' },
  AT_RISK: { label: 'At Risk', className: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'Critical', className: 'bg-red-100 text-red-700' },
}

const EXIT_ICONS: Record<string, any> = {
  booked: UserCheck,
  health_improved: Heart,
  max_steps: CheckCircle2,
  opted_out: Ban,
  bounced: XCircle,
}

// ══════════ MAIN PAGE ══════════

export default function CampaignsPage() {
  const params = useParams()
  const clubId = params.id as string
  const isDemo = useIsDemo()
  const [days, setDays] = useState(30)
  const [variantFilter, setVariantFilter] = useState<'all' | 'CHECK_IN' | 'RETENTION_BOOST'>('all')
  const [activityPage, setActivityPage] = useState(0)
  const ACTIVITY_PER_PAGE = 10

  const { data, isLoading, error } = useCampaignAnalytics(clubId, days)
  const { data: variantData } = useVariantAnalytics(clubId, days)
  const { data: sequenceData } = useSequenceAnalytics(clubId)

  const setPageContext = useSetPageContext()
  useEffect(() => {
    if (!data) return
    const { summary, byType } = data
    const parts = [
      'Page: Campaign Analytics',
      `Period: last ${days} days`,
      `Total sent: ${summary.totalSent}, This week: ${summary.thisWeek}, Failed: ${summary.totalFailed}`,
      `Active triggers: ${summary.activeTriggers}/4`,
    ]
    if (byType.length > 0) {
      parts.push(`By type: ${byType.map((t: any) => t.type + ': ' + t.count).join(', ')}`)
    }
    if (variantData) {
      parts.push(`Overall open rate: ${(variantData.overallOpenRate * 100).toFixed(0)}%, click rate: ${(variantData.overallClickRate * 100).toFixed(0)}%`)
    }
    if (sequenceData) {
      parts.push(`Sequences: ${sequenceData.summary.activeSequences} active, ${sequenceData.summary.completedSequences} completed`)
    }
    setPageContext(parts.join('\n'))
  }, [data, days, variantData, sequenceData, setPageContext])

  const brand = useBrand()
  if (brand.key === 'iqsport') return <CampaignsIQ campaignData={data} isLoading={isLoading} clubId={clubId} />

  if (isLoading) return <ListSkeleton />

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Failed to load campaign data"
        description={error.message}
      />
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={Send}
        title="No campaign data yet"
        description="Campaign analytics will appear here once the automation engine starts sending messages."
      />
    )
  }

  const { summary, byType, byDay, recentLogs } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campaign Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Track automated outreach performance and member engagement
          </p>
        </div>
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                days === p.days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Demo badge */}
      {isDemo && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Demo mode — showing sample campaign data
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Sent"
          value={summary.totalSent}
          icon={Send}
          variant="default"
          subtitle={`Last ${days} days`}
          sparkline={byDay.slice(-14).map((d: any) => d.sent)}
        />
        <MetricCard
          label="This Week"
          value={summary.thisWeek}
          icon={Calendar}
          variant="success"
          subtitle="Last 7 days"
        />
        <MetricCard
          label="Failed"
          value={summary.totalFailed}
          icon={AlertTriangle}
          variant={summary.totalFailed > 0 ? 'danger' : 'default'}
          subtitle={summary.totalFailed === 0 ? 'All clear' : 'Need attention'}
        />
        <MetricCard
          label="Active Triggers"
          value={`${summary.activeTriggers}/4`}
          icon={Zap}
          variant="success"
          subtitle="Configured"
        />
      </div>

      {/* Breakdown by type */}
      {byType.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {byType.map((t: any) => {
            const style = TYPE_STYLES[t.type] || { label: t.type, className: 'bg-gray-100 text-gray-700' }
            return (
              <div key={t.type} className="flex items-center justify-between p-3 rounded-lg border">
                <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', style.className)}>
                  {style.label}
                </span>
                <span className="text-lg font-bold tabular-nums">{t.count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Messages Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart data={byDay} />
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Sent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-400" /> Failed
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ══ Section A: Variant Performance ══ */}
      {variantData && variantData.variants.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Message Variant Performance
              </CardTitle>
              <div className="flex gap-1 bg-muted/50 p-0.5 rounded-md">
                {(['all', 'CHECK_IN', 'RETENTION_BOOST'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setVariantFilter(f)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium rounded transition-all',
                      variantFilter === f
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'CHECK_IN' ? 'Check-in' : 'Retention'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const filtered = variantData.variants.filter((v: any) => {
                if (variantFilter === 'all') return true
                if (variantFilter === 'CHECK_IN') return v.variantId.includes('checkin')
                return v.variantId.includes('retention') || v.variantId.includes('winback')
              }).sort((a: any, b: any) => b.engagementScore - a.engagementScore)

              return (
                <>
                  {/* Table header */}
                  <div className="hidden sm:grid grid-cols-[1fr_70px_50px_100px_100px_60px] gap-2 px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b">
                    <span>Variant</span>
                    <span>Source</span>
                    <span>Sent</span>
                    <span>Open Rate</span>
                    <span>Click Rate</span>
                    <span>Score</span>
                  </div>

                  <div className="divide-y">
                    {filtered.map((v: any) => (
                      <div
                        key={v.variantId}
                        className="grid grid-cols-[1fr_70px_50px_100px_100px_60px] gap-2 items-center px-2 py-2 text-xs hover:bg-muted/30 transition-colors"
                      >
                        <span className="font-medium truncate">{getVariantLabel(v.variantId)}</span>
                        <span>
                          {isLLMVariant(v.variantId) ? (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                              LLM
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-gray-50 text-gray-600 border-gray-200">
                              Template
                            </Badge>
                          )}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{v.totalSent}</span>
                        <RateBar rate={v.openRate} color={getRateColor(v.openRate, 'open')} />
                        <RateBar rate={v.clickRate} color={getRateColor(v.clickRate, 'click')} />
                        <span className="font-bold tabular-nums">{(v.engagementScore * 100).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-6 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <span>Overall: <strong className="text-foreground">{(variantData.overallOpenRate * 100).toFixed(0)}%</strong> open</span>
                    <span><strong className="text-foreground">{(variantData.overallClickRate * 100).toFixed(0)}%</strong> click</span>
                    <span><strong className="text-foreground">{variantData.totalMessages}</strong> total messages</span>
                  </div>
                </>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {/* ══ Section B: Sequence Chains ══ */}
      {sequenceData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              Email Sequence Chains
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{sequenceData.summary.activeSequences}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{sequenceData.summary.completedSequences}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Completed</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{sequenceData.summary.avgStepsCompleted}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Avg Steps</p>
              </div>
            </div>

            {/* Type breakdown */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">By Type</p>
              {sequenceData.byType.map((t: any) => {
                const style = SEQ_TYPE_STYLES[t.type] || { label: t.type, className: 'bg-gray-100 text-gray-700' }
                const total = t.active + t.completed + t.exited
                return (
                  <div key={t.type} className="flex items-center gap-3">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium w-16 text-center', style.className)}>
                      {style.label}
                    </span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
                      {total > 0 && (
                        <>
                          <div className="bg-emerald-500 h-full" style={{ width: `${(t.completed / total) * 100}%` }} />
                          <div className="bg-blue-500 h-full" style={{ width: `${(t.active / total) * 100}%` }} />
                          <div className="bg-gray-400 h-full" style={{ width: `${(t.exited / total) * 100}%` }} />
                        </>
                      )}
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-20 text-right">
                      {t.active}a / {t.completed}c / {t.exited}e
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 text-[9px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Completed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Active</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-400" /> Exited</span>
              </div>
            </div>

            {/* Step funnel */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Step Funnel</p>
              <div className="flex items-center gap-1">
                {sequenceData.byStep.map((s: any, i: number) => {
                  const maxCount = Math.max(...sequenceData.byStep.map((x: any) => x.count), 1)
                  return (
                    <div key={s.step} className="flex items-center gap-1 flex-1">
                      <div className="flex-1">
                        <div className="flex items-end justify-between mb-0.5">
                          <span className="text-[10px] font-medium">Step {s.step}</span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">{(s.openRate * 100).toFixed(0)}% open</span>
                        </div>
                        <div className="h-8 bg-muted rounded relative overflow-hidden">
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-500 to-blue-400 rounded transition-all"
                            style={{ height: `${(s.count / maxCount) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                            {s.count}
                          </span>
                        </div>
                      </div>
                      {i < sequenceData.byStep.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Exit reasons */}
            {sequenceData.exitReasons.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Exit Reasons</p>
                <div className="space-y-1.5">
                  {sequenceData.exitReasons.map((r: any) => {
                    const maxCount = Math.max(...sequenceData.exitReasons.map((x: any) => x.count), 1)
                    const Icon = EXIT_ICONS[r.reason] || MessageSquare
                    return (
                      <div key={r.reason} className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs w-28 truncate">{r.label}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-muted-foreground/40"
                            style={{ width: `${(r.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums font-medium w-6 text-right">{r.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══ Section C: LLM vs Template Comparison ══ */}
      {variantData && variantData.variants.length > 0 && (() => {
        const llmVars = variantData.variants.filter((v: any) => isLLMVariant(v.variantId))
        const tplVars = variantData.variants.filter((v: any) => !isLLMVariant(v.variantId))

        if (llmVars.length === 0 || tplVars.length === 0) return null

        const llmSent = llmVars.reduce((s: number, v: any) => s + v.totalSent, 0)
        const tplSent = tplVars.reduce((s: number, v: any) => s + v.totalSent, 0)
        const llmOpened = llmVars.reduce((s: number, v: any) => s + v.totalOpened, 0)
        const tplOpened = tplVars.reduce((s: number, v: any) => s + v.totalOpened, 0)
        const llmClicked = llmVars.reduce((s: number, v: any) => s + v.totalClicked, 0)
        const tplClicked = tplVars.reduce((s: number, v: any) => s + v.totalClicked, 0)

        const llmOpenRate = llmSent > 0 ? llmOpened / llmSent : 0
        const tplOpenRate = tplSent > 0 ? tplOpened / tplSent : 0
        const llmClickRate = llmSent > 0 ? llmClicked / llmSent : 0
        const tplClickRate = tplSent > 0 ? tplClicked / tplSent : 0

        const openDiff = tplOpenRate > 0 ? Math.round(((llmOpenRate - tplOpenRate) / tplOpenRate) * 100) : 0
        const winner = llmOpenRate >= tplOpenRate ? 'LLM' : 'Template'

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                AI vs Template Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* LLM side */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">LLM</Badge>
                    <span className="text-xs text-muted-foreground">{llmSent} sent</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Open Rate</span>
                      <span className="font-bold">{(llmOpenRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Click Rate</span>
                      <span className="font-bold">{(llmClickRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                {/* Template side */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 border-gray-200">Template</Badge>
                    <span className="text-xs text-muted-foreground">{tplSent} sent</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Open Rate</span>
                      <span className="font-bold">{(tplOpenRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Click Rate</span>
                      <span className="font-bold">{(tplClickRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Winner badge */}
              <div className="mt-3 flex items-center justify-center">
                <Badge className={cn(
                  'text-xs px-3 py-1',
                  winner === 'LLM'
                    ? 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100'
                    : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100'
                )}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {winner} {openDiff > 0 ? `+${openDiff}%` : `${openDiff}%`} open rate
                </Badge>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
            {recentLogs.length > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {recentLogs.length} messages
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No outreach messages yet</p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-[100px_1fr_100px_80px_80px] gap-2 px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Date</span>
                <span>Member</span>
                <span>Type</span>
                <span>Channel</span>
                <span>Status</span>
              </div>

              {recentLogs
                .slice(activityPage * ACTIVITY_PER_PAGE, (activityPage + 1) * ACTIVITY_PER_PAGE)
                .map((log: any) => {
                  const typeStyle = TYPE_STYLES[log.type] || { label: log.type, className: 'bg-gray-100 text-gray-700' }
                  const statusStyle = STATUS_STYLES[log.status] || { label: log.status, className: 'bg-gray-100 text-gray-600' }

                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-[100px_1fr_100px_80px_80px] gap-2 items-center px-2 py-2 rounded-md hover:bg-muted/30 transition-colors text-xs"
                    >
                      <span className="text-muted-foreground tabular-nums">
                        {formatRelative(log.createdAt)}
                      </span>
                      <span className="font-medium truncate">{log.userName}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium border w-fit', typeStyle.className)}>
                        {typeStyle.label}
                      </span>
                      <span className="text-muted-foreground capitalize">
                        {log.channel || '—'}
                      </span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium w-fit', statusStyle.className)}>
                        {statusStyle.label}
                      </span>
                    </div>
                  )
                })}

              {/* Pagination */}
              {recentLogs.length > ACTIVITY_PER_PAGE && (() => {
                const totalPages = Math.ceil(recentLogs.length / ACTIVITY_PER_PAGE)
                return (
                  <div className="flex items-center justify-between pt-3 mt-2 border-t">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {activityPage * ACTIVITY_PER_PAGE + 1}–{Math.min((activityPage + 1) * ACTIVITY_PER_PAGE, recentLogs.length)} of {recentLogs.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActivityPage(p => Math.max(0, p - 1))}
                        disabled={activityPage === 0}
                        className="p-1 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setActivityPage(i)}
                          className={cn(
                            'w-6 h-6 text-[10px] font-medium rounded-md transition-colors',
                            activityPage === i
                              ? 'bg-foreground text-background'
                              : 'hover:bg-muted text-muted-foreground'
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setActivityPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={activityPage === totalPages - 1}
                        className="p-1 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
