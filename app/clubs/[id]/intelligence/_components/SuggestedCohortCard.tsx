'use client'

/**
 * AI-Suggested Cohort card — P3-T2.
 *
 * Renders one cohort suggestion (output of one cohort-generators/* function)
 * with two CTAs:
 *   • "Create cohort" — mutates trpc.intelligence.createCohort with a
 *     `userId IN [...]` filter, persisting the suggestion as a saved cohort.
 *   • "→ Campaign"   — disabled in P3; will open the Phase-4 wizard
 *     pre-filled with this cohort once P4-T1 lands.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { Sparkles, Loader2, Check, ArrowRight, DollarSign, Users } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface SuggestedCohortCardProps {
  clubId: string
  suggestion: {
    id: string
    generatorKey: string
    name: string
    description: string
    memberCount: number
    estImpactCents: number
    suggestedAction: string
    suggestedTemplateKey: string
    userIds: string[]
    emoji?: string
  }
  /** P5-T5 fix #5: parent callback to open the Campaign Wizard with this
   *  cohort pre-selected. When omitted, the "→ Campaign" button is disabled. */
  onLaunchCampaign?: (suggestion: SuggestedCohortCardProps['suggestion']) => void
}

const PALETTE_BY_KEY: Record<string, { gradient: string; accent: string }> = {
  renewal_in_14d:        { gradient: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.08))', accent: '#F59E0B' },
  lost_evening_players:  { gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))', accent: '#EF4444' },
  new_and_engaged:       { gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(52,211,153,0.08))', accent: '#10B981' },
}

function formatImpact(cents: number): string {
  const dollars = Math.round(cents / 100)
  if (dollars >= 1000) return `~$${(dollars / 1000).toFixed(1)}K`
  return `~$${dollars}`
}

export function SuggestedCohortCard({ clubId, suggestion, onLaunchCampaign }: SuggestedCohortCardProps) {
  const [savedName, setSavedName] = useState<string | null>(null)
  const palette = PALETTE_BY_KEY[suggestion.generatorKey] ?? {
    gradient: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.08))',
    accent: '#8B5CF6',
  }

  // P5-T5 fix #5: track which CTA invoked the mutation so onSuccess can
  // either show the saved-confirmation OR hand off to the Campaign Wizard.
  const [pendingAction, setPendingAction] = useState<'save' | 'campaign'>('save')

  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: (cohort: any) => {
      if (pendingAction === 'campaign' && onLaunchCampaign) {
        onLaunchCampaign({ ...suggestion, id: cohort?.id ?? suggestion.id })
      } else {
        setSavedName(cohort?.name ?? suggestion.name)
      }
    },
  })

  const handleCreate = () => {
    if (suggestion.userIds.length === 0) return
    setPendingAction('save')
    createMutation.mutate({
      clubId,
      name: suggestion.name,
      description: suggestion.description,
      filters: [{ field: 'userId', op: 'in' as const, value: suggestion.userIds }],
    })
  }

  const handleLaunchCampaign = () => {
    if (!onLaunchCampaign) return
    if (suggestion.userIds.length === 0) {
      // Demo / empty userIds — still let the wizard pre-fill name etc.
      onLaunchCampaign(suggestion)
      return
    }
    setPendingAction('campaign')
    createMutation.mutate({
      clubId,
      name: suggestion.name,
      description: suggestion.description,
      filters: [{ field: 'userId', op: 'in' as const, value: suggestion.userIds }],
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: palette.gradient,
        border: `1px solid ${palette.accent}33`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: `${palette.accent}18` }}
          >
            {suggestion.emoji ?? '🎯'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                {suggestion.name}
              </h3>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${palette.accent}22`, color: palette.accent }}
              >
                {suggestion.memberCount} member{suggestion.memberCount === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--t3)' }}>
              {suggestion.description}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div
            className="inline-flex items-center gap-1 text-xs font-bold"
            style={{ color: palette.accent }}
          >
            <DollarSign className="w-3 h-3" />
            <span>{formatImpact(suggestion.estImpactCents)}/mo</span>
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t4)' }}>
            recovery potential
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--t3)' }}
        >
          <Sparkles className="w-3 h-3" /> Suggested: {suggestion.suggestedAction}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap justify-end">
        {savedName ? (
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}
          >
            <Check className="w-3.5 h-3.5" />
            Saved &ldquo;{savedName}&rdquo;
          </div>
        ) : (
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending || suggestion.userIds.length === 0}
            title={suggestion.userIds.length === 0 ? 'Demo cohort — userIds list empty' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: palette.accent, color: '#FFFFFF' }}
          >
            {createMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Users className="w-3.5 h-3.5" />}
            Create cohort
          </button>
        )}

        <button
          onClick={handleLaunchCampaign}
          disabled={!onLaunchCampaign || createMutation.isPending}
          title={onLaunchCampaign ? 'Save cohort and open Campaign Wizard pre-filled' : 'Wizard not wired by parent'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--heading)' }}
        >
          {createMutation.isPending && pendingAction === 'campaign'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <>→ Campaign <ArrowRight className="w-3.5 h-3.5" /></>}
        </button>
      </div>
    </motion.div>
  )
}
