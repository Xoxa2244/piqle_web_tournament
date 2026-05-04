'use client'

import { useMemo } from 'react'
import { ChevronDown, Mail, MessageSquare } from 'lucide-react'
import { useListActiveCampaigns } from '../_hooks/use-intelligence'

interface CampaignHistorySectionProps {
  clubId: string
}

type CampaignRow = {
  id: string
  name: string
  cohortName?: string | null
  channel: 'email' | 'sms' | 'email+sms'
  sentCount?: number
  deliveredCount?: number
  openRate?: number
  bookedRevenueCents?: number
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed'
  completedAt?: string | Date | null
}

function formatRevenue(cents?: number) {
  if (!cents) return '—'
  return cents >= 100_000
    ? `$${(cents / 100_000).toFixed(1)}K`
    : `$${Math.round(cents / 100)}`
}

function formatOpenRate(campaign: CampaignRow) {
  if (!campaign.deliveredCount || campaign.deliveredCount <= 0) return '—'
  return `${Math.round((campaign.openRate ?? 0) * 100)}%`
}

function formatCompletedAt(value?: string | Date | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB')
}

export function CampaignHistorySection({ clubId }: CampaignHistorySectionProps) {
  const { data: campaigns = [] } = useListActiveCampaigns(clubId)

  const historyCampaigns = useMemo(
    () => (campaigns as CampaignRow[]).filter((campaign) => campaign.status === 'completed' || campaign.status === 'failed'),
    [campaigns],
  )
  const attributedRevenueCents = useMemo(
    () => historyCampaigns.reduce((sum, campaign) => sum + (campaign.bookedRevenueCents ?? 0), 0),
    [historyCampaigns],
  )

  return (
    <details
      className="rounded-2xl px-5 py-3 transition-all"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
        <span className="flex items-center gap-2">
          Campaign History
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--t4)' }} />
        </span>
        <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
          {historyCampaigns.length} past campaigns · {formatRevenue(attributedRevenueCents)} attributed
        </span>
      </summary>

      {historyCampaigns.length === 0 ? (
        <div className="mt-3 text-xs" style={{ color: 'var(--t3)' }}>
          Completed and failed campaigns will appear here once they finish or are stopped.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>
                <th className="py-2 pr-3 text-left" style={{ fontWeight: 600 }}>Name</th>
                <th className="py-2 pr-3 text-left" style={{ fontWeight: 600 }}>Cohort</th>
                <th className="py-2 pr-3 text-left" style={{ fontWeight: 600 }}>Channel</th>
                <th className="py-2 pr-3 text-right" style={{ fontWeight: 600 }}>Sent</th>
                <th className="py-2 pr-3 text-right" style={{ fontWeight: 600 }}>Open %</th>
                <th className="py-2 pr-3 text-right" style={{ fontWeight: 600 }}>Booked $</th>
                <th className="py-2 pr-3 text-left" style={{ fontWeight: 600 }}>Status</th>
                <th className="py-2 text-right" style={{ fontWeight: 600 }}>Ended</th>
              </tr>
            </thead>
            <tbody>
              {historyCampaigns.map((campaign) => (
                <tr key={campaign.id} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--heading)' }}>{campaign.name}</td>
                  <td className="py-2.5 pr-3" style={{ color: 'var(--t3)' }}>{campaign.cohortName ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--t3)' }}>
                      {campaign.channel.includes('email') && <Mail className="h-3 w-3" />}
                      {campaign.channel.includes('sms') && <MessageSquare className="h-3 w-3" />}
                      <span className="text-[11px]">{campaign.channel}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold" style={{ color: 'var(--heading)' }}>{campaign.sentCount ?? 0}</td>
                  <td className="py-2.5 pr-3 text-right" style={{ color: campaign.deliveredCount ? '#10B981' : 'var(--t4)', fontWeight: 600 }}>
                    {formatOpenRate(campaign)}
                  </td>
                  <td className="py-2.5 pr-3 text-right" style={{ color: campaign.bookedRevenueCents ? '#10B981' : 'var(--t4)', fontWeight: 600 }}>
                    {formatRevenue(campaign.bookedRevenueCents)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: campaign.status === 'failed' ? 'rgba(239,68,68,0.14)' : 'rgba(148,163,184,0.14)',
                        color: campaign.status === 'failed' ? '#EF4444' : '#94A3B8',
                        fontWeight: 600,
                      }}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right" style={{ color: 'var(--t4)' }}>
                    {formatCompletedAt(campaign.completedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
