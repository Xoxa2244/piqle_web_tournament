'use client'

/**
 * Campaigns Insights Drawer.
 *
 * Slide-in right panel that hosts the secondary analytics widgets
 * formerly inlined on the Campaigns page below the wizard area
 * (Send Volume chart + the by-type CampaignList "event log").
 * Moving them here keeps the main page focused on:
 *   1. AI-Recommended Campaigns
 *   2. Active Campaigns
 *   3. Campaign History
 * while admins who want deeper send-by-day or per-event analytics
 * are one click away.
 *
 * Pattern mirrors MembersChartsDrawer / MembersFilterDrawer
 * (motion/react slide, Esc to close, body-scroll lock).
 */

import React, { useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, BarChart3 } from 'lucide-react'
import { CampaignChart } from './iq-pages/campaigns/CampaignChart'
import { CampaignList } from './iq-pages/campaigns/CampaignList'

interface CampaignsInsightsDrawerProps {
  open: boolean
  onClose: () => void

  /** Optional header slot — used to host a compact KPI summary above
   *  the chart/list pair. State stays in the parent. */
  header?: React.ReactNode

  /** Aggregated daily send counts (status: sent | failed | skipped). */
  byDay: Array<{ date: string; sent: number; failed: number; skipped: number }>

  /** Legacy "campaigns by type+date" rollup. Will be replaced by the
   *  proper Campaign model history once Phase 5 fills it out. */
  campaigns: any[]
  campaignListLoading?: boolean
  clubId: string
  advisorDrafts?: any[]
  outreachMode: any
  rolloutStatus: any
  pilotHealth?: any
  onCampaignClick?: (campaign: any) => void
}

export function CampaignsInsightsDrawer({
  open,
  onClose,
  header,
  byDay,
  campaigns,
  campaignListLoading,
  clubId,
  advisorDrafts,
  outreachMode,
  rolloutStatus,
  pilotHealth,
  onCampaignClick,
}: CampaignsInsightsDrawerProps) {
  // Esc closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const hasVolume = byDay && byDay.length > 0
  const hasList = campaigns && campaigns.length > 0

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="ci-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.aside
            key="ci-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 z-50 h-screen flex flex-col"
            style={{
              width: 'min(820px, 100vw)',
              background: 'var(--bg, #0B0B14)',
              borderLeft: '1px solid var(--card-border)',
              boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
            }}
            onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
            aria-label="Campaigns insights panel"
          >
            <div
              className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
              style={{ background: 'var(--bg, #0B0B14)', borderBottom: '1px solid var(--card-border)' }}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--t3)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                  Campaigns insights
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close insights"
                className="p-2 rounded-lg transition-colors hover:bg-[var(--hover)]"
                style={{ color: 'var(--t3)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {header}

              {!hasVolume && !hasList && (
                <div
                  className="rounded-2xl p-6 text-center"
                  style={{ background: 'var(--card-bg)', border: '1px dashed var(--card-border)' }}
                >
                  <BarChart3 className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--t4)' }} />
                  <div className="text-sm" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                    No analytics yet
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                    Charts and the event log fill in once the first campaigns send.
                  </p>
                </div>
              )}

              {hasVolume && (
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--heading)' }}>Send Volume</h3>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--t4)' }}>
                    Daily send counts. Purple = delivered, red = failed.
                  </p>
                  <CampaignChart byDay={byDay} />
                </div>
              )}

              {hasList && (
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--heading)' }}>Campaign event log</h3>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--t4)' }}>
                    Legacy view — campaign-events grouped by type and day. Folds away once the Campaign model history fills out.
                  </p>
                  <CampaignList
                    campaigns={campaigns}
                    isLoading={!!campaignListLoading}
                    clubId={clubId}
                    advisorDrafts={advisorDrafts ?? []}
                    outreachMode={outreachMode}
                    rolloutStatus={rolloutStatus}
                    pilotHealth={pilotHealth}
                    onCampaignClick={onCampaignClick}
                  />
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
