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

import { useState } from 'react'
import { Mail, MessageSquare, Pause, Play, StopCircle, Layers, Repeat, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useListActiveCampaigns } from '../_hooks/use-intelligence'

interface ActiveCampaignsTableProps {
  clubId: string
}

export function ActiveCampaignsTable({ clubId }: ActiveCampaignsTableProps) {
  const { data: campaigns = [] } = useListActiveCampaigns(clubId)
  const utils = trpc.useUtils()
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Stop confirmation: { id, name } when admin clicked Stop, null otherwise.
  // Two-step: first click opens this modal, second click in modal fires.
  const [stopTarget, setStopTarget] = useState<{ id: string; name: string } | null>(null)

  const pauseMutation = trpc.intelligence.pauseCampaign.useMutation({
    onSettled: () => {
      setPendingId(null)
      utils.intelligence.listActiveCampaigns.invalidate({ clubId }).catch(() => {})
    },
  })
  const resumeMutation = trpc.intelligence.resumeCampaign.useMutation({
    onSettled: () => {
      setPendingId(null)
      utils.intelligence.listActiveCampaigns.invalidate({ clubId }).catch(() => {})
    },
  })
  const stopMutation = trpc.intelligence.stopCampaign.useMutation({
    onSettled: () => {
      setPendingId(null)
      setStopTarget(null)
      utils.intelligence.listActiveCampaigns.invalidate({ clubId }).catch(() => {})
    },
  })

  const togglePause = (id: string, status: string) => {
    if (pendingId) return
    setPendingId(id)
    if (status === 'paused') {
      resumeMutation.mutate({ clubId, campaignId: id })
    } else {
      pauseMutation.mutate({ clubId, campaignId: id })
    }
  }

  const confirmStop = () => {
    if (!stopTarget) return
    setPendingId(stopTarget.id)
    stopMutation.mutate({ clubId, campaignId: stopTarget.id })
  }

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
                  <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--heading)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{c.name}</span>
                      {c.format === 'sequence' && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                          style={{ background: 'rgba(139,92,246,0.16)', color: '#A78BFA', fontWeight: 700 }}
                          title={`Sequence campaign — ${c.totalSteps} steps. "Sent" counts each step delivery, so it can exceed the cohort size.`}
                        >
                          <Layers className="w-2.5 h-2.5" />
                          Sequence · {c.totalSteps} step{c.totalSteps === 1 ? '' : 's'}
                        </span>
                      )}
                      {c.format === 'recurring' && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                          style={{ background: 'rgba(6,182,212,0.18)', color: '#67E8F9', fontWeight: 700 }}
                          title={c.recurringDescription ? `${c.recurringDescription}. Cohort is re-evaluated each run; only members who match at run-time receive the email.` : 'Recurring campaign'}
                        >
                          <Repeat className="w-2.5 h-2.5" />
                          {c.recurringDescription ?? 'Recurring'}
                        </span>
                      )}
                    </div>
                  </td>
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
                      <button
                        title={c.status === 'paused' ? 'Resume' : 'Pause'}
                        onClick={() => togglePause(c.id, c.status)}
                        disabled={pendingId === c.id}
                        className="p-1 rounded transition-colors hover:bg-[var(--hover)] disabled:opacity-40"
                        style={{ color: 'var(--t4)' }}
                      >
                        {pendingId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : c.status === 'paused' ? (
                          <Play className="w-3.5 h-3.5" />
                        ) : (
                          <Pause className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        title="Stop campaign permanently"
                        onClick={() => setStopTarget({ id: c.id, name: c.name })}
                        disabled={pendingId === c.id || c.status === 'completed' || c.status === 'failed'}
                        className="p-1 rounded transition-colors hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: '#EF4444' }}
                      >
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

      {/* Stop confirmation modal — irreversible action, so we ask twice. */}
      {stopTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => !pendingId && setStopTarget(null)}
        >
          <div
            className="rounded-2xl p-5 max-w-md w-full"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.16)' }}>
                <StopCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--heading)' }}>Stop campaign?</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                  &ldquo;{stopTarget.name}&rdquo; will be marked completed. Pending recipients will <strong>not</strong> receive any further emails.
                  This cannot be undone — you&apos;d have to launch a new campaign.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setStopTarget(null)}
                disabled={pendingId === stopTarget.id}
                className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
                style={{ background: 'var(--subtle)', color: 'var(--heading)', fontWeight: 600, border: '1px solid var(--card-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStop}
                disabled={pendingId === stopTarget.id}
                className="px-3 py-1.5 rounded-lg text-xs text-white flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: '#EF4444', fontWeight: 600 }}
              >
                {pendingId === stopTarget.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Stopping…
                  </>
                ) : (
                  'Stop campaign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
