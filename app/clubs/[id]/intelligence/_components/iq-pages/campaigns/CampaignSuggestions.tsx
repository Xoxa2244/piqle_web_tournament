'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Loader2,
  Megaphone,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  useMemberHealth,
  useNewMembers,
  useReactivationCandidates,
  useUnderfilledSessions,
} from '../../../_hooks/use-intelligence'

interface SuggestionPreviewItem {
  id: string
  name: string
  subtitle: string
  kind: 'member' | 'session'
}

interface Suggestion {
  type: 'REACTIVATION' | 'RETENTION_BOOST' | 'SLOT_FILLER' | 'NEW_MEMBER_WELCOME' | 'CHECK_IN'
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  gradient: string
  accentColor: string
  title: string
  description: string
  count: number
  previewItems: SuggestionPreviewItem[]
  previewTitle: string
}

interface CampaignSuggestionsProps {
  clubId: string
  onSelectType: (type: string) => void
}

function SuggestionCardSkeleton({ tone }: { tone: 'red' | 'orange' | 'violet' }) {
  const background = tone === 'red'
    ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))'
    : tone === 'orange'
      ? 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(245,158,11,0.08))'
      : 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.08))'

  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ background, border: '1px solid var(--card-border)', minHeight: 120 }}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 rounded-full w-48" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-6 rounded-full w-9" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div className="space-y-2">
            <div className="h-4 rounded w-[85%]" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-4 rounded w-[65%]" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function normalizeDateLabel(value?: string | null) {
  if (!value) return 'Upcoming session'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CampaignSuggestions({ clubId, onSelectType }: CampaignSuggestionsProps) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadPhase, setLoadPhase] = useState(0)

  useEffect(() => {
    const phase1 = window.setTimeout(() => setLoadPhase(1), 0)
    const phase2 = window.setTimeout(() => setLoadPhase(2), 160)
    return () => {
      window.clearTimeout(phase1)
      window.clearTimeout(phase2)
    }
  }, [])

  const { data: healthData, isLoading: healthLoading } = useMemberHealth(clubId, { enabled: loadPhase >= 1 })
  const { data: reactivationData, isLoading: reactivationLoading } = useReactivationCandidates(clubId, 21, { enabled: loadPhase >= 1 })
  const { data: underfilledData, isLoading: underfilledLoading } = useUnderfilledSessions(clubId, { enabled: loadPhase >= 2 })
  const { data: newMembersData, isLoading: newMembersLoading } = useNewMembers(clubId, 14, { enabled: loadPhase >= 2 })

  const anyLoading = (loadPhase < 2)
    || healthLoading
    || reactivationLoading
    || underfilledLoading
    || newMembersLoading

  useEffect(() => {
    if (!anyLoading) return
    const interval = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % 3)
    }, 1400)
    return () => window.clearInterval(interval)
  }, [anyLoading])

  const loadingMessages = [
    'Collecting member activity and booking signals',
    'Reviewing reactivation, retention, and welcome opportunities',
    'Preparing AI campaign recommendations for this club',
  ]

  const suggestions = useMemo<Suggestion[]>(() => {
    const built: Suggestion[] = []
    const healthMembers = Array.isArray(healthData?.members) ? healthData.members : []
    const reactivationMembers = Array.isArray((reactivationData as any)?.candidates) ? (reactivationData as any).candidates : []

    const inactiveCount = reactivationMembers.length
    if (inactiveCount > 0) {
      built.push({
        type: 'REACTIVATION',
        icon: UserMinus,
        gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))',
        accentColor: '#EF4444',
        title: 'Win Back Inactive Members',
        description: `${inactiveCount} member${inactiveCount !== 1 ? 's' : ''} haven't played in 21+ days. A personalized reactivation campaign can bring them back.`,
        count: inactiveCount,
        previewTitle: 'Inactive members in this recommendation',
        previewItems: reactivationMembers.map((candidate: any) => ({
          id: candidate.member?.id || candidate.id || `reactivation-${candidate.member?.email || Math.random()}`,
          name: candidate.member?.name || candidate.member?.email || 'Unknown member',
          subtitle: `${candidate.daysSinceLastActivity || 0}d since last play • ${candidate.totalHistoricalBookings || 0} sessions`,
          kind: 'member',
        })),
      })
    }

    const atRiskCount = (healthData?.summary?.atRisk ?? 0) + (healthData?.summary?.critical ?? 0)
    if (atRiskCount > 0) {
      const atRiskMembers = healthMembers.filter((member: any) => ['at_risk', 'critical'].includes(member.riskLevel))
      built.push({
        type: 'RETENTION_BOOST',
        icon: Shield,
        gradient: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(245,158,11,0.08))',
        accentColor: '#F97316',
        title: 'Boost Retention',
        description: `${atRiskCount} member${atRiskCount !== 1 ? 's are' : ' is'} showing declining activity. Reach out before they churn.`,
        count: atRiskCount,
        previewTitle: 'Members currently showing retention risk',
        previewItems: atRiskMembers.map((member: any) => ({
          id: member.memberId,
          name: member.member?.name || member.member?.email || 'Unknown member',
          subtitle: `${member.riskLevel === 'critical' ? 'Critical' : 'At-risk'} • ${member.daysSinceLastBooking ?? 'N/A'}d since last play`,
          kind: 'member',
        })),
      })
    }

    const sessions = (underfilledData as any)?.sessions ?? underfilledData ?? []
    const underfilledCount = Array.isArray(sessions) ? sessions.length : 0
    if (underfilledCount > 0) {
      built.push({
        type: 'SLOT_FILLER',
        icon: CalendarDays,
        gradient: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.08))',
        accentColor: '#06B6D4',
        title: 'Fill Open Sessions',
        description: `${underfilledCount} session${underfilledCount !== 1 ? 's' : ''} under capacity this week. Invite matching players to fill spots.`,
        count: underfilledCount,
        previewTitle: 'Sessions currently below target occupancy',
        previewItems: sessions.map((session: any) => ({
          id: session.id,
          name: session.title || 'Open session',
          subtitle: `${normalizeDateLabel(session.date)} ${session.startTime || ''} • ${session.registered || 0}/${session.maxPlayers || 0} booked`,
          kind: 'session',
        })),
      })
    }

    const newMembers = (newMembersData as any)?.members ?? newMembersData ?? []
    const newCount = Array.isArray(newMembers) ? newMembers.length : 0
    if (newCount > 0) {
      built.push({
        type: 'NEW_MEMBER_WELCOME',
        icon: UserPlus,
        gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(52,211,153,0.08))',
        accentColor: '#10B981',
        title: 'Welcome New Members',
        description: `${newCount} new member${newCount !== 1 ? 's' : ''} joined recently. A welcome message drives early engagement.`,
        count: newCount,
        previewTitle: 'Recently joined members in this segment',
        previewItems: newMembers.map((member: any) => ({
          id: member.id,
          name: member.name || member.email || 'Unknown member',
          subtitle: member.joinedAt
            ? `Joined ${new Date(member.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : 'Recently joined',
          kind: 'member',
        })),
      })
    }

    const watchCount = healthData?.summary?.watch ?? 0
    if (watchCount > 0 && built.length < 4) {
      const watchMembers = healthMembers.filter((member: any) => member.riskLevel === 'watch')
      built.push({
        type: 'CHECK_IN',
        icon: Heart,
        gradient: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.08))',
        accentColor: '#8B5CF6',
        title: 'Check In',
        description: `${watchCount} member${watchCount !== 1 ? 's' : ''} showing reduced activity. A quick check-in keeps them engaged.`,
        count: watchCount,
        previewTitle: 'Members who should get a softer check-in',
        previewItems: watchMembers.map((member: any) => ({
          id: member.memberId,
          name: member.member?.name || member.member?.email || 'Unknown member',
          subtitle: `Watch segment • ${member.daysSinceLastBooking ?? 'N/A'}d since last play`,
          kind: 'member',
        })),
      })
    }

    return built.slice(0, 4)
  }, [healthData, newMembersData, reactivationData, underfilledData])

  const hasAnyResults = suggestions.length > 0
  const showEmptyState = !anyLoading && !hasAnyResults
  const showPartialLoading = anyLoading && hasAnyResults
  const showInitialSkeleton = !hasAnyResults && anyLoading

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      <div className="text-center pt-2">
        <div
          className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))',
            border: '1px solid rgba(139,92,246,0.2)',
          }}
        >
          <Sparkles className="w-6 h-6" style={{ color: '#A78BFA' }} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>
          AI-Recommended Campaigns
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
          Based on your club data, here are the highest-impact campaigns to launch
        </p>
        {anyLoading && (
          <>
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2"
              style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.16)',
                color: '#C4B5FD',
              }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-medium">{loadingMessages[loadingStep]}</span>
            </div>
            <div className="text-xs mt-2" style={{ color: 'var(--t4)' }}>
              This block loads progressively so the page appears immediately while recommendation data catches up.
            </div>
          </>
        )}
      </div>

      {showInitialSkeleton && (
        <div className="grid md:grid-cols-2 gap-4">
          <SuggestionCardSkeleton tone="red" />
          <SuggestionCardSkeleton tone="orange" />
          <SuggestionCardSkeleton tone="violet" />
        </div>
      )}

      {hasAnyResults && (
        <div className="grid md:grid-cols-2 gap-4">
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon
            return (
              <motion.button
                key={suggestion.type}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                onClick={() => setSelectedSuggestion(suggestion)}
                className="text-left rounded-2xl p-5 transition-all hover:scale-[1.01] group"
                style={{
                  background: suggestion.gradient,
                  border: `1px solid ${suggestion.accentColor}22`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${suggestion.accentColor}18` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: suggestion.accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                        {suggestion.title}
                      </h3>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${suggestion.accentColor}18`, color: suggestion.accentColor }}
                      >
                        {suggestion.count}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                      {suggestion.description}
                    </p>
                  </div>
                  <ArrowRight
                    className="w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: suggestion.accentColor }}
                  />
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {showPartialLoading && (
        <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--t4)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Adding more recommendations as the remaining club signals finish loading.</span>
        </div>
      )}

      {showEmptyState && (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--t3)' }}>
          <Megaphone className="w-12 h-12 opacity-30" />
          <h2 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>
            No campaigns yet
          </h2>
          <p className="text-sm text-center max-w-md">
            Once you have member data, AI will suggest personalized campaigns to engage your community.
          </p>
        </div>
      )}

      <AnimatePresence>
        {selectedSuggestion && (
          <SuggestionAudienceModal
            suggestion={selectedSuggestion}
            onClose={() => setSelectedSuggestion(null)}
            onContinue={() => {
              const nextType = selectedSuggestion.type
              setSelectedSuggestion(null)
              onSelectType(nextType)
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function SuggestionAudienceModal({
  suggestion,
  onClose,
  onContinue,
}: {
  suggestion: Suggestion
  onClose: () => void
  onContinue: () => void
}) {
  const SelectedIcon = suggestion.icon

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 8, 20, 0.72)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl rounded-[28px] p-6"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${suggestion.accentColor}18` }}
            >
              <SelectedIcon className="w-6 h-6" style={{ color: suggestion.accentColor }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.22em]" style={{ color: suggestion.accentColor, fontWeight: 700 }}>
                Campaign Audience
              </div>
              <h3 className="text-xl font-bold mt-1" style={{ color: 'var(--heading)' }}>
                {suggestion.title}
              </h3>
              <p className="text-sm mt-2" style={{ color: 'var(--t3)' }}>
                {suggestion.previewTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t3)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: 'var(--t3)' }}>
          <Users className="w-4 h-4" />
          <span>
            {suggestion.count} {suggestion.count === 1 ? 'record' : 'records'} in this recommendation
          </span>
        </div>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {suggestion.previewItems.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl px-4 py-3"
              style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                {item.name}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {item.subtitle}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm transition-colors"
            style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t2)', fontWeight: 600 }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-4 py-2 rounded-xl text-sm transition-all"
            style={{
              background: `linear-gradient(135deg, ${suggestion.accentColor}, rgba(59,130,246,0.95))`,
              color: '#fff',
              fontWeight: 700,
            }}
          >
            Continue to Campaign
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
