'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { Puzzle } from 'lucide-react'
import type { ReactNode } from 'react'

export interface IntegrationAnomalyHistory {
  status: 'new' | 'recurring' | 'chronic'
  label: string
  summary: string
  daysActive: number
  incidentCount: number
  returnedCount: number
  firstSeenAt: string | Date | null
  lastSeenAt: string | Date | null
}

export interface IntegrationAnomalyItem {
  id: string
  severity: 'healthy' | 'watch' | 'at_risk'
  category: 'connector' | 'data' | 'import'
  title: string
  summary: string
  evidenceLabel: string
  nextBestMove: string
  actionLabel: string
  playbookPrompt: string
  history?: IntegrationAnomalyHistory | null
}

export interface IntegrationAnomalySnapshot {
  status: 'healthy' | 'watch' | 'at_risk'
  summary: string
  anomalyCount: number
  atRiskCount: number
  watchCount: number
  recurringCount: number
  chronicCount: number
  items: IntegrationAnomalyItem[]
  suggested: IntegrationAnomalyItem[]
}

export type IntegrationAnomalyDecision = 'accepted' | 'declined' | 'not_now'

export interface IntegrationAnomalyTodoItem {
  id: string
  title: string
  description: string
  ctaLabel: string
  href: string
  tone: 'default' | 'warn' | 'danger' | 'success'
  count?: string | number | null
  decisionBucket?: string
  decisionMetadata?: Record<string, unknown>
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {children}
    </div>
  )
}

export const INTEGRATION_ANOMALY_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

