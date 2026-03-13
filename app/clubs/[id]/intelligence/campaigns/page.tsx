'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Send, Calendar, AlertTriangle, Zap, TrendingUp,
  Mail, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useCampaignAnalytics, useIsDemo } from '../_hooks/use-intelligence'

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
            {/* Label - show every 5th day */}
            {(data.indexOf(d) % 5 === 0 || data.indexOf(d) === data.length - 1) && (
              <span className={cn('text-[9px] tabular-nums', isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground')}>
                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
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

// ══════════ MAIN PAGE ══════════

export default function CampaignsPage() {
  const params = useParams()
  const clubId = params.id as string
  const isDemo = useIsDemo()
  const [days, setDays] = useState(30)

  const { data, isLoading, error } = useCampaignAnalytics(clubId, days)

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

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
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

              {recentLogs.map((log: any) => {
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
