'use client'

/**
 * AI Insight Ribbon — P2-T5.
 *
 * Renders a single high-impact insight at the top of the Members page,
 * below the KPI strip. Powered by `intelligence.getMembersAIInsight`,
 * which returns at most one rule-based insight (no LLM in v1).
 *
 * Behaviour:
 *   - If procedure returns null → ribbon hidden.
 *   - "Create cohort" → creates a ClubCohort with the suggested filters
 *     (uses existing trpc.intelligence.createCohort mutation).
 *   - "Dismiss" → hides this insightId for 7 days via localStorage.
 *
 * See SPEC §4 P2-T5 / PLAN §3.5.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, Check, X, Users, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface AIInsightRibbonProps {
  clubId: string
}

const DISMISS_TTL_MS = 7 * 86400000 // 7 days

function isDismissed(insightId: string): boolean {
  if (typeof window === 'undefined') return false
  const raw = window.localStorage.getItem(`iq:members:insight:dismissed:${insightId}`)
  if (!raw) return false
  const ts = parseInt(raw, 10)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < DISMISS_TTL_MS
}

function setDismissed(insightId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`iq:members:insight:dismissed:${insightId}`, String(Date.now()))
}

export function AIInsightRibbon({ clubId }: AIInsightRibbonProps) {
  const insightQuery = (trpc.intelligence as any).getMembersAIInsight?.useQuery?.(
    { clubId },
    { enabled: !!clubId, staleTime: 5 * 60 * 1000 }
  )

  const insight = insightQuery?.data
  const [createdName, setCreatedName] = useState<string | null>(null)
  const [localDismissed, setLocalDismissed] = useState(false)

  // Initial hydration of dismissed state when insight arrives
  useEffect(() => {
    if (!insight) return
    setLocalDismissed(isDismissed(insight.insightId))
  }, [insight?.insightId])

  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: (cohort: any) => {
      setCreatedName(cohort?.name || insight?.suggestedCohortName || 'Cohort')
    },
  })

  const handleDismiss = () => {
    if (insight) setDismissed(insight.insightId)
    setLocalDismissed(true)
  }

  const handleCreate = () => {
    if (!insight) return
    createMutation.mutate({
      clubId,
      name: insight.suggestedCohortName,
      description: insight.cause,
      filters: insight.suggestedFilters as any,
    })
  }

  const tone = useMemo(() => {
    if (!insight) return null
    return insight.severity === 'warning'
      ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)', accent: '#F59E0B' }
      : { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.22)', accent: '#A78BFA' }
  }, [insight?.severity])

  if (!insight || localDismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-2xl px-5 py-3 flex items-start gap-3 flex-wrap"
        style={{
          background: tone?.bg,
          border: `1px solid ${tone?.border}`,
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: tone?.accent }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tone?.accent, letterSpacing: '0.12em' }}>
              AI Insight
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
              {insight.title}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
            {insight.cause}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {createdName ? (
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}
            >
              <Check className="w-3.5 h-3.5" />
              Saved &ldquo;{createdName}&rdquo;
            </div>
          ) : (
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-[1.02] disabled:opacity-50"
              style={{ background: tone?.accent, color: '#FFFFFF', fontWeight: 600 }}
            >
              {createMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Users className="w-3.5 h-3.5" />}
              {insight.suggestedAction}
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label="Dismiss insight for 7 days"
            title="Dismiss for 7 days"
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--hover)]"
            style={{ color: 'var(--t4)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
