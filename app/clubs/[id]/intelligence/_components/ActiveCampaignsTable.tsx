'use client'

import { useMemo, useState } from 'react'
import { Mail, MessageSquare, Pause, Play, StopCircle, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { toast } from '@/components/ui/use-toast'
import { useListActiveCampaigns } from '../_hooks/use-intelligence'

interface ActiveCampaignsTableProps {
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
  sendFormat?: 'one_time' | 'sequence' | 'recurring'
}

function formatRevenue(cents?: number) {
  if (!cents) return '—'
  return cents >= 100_000
    ? `$${(cents / 100_000).toFixed(1)}K`
    : `$${Math.round(cents / 100)}`
}

function renderOpenRate(campaign: CampaignRow) {
  if (!campaign.deliveredCount || campaign.deliveredCount <= 0) return '—'
  return `${Math.round((campaign.openRate ?? 0) * 100)}%`
}

function isPauseableCampaign(campaign: CampaignRow) {
  return campaign.sendFormat !== 'one_time'
    && (campaign.status === 'running' || campaign.status === 'scheduled' || campaign.status === 'paused')
}

export function ActiveCampaignsTable({ clubId }: ActiveCampaignsTableProps) {
  const { data: campaigns = [] } = useListActiveCampaigns(clubId)
  const utils = trpc.useUtils()
  const [campaignToStop, setCampaignToStop] = useState<CampaignRow | null>(null)

  const activeCampaigns = useMemo(
    () => (campaigns as CampaignRow[]).filter((campaign) => ['running', 'scheduled', 'paused'].includes(campaign.status)),
    [campaigns],
  )

  const togglePauseMutation = trpc.intelligence.toggleCampaignPause.useMutation({
    onSuccess: async (result) => {
      await utils.intelligence.listActiveCampaigns.invalidate({ clubId })
      toast({
        title: result.status === 'paused' ? 'Campaign paused' : 'Campaign resumed',
        description: result.status === 'paused'
          ? 'Future sends are paused until you resume this campaign.'
          : 'This campaign is active again.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Could not update campaign',
        description: error.message,
      })
    },
  })

  const stopCampaignMutation = trpc.intelligence.stopCampaign.useMutation({
    onSuccess: async () => {
      await utils.intelligence.listActiveCampaigns.invalidate({ clubId })
      setCampaignToStop(null)
      toast({
        title: 'Campaign stopped',
        description: 'This campaign was moved to Campaign History as completed.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Could not stop campaign',
        description: error.message,
      })
    },
  })

  return (
    <>
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
            Active Campaigns
          </h2>
          <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
            {activeCampaigns.length} active
          </span>
        </div>

        {activeCampaigns.length === 0 ? (
          <div className="rounded-xl px-4 py-8 text-center" style={{ background: 'var(--subtle)', color: 'var(--t4)' }}>
            <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--heading)' }}>
              No active campaigns
            </div>
            <p className="mx-auto max-w-md text-xs leading-relaxed">
              Running, scheduled, and paused campaigns appear here. Completed campaigns move into
              Campaign History below.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                  <th className="py-2 text-right" style={{ fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeCampaigns.map((campaign) => {
                  const isPauseable = isPauseableCampaign(campaign)
                  const isPausePending = togglePauseMutation.isPending && togglePauseMutation.variables?.campaignId === campaign.id
                  const isStopPending = stopCampaignMutation.isPending && stopCampaignMutation.variables?.campaignId === campaign.id

                  return (
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
                        {renderOpenRate(campaign)}
                      </td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: campaign.bookedRevenueCents ? '#10B981' : 'var(--t4)', fontWeight: 600 }}>
                        {formatRevenue(campaign.bookedRevenueCents)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            background:
                              campaign.status === 'running'
                                ? 'rgba(16,185,129,0.14)'
                                : campaign.status === 'paused'
                                  ? 'rgba(245,158,11,0.14)'
                                  : 'rgba(59,130,246,0.14)',
                            color:
                              campaign.status === 'running'
                                ? '#10B981'
                                : campaign.status === 'paused'
                                  ? '#F59E0B'
                                  : '#60A5FA',
                            fontWeight: 600,
                          }}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isPauseable ? (
                            <button
                              type="button"
                              title={campaign.status === 'paused' ? 'Resume campaign' : 'Pause campaign'}
                              onClick={() => togglePauseMutation.mutate({ clubId, campaignId: campaign.id })}
                              disabled={isPausePending || isStopPending}
                              className="rounded p-1 transition-colors hover:bg-[var(--hover)] disabled:opacity-40"
                              style={{ color: campaign.status === 'paused' ? '#10B981' : 'var(--t4)' }}
                            >
                              {campaign.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title="Stop campaign"
                            onClick={() => setCampaignToStop(campaign)}
                            disabled={isPausePending || isStopPending}
                            className="rounded p-1 transition-colors hover:bg-[var(--hover)] disabled:opacity-40"
                            style={{ color: '#EF4444' }}
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {campaignToStop && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ background: 'rgba(5, 8, 20, 0.62)', backdropFilter: 'blur(8px)' }}
          onClick={() => {
            if (!stopCampaignMutation.isPending) setCampaignToStop(null)
          }}
        >
          <div
            className="w-full max-w-[520px] rounded-[28px] p-5 sm:p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(17,24,39,0.98), rgba(11,11,20,0.98))',
              border: '1px solid rgba(239,68,68,0.18)',
              boxShadow: '0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(248,113,113,0.20), rgba(239,68,68,0.10))',
                  border: '1px solid rgba(248,113,113,0.28)',
                }}
              >
                <AlertTriangle className="h-5 w-5" style={{ color: '#F87171' }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[24px] font-semibold leading-tight" style={{ color: 'var(--heading)' }}>
                  Stop this campaign?
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--t3)' }}>
                  <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{campaignToStop.name}</span> will stop sending and move to Campaign History with status <strong>completed</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCampaignToStop(null)}
                disabled={stopCampaignMutation.isPending}
                className="rounded-2xl px-4 py-3 text-sm transition-all disabled:opacity-50"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--heading)',
                  fontWeight: 600,
                }}
              >
                Keep campaign
              </button>
              <button
                type="button"
                onClick={() => stopCampaignMutation.mutate({ clubId, campaignId: campaignToStop.id })}
                disabled={stopCampaignMutation.isPending}
                className="rounded-2xl px-4 py-3 text-sm text-white transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #EF4444, #F97316)',
                  boxShadow: '0 10px 30px rgba(239,68,68,0.28)',
                  fontWeight: 700,
                }}
              >
                {stopCampaignMutation.isPending ? 'Stopping…' : 'Stop campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
