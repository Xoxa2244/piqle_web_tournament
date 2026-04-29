'use client'

/**
 * Active Campaigns table — P4-T6 (lightweight).
 *
 * v1 columns: Name · Cohort · Channel · Sent · Status · Actions.
 * Open rate + booked $ columns ship in P5-T4 alongside the
 * attribution pipeline.
 *
 * Reads from `intelligence.listActiveCampaigns` (stub returning []
 * until P5-T2 lands the Campaign DB model). Empty state explains
 * the placeholder so directors see context, not a blank panel.
 */

import { Mail, MessageSquare, Pause, Play, StopCircle } from 'lucide-react'
import { useListActiveCampaigns } from '../_hooks/use-intelligence'

interface ActiveCampaignsTableProps {
  clubId: string
}

export function ActiveCampaignsTable({ clubId }: ActiveCampaignsTableProps) {
  const { data: campaigns = [] } = useListActiveCampaigns(clubId)

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
          Active Campaigns
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
          {(campaigns as any[]).length} running
        </span>
      </div>

      {(campaigns as any[]).length === 0 ? (
        <div className="rounded-xl px-4 py-8 text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
          <div className="text-sm font-semibold mb-1" style={{ color: 'var(--heading)' }}>
            No active campaigns yet
          </div>
          <p className="text-xs max-w-md mx-auto leading-relaxed">
            Launch one from the wizard above (or from an AI-Suggested cohort) and it will
            appear here with sent, open, and booked metrics. Open rate and $ booked land
            with the attribution pipeline in Phase 5.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>
                <th className="text-left py-2 pr-3" style={{ fontWeight: 600 }}>Name</th>
                <th className="text-left py-2 pr-3" style={{ fontWeight: 600 }}>Cohort</th>
                <th className="text-left py-2 pr-3" style={{ fontWeight: 600 }}>Channel</th>
                <th className="text-right py-2 pr-3" style={{ fontWeight: 600 }}>Sent</th>
                {/* P5-T4 metrics columns: */}
                <th className="text-right py-2 pr-3" style={{ fontWeight: 600 }}>Open %</th>
                <th className="text-right py-2 pr-3" style={{ fontWeight: 600 }}>Booked $</th>
                <th className="text-left py-2 pr-3" style={{ fontWeight: 600 }}>Status</th>
                <th className="text-right py-2" style={{ fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(campaigns as any[]).map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--heading)' }}>{c.name}</td>
                  <td className="py-2.5 pr-3" style={{ color: 'var(--t3)' }}>{c.cohortName ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--t3)' }}>
                      {c.channel?.includes('email') && <Mail className="w-3 h-3" />}
                      {c.channel?.includes('sms') && <MessageSquare className="w-3 h-3" />}
                      <span className="text-[11px]">{c.channel}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold" style={{ color: 'var(--heading)' }}>{c.sentCount ?? 0}</td>
                  {/* P5-T4: Open% + Booked $ — populated once Campaign model is live (P5-T2 deploy) */}
                  <td className="py-2.5 pr-3 text-right" style={{ color: c.openRate ? '#10B981' : 'var(--t4)', fontWeight: 600 }}>
                    {c.openRate ? `${Math.round(c.openRate * 100)}%` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right" style={{ color: c.bookedRevenueCents ? '#10B981' : 'var(--t4)', fontWeight: 600 }}>
                    {c.bookedRevenueCents
                      ? (c.bookedRevenueCents >= 100_000
                          ? `$${(c.bookedRevenueCents / 100_000).toFixed(1)}K`
                          : `$${Math.round(c.bookedRevenueCents / 100)}`)
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{
                        background: c.status === 'running' ? 'rgba(16,185,129,0.14)' : c.status === 'paused' ? 'rgba(245,158,11,0.14)' : 'rgba(148,163,184,0.14)',
                        color: c.status === 'running' ? '#10B981' : c.status === 'paused' ? '#F59E0B' : '#94A3B8',
                        fontWeight: 600,
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button title="Pause" className="p-1 rounded transition-colors hover:bg-[var(--hover)]" style={{ color: 'var(--t4)' }}>
                        {c.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                      <button title="Stop" className="p-1 rounded transition-colors hover:bg-[var(--hover)]" style={{ color: '#EF4444' }}>
                        <StopCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
