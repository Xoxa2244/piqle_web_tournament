'use client'

/**
 * AI Revenue Attribution Tile
 *
 * "The money metric" for the intelligence dashboard — shows revenue
 * linked to AI recommendations over the rolling 30-day window, plus
 * a defensible conservative-incremental estimate and a by-type
 * breakdown.
 *
 * Designed to be big and prominent on the main dashboard so it's the
 * first thing a club owner (or VC) sees. Numbers update as the
 * attribution backfill cron runs (every 15 min).
 */

import { DollarSign, TrendingUp, Info, Power } from 'lucide-react'
import { useAIRevenueAttribution } from '../_hooks/use-intelligence'

interface Props {
  clubId: string
}

const TYPE_LABELS: Record<string, string> = {
  SLOT_FILLER: 'Slot Filler',
  REACTIVATION: 'Reactivation',
  CHECK_IN: 'Check-in',
  RETENTION_BOOST: 'Retention Boost',
  EVENT_INVITE: 'Event Invite',
  REBOOKING: 'Re-booking',
  NEW_MEMBER_WELCOME: 'New Member Welcome',
}

function formatUsd(value: number): string {
  if (value >= 10_000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function AIRevenueTile({ clubId }: Props) {
  const { data, isLoading } = useAIRevenueAttribution(clubId, 30)

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted/40 rounded mb-4" />
        <div className="h-12 w-32 bg-muted/40 rounded mb-3" />
        <div className="h-4 w-64 bg-muted/40 rounded" />
      </div>
    )
  }

  if (!data) return null

  const revenueLabel = formatUsd(data.attributedRevenueUsd || 0)
  const hasData = (data.attributedBookingsCount || 0) > 0
  // `liveMode=false` means the agent is still sending to test addresses —
  // numbers would be 0 anyway because the attribution service now filters
  // synthetic users, but we show an explicit off-state so admins know why.
  // Undefined = demo-mode mock (no liveMode field in mock); treat as live.
  const isLive = data.liveMode !== false

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card p-6 overflow-hidden">
      {/* Success-tone gradient glow — "money" feels green */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-[0.08] blur-3xl bg-emerald-500" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                AI-Attributed Revenue
              </h3>
              <p className="text-xs text-muted-foreground/80">
                Last {data.days} days
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-help"
            title="Linked via 72h click-to-book deep links, same-session match, or per-type attribution windows (7–30d). Not a causal estimate — see 'Conservative incremental' below for a 20% industry-benchmark floor."
          >
            <Info className="h-3.5 w-3.5" />
            <span>Methodology</span>
          </div>
        </div>

        {/* Live-mode off state — shown before any numbers so it's the
            first thing an admin sees. Attribution on test sends would
            produce noise, so we hard-gate the UI here. */}
        {!isLive ? (
          <div className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <Power className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Live mode is off
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              AI recommendations currently fire to test addresses only
              (<code className="text-xs px-1 py-0.5 rounded bg-muted/60">demo.iqsport.ai</code>,{' '}
              <code className="text-xs px-1 py-0.5 rounded bg-muted/60">placeholder.iqsport.ai</code>).
              Switch on Live Mode in Settings → Intelligence to start sending
              to real members — attributed revenue will appear here within 15
              minutes of the first conversion.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Attribution pipeline is already live and ready: deep-link via
              click webhook, direct session match, or per-type time windows.
            </p>
          </div>
        ) : hasData ? (
          <>
            <div className="flex items-baseline gap-4 mb-1">
              <span className="text-4xl font-bold tracking-tight">
                {revenueLabel}
              </span>
              {data.roiMultiple != null && (
                <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                  {data.roiMultiple}× ROI
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              {data.attributedBookingsCount} linked bookings · AI spend ${data.aiSpendUsd.toFixed(2)}
              {' · '}
              <span title="Industry-standard 20% incremental lift for email marketing. Use this number when a cautious audience (e.g. VC) pushes back on correlation vs. causation.">
                Conservative incremental: {formatUsd(data.conservativeIncrementalUsd)}
              </span>
            </p>

            {/* Breakdown by engine type */}
            {data.byType && data.byType.length > 0 && (
              <div className="border-t border-border/50 pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2.5">
                  Revenue by engine
                </p>
                <div className="space-y-1.5">
                  {data.byType.slice(0, 5).map((row: { type: string; bookings: number; revenueUsd: number }) => (
                    <div key={row.type} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {TYPE_LABELS[row.type] || row.type}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatUsd(row.revenueUsd)}
                        <span className="text-xs text-muted-foreground ml-1.5">
                          ({row.bookings})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Method confidence strip — surfaces attribution strength */}
            {data.byMethod && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Attribution confidence
                </p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Deep link: {data.byMethod.deep_link.bookings}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Session match: {data.byMethod.direct_session_match.bookings}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Time window: {data.byMethod.time_window.bookings}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          // Empty state — club hasn't had AI-driven bookings yet in the window
          <div className="py-4">
            <div className="text-3xl font-bold tracking-tight mb-1">$0</div>
            <p className="text-sm text-muted-foreground mb-3">
              No AI-attributed bookings yet in the last {data.days} days.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Attribution updates every 15 minutes from the backfill cron.
              Once slot-filler invites or reactivation messages drive bookings,
              linked revenue will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
