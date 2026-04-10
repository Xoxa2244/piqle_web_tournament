'use client'

import { motion } from 'motion/react'
import {
  UserMinus, Shield, CalendarDays, UserPlus, Heart,
  Sparkles, ArrowRight, Megaphone,
} from 'lucide-react'
import { useMemberHealth, useReactivationCandidates, useUnderfilledSessions, useNewMembers } from '../../../_hooks/use-intelligence'

interface Suggestion {
  type: 'REACTIVATION' | 'RETENTION_BOOST' | 'SLOT_FILLER' | 'NEW_MEMBER_WELCOME' | 'CHECK_IN'
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  gradient: string
  accentColor: string
  title: string
  description: string
  count: number
}

interface CampaignSuggestionsProps {
  clubId: string
  onSelectType: (type: string) => void
}

export function CampaignSuggestions({ clubId, onSelectType }: CampaignSuggestionsProps) {
  const { data: healthData, isLoading: healthLoading } = useMemberHealth(clubId)
  const { data: reactivationData, isLoading: reactivationLoading } = useReactivationCandidates(clubId, 21)
  const { data: underfilledData, isLoading: underfilledLoading } = useUnderfilledSessions(clubId)
  const { data: newMembersData, isLoading: newMembersLoading } = useNewMembers(clubId)

  const isLoading = healthLoading || reactivationLoading || underfilledLoading || newMembersLoading

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div className="text-center pt-4">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 animate-pulse" style={{ background: 'var(--subtle)' }} />
          <div className="w-48 h-5 mx-auto rounded animate-pulse" style={{ background: 'var(--subtle)' }} />
          <div className="w-72 h-4 mx-auto mt-2 rounded animate-pulse" style={{ background: 'var(--subtle)' }} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse rounded-2xl h-36" style={{ background: 'var(--subtle)' }} />
          ))}
        </div>
      </div>
    )
  }

  // Build suggestions from real data
  const suggestions: Suggestion[] = []

  const inactiveCount = (reactivationData as any)?.candidates?.length ?? 0
  if (inactiveCount > 0) {
    suggestions.push({
      type: 'REACTIVATION',
      icon: UserMinus,
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))',
      accentColor: '#EF4444',
      title: 'Win Back Inactive Members',
      description: `${inactiveCount} member${inactiveCount !== 1 ? 's' : ''} haven't played in 21+ days. A personalized reactivation campaign can bring them back.`,
      count: inactiveCount,
    })
  }

  // at_risk + critical (excluding churned — those are already gone)
  const atRiskCount = healthData?.summary?.atRisk ?? 0
  const criticalCount = healthData?.summary?.critical ?? 0
  const totalAtRisk = atRiskCount + criticalCount
  if (totalAtRisk > 0) {
    suggestions.push({
      type: 'RETENTION_BOOST',
      icon: Shield,
      gradient: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(245,158,11,0.08))',
      accentColor: '#F97316',
      title: 'Boost Retention',
      description: `${totalAtRisk} member${totalAtRisk !== 1 ? 's are' : ' is'} showing declining activity. Reach out before they churn.`,
      count: totalAtRisk,
    })
  }

  const sessions = (underfilledData as any)?.sessions ?? underfilledData ?? []
  const underfilledCount = Array.isArray(sessions) ? sessions.length : 0
  if (underfilledCount > 0) {
    suggestions.push({
      type: 'SLOT_FILLER',
      icon: CalendarDays,
      gradient: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.08))',
      accentColor: '#06B6D4',
      title: 'Fill Open Sessions',
      description: `${underfilledCount} session${underfilledCount !== 1 ? 's' : ''} under capacity this week. Invite matching players to fill spots.`,
      count: underfilledCount,
    })
  }

  const newMembers = (newMembersData as any)?.members ?? newMembersData ?? []
  const newCount = Array.isArray(newMembers) ? newMembers.length : 0
  if (newCount > 0) {
    suggestions.push({
      type: 'NEW_MEMBER_WELCOME',
      icon: UserPlus,
      gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(52,211,153,0.08))',
      accentColor: '#10B981',
      title: 'Welcome New Members',
      description: `${newCount} new member${newCount !== 1 ? 's' : ''} joined recently. A welcome message drives early engagement.`,
      count: newCount,
    })
  }

  const watchCount = healthData?.summary?.watch ?? 0
  if (watchCount > 0 && suggestions.length < 4) {
    suggestions.push({
      type: 'CHECK_IN',
      icon: Heart,
      gradient: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.08))',
      accentColor: '#8B5CF6',
      title: 'Check In',
      description: `${watchCount} member${watchCount !== 1 ? 's' : ''} showing reduced activity. A quick check-in keeps them engaged.`,
      count: watchCount,
    })
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--t3)' }}>
        <Megaphone className="w-12 h-12 opacity-30" />
        <h2 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>No campaigns yet</h2>
        <p className="text-sm text-center max-w-md">Once you have member data, AI will suggest personalized campaigns to engage your community.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="text-center pt-2">
        <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))', border: '1px solid rgba(139,92,246,0.2)' }}>
          <Sparkles className="w-6 h-6" style={{ color: '#A78BFA' }} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--heading)' }}>AI-Recommended Campaigns</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
          Based on your club data, here are the highest-impact campaigns to launch
        </p>
      </div>

      {/* Suggestion cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {suggestions.slice(0, 4).map((s, i) => {
          const Icon = s.icon
          return (
            <motion.button
              key={s.type}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onSelectType(s.type)}
              className="text-left rounded-2xl p-5 transition-all hover:scale-[1.01] group"
              style={{
                background: s.gradient,
                border: `1px solid ${s.accentColor}22`,
              }}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${s.accentColor}18` }}>
                  <Icon className="w-5 h-5" style={{ color: s.accentColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{s.title}</h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${s.accentColor}18`, color: s.accentColor }}>
                      {s.count}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>{s.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: s.accentColor }} />
              </div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