export const INTEGRATION_RECURRENCE_STYLES: Record<'new' | 'recurring' | 'chronic', { bg: string; color: string }> = {
  new: { bg: 'rgba(59,130,246,0.14)', color: '#3B82F6' },
  recurring: { bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  chronic: { bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

export function getTopIntegrationAnomalies(queue?: IntegrationAnomalySnapshot | null) {
  const topIntegrationAtRisk = queue?.suggested.find((item) => item.severity === 'at_risk') || null
  const topIntegrationWatch = queue?.suggested.find((item) => item.severity === 'watch' && item.id !== topIntegrationAtRisk?.id)
    || (!topIntegrationAtRisk ? queue?.suggested.find((item) => item.severity === 'watch') || null : null)

  return {
    topIntegrationAtRisk,
    topIntegrationWatch,
  }
}

export function buildIntegrationAnomalyTodoItem(args: {
  anomaly: IntegrationAnomalyItem
  clubId: string
  title?: string
  description?: string
}): IntegrationAnomalyTodoItem {
  const { anomaly, clubId } = args

  return {
    id: anomaly.id,
    title: args.title || anomaly.title,
    description: args.description || `${anomaly.summary}${anomaly.history?.summary ? ` ${anomaly.history.summary}` : ''} ${anomaly.nextBestMove}`.trim(),
    ctaLabel: anomaly.actionLabel,
    href: anomaly.playbookPrompt
      ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(anomaly.playbookPrompt)}`
      : `/clubs/${clubId}/intelligence/integrations`,
    tone: anomaly.severity === 'at_risk' ? 'danger' : anomaly.severity === 'watch' ? 'warn' : 'default',
    count: anomaly.evidenceLabel,
    decisionBucket: 'integration_anomalies',
    decisionMetadata: {
      category: anomaly.category,
      severity: anomaly.severity,
      evidenceLabel: anomaly.evidenceLabel,
      prompt: anomaly.playbookPrompt,
      source: 'agentiq_daily_task',
    },
  }
}

export function IntegrationWatchlistCard(props: {
  clubId: string
  isDark: boolean
  queue: IntegrationAnomalySnapshot
  decisionMap: Record<string, IntegrationAnomalyDecision>
  delay?: number
}) {
  const { clubId, isDark, queue, decisionMap, delay = 0.105 } = props

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4" style={{ color: queue.status === 'at_risk' ? '#EF4444' : '#F59E0B' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                Integration Watchlist
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
              {queue.summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {queue.recurringCount > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
                {queue.recurringCount} recurring
                {queue.chronicCount > 0 ? ` • ${queue.chronicCount} chronic` : ''}
              </span>
            )}
            <span
              className="text-[11px] px-3 py-1.5 rounded-full font-medium"
              style={{
                background: INTEGRATION_ANOMALY_STYLES[queue.status]?.bg || 'rgba(245,158,11,0.14)',
                color: INTEGRATION_ANOMALY_STYLES[queue.status]?.color || '#F59E0B',
              }}
            >
              {INTEGRATION_ANOMALY_STYLES[queue.status]?.label || 'Watch'}
            </span>
            <Link
              href={`/clubs/${clubId}/intelligence/integrations`}
              className="text-[11px] px-3 py-1.5 rounded-full font-medium"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--t3)',
                border: '1px solid var(--card-border)',
                textDecoration: 'none',
              }}
            >
              Open integrations
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {queue.suggested.slice(0, 2).map((item) => {
            const decision = decisionMap[item.id]
            const decisionStyle = decision
              ? decision === 'accepted'
                ? { bg: 'rgba(16,185,129,0.14)', color: '#10B981', label: 'Accepted' }
                : decision === 'declined'
                  ? { bg: 'rgba(239,68,68,0.14)', color: '#EF4444', label: 'Declined' }
                  : { bg: 'rgba(245,158,11,0.14)', color: '#F59E0B', label: 'Not now' }
              : null

            return (
              <div
                key={item.id}
                className="rounded-xl p-3"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: '1px solid var(--card-border)',
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                      {item.title}
                    </div>
                    {item.history ? (
                      <div className="mt-1 inline-flex items-center gap-1">
                        <span
                          className="text-[10px] px-2 py-1 rounded-full font-medium"
                          style={{
                            background: INTEGRATION_RECURRENCE_STYLES[item.history.status].bg,
                            color: INTEGRATION_RECURRENCE_STYLES[item.history.status].color,
                          }}
                        >
                          {item.history.label}
                        </span>
                      </div>
                    ) : null}
                    <div className="text-[11px] mt-1" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                      {item.summary}
                    </div>
                    {item.history ? (
                      <div className="text-[10px] mt-2" style={{ color: 'var(--t4)', lineHeight: 1.5 }}>
                        {item.history.summary}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className="text-[10px] px-2 py-1 rounded-full font-medium"
                      style={{
                        background: INTEGRATION_ANOMALY_STYLES[item.severity]?.bg || 'rgba(245,158,11,0.14)',
                        color: INTEGRATION_ANOMALY_STYLES[item.severity]?.color || '#F59E0B',
                      }}
                    >
                      {INTEGRATION_ANOMALY_STYLES[item.severity]?.label || 'Watch'}
                    </span>
                    {decisionStyle ? (
                      <span
                        className="text-[10px] px-2 py-1 rounded-full font-medium"
                        style={{ background: decisionStyle.bg, color: decisionStyle.color }}
                      >
                        {decisionStyle.label}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-[11px]" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--heading)' }}>{item.evidenceLabel}</span>
                  {' · '}
                  {item.nextBestMove}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    href={`/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(item.playbookPrompt)}`}
                    className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: 'rgba(99,102,241,0.10)',
                      color: '#6366F1',
                      border: '1px solid rgba(99,102,241,0.2)',
                      textDecoration: 'none',
                    }}
                  >
                    {decision === 'accepted' ? 'Open playbook' : item.actionLabel}
                  </Link>
                  <Link
                    href={`/clubs/${clubId}/intelligence/integrations`}
                    className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--t3)',
                      border: '1px solid var(--card-border)',
                      textDecoration: 'none',
                    }}
                  >
                    Review in integrations
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </motion.div>
  )
}
