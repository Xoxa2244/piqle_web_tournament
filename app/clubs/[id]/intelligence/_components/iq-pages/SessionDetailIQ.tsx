'use client'
import React, { useState, useMemo } from "react"
import { motion } from "motion/react"
import {
  ArrowLeft, Users, Clock, MapPin, CalendarDays, Target,
  Zap, UserPlus, Check, Loader2, AlertTriangle,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { trpc } from "@/lib/trpc"
import type { SessionCalendarItem } from "@/types/intelligence"
import { PlayerProfileIQ } from "./PlayerProfileIQ"

// ── Skill classification (shared with ScheduleIQ) ──

type SkillTier = 'advanced' | 'competitive' | 'intermediate' | 'casual' | 'beginner' | 'other'

const SKILL_COLORS: Record<SkillTier, { bg: string; border: string; text: string }> = {
  advanced:     { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  text: '#EF4444' },
  competitive:  { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)', text: '#8B5CF6' },
  intermediate: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)',  text: '#3B82F6' },
  casual:       { bg: 'rgba(6,182,212,0.15)',   border: 'rgba(6,182,212,0.3)',   text: '#06B6D4' },
  beginner:     { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: '#10B981' },
  other:        { bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)', text: '#94A3B8' },
}

function classifySkill(format: string, skillLevel: string): { tier: SkillTier; label: string; range: string } {
  const sl = (skillLevel || '').toUpperCase()
  if (sl.includes('ADVANCED') || sl.includes('4.0'))   return { tier: 'advanced', label: 'Advanced', range: '4.0+' }
  if (sl.includes('COMPETITIVE') || sl.includes('3.5')) return { tier: 'competitive', label: 'Competitive', range: '3.5 - 3.99' }
  if (sl.includes('INTERMEDIATE') || sl.includes('3.0')) return { tier: 'intermediate', label: 'Intermediate', range: '3.0 - 3.49' }
  if (sl.includes('CASUAL') || sl.includes('2.5'))      return { tier: 'casual', label: 'Casual', range: '2.5 - 2.99' }
  if (sl.includes('BEGINNER') || sl.includes('2.0'))    return { tier: 'beginner', label: 'Beginner', range: '2.0 - 2.49' }
  if ((format || '').toUpperCase().includes('DRILL'))  return { tier: 'other', label: 'Drill', range: '' }
  return { tier: 'other', label: 'All Levels', range: '' }
}

function fillColor(pct: number) {
  if (pct >= 80) return '#10B981'
  if (pct >= 40) return '#F59E0B'
  return '#EF4444'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Props ──

interface SessionDetailIQProps {
  session: SessionCalendarItem
  clubId: string
  onBack: () => void
}

// ── Component ──

export function SessionDetailIQ({ session, clubId, onBack }: SessionDetailIQProps) {
  const { isDark } = useTheme()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const sk = classifySkill(session.format, session.skillLevel)
  const colors = SKILL_COLORS[sk.tier]
  const occPct = Math.round((session.registered / (session.capacity || 1)) * 100)
  const spotsLeft = Math.max(0, (session.capacity || 0) - session.registered)
  const baseline = session.peerAvgOccupancy ?? 70

  // Human-readable title: "Open Play · Advanced" or "Drill" or "League"
  const formatLabel = useMemo(() => {
    const f = (session.format || '').toUpperCase()
    const parts: string[] = []
    if (f.includes('OPEN_PLAY') || f.includes('OPEN PLAY')) parts.push('Open Play')
    else if (f.includes('DRILL')) parts.push('Drill')
    else if (f.includes('CLINIC')) parts.push('Clinic')
    else if (f.includes('LEAGUE')) parts.push('League')
    else if (f.includes('SOCIAL')) parts.push('Social')
    else parts.push(session.format || 'Session')
    if (sk.label !== 'All Levels' && sk.label !== parts[0]) parts.push(sk.label)
    return parts.join(' · ')
  }, [session.format, sk.label])

  const dateLabel = useMemo(() => {
    const d = new Date(session.date + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }, [session.date])

  // Load registered players for this session
  const { data: playersData } = trpc.intelligence.getSessionPlayers.useQuery(
    { sessionId: session.id, clubId },
    { enabled: !!session.id },
  )
  const players: { id: string; name: string }[] = (playersData?.players ?? session.playerNames?.map((n: string, i: number) => ({ id: String(i), name: n })) ?? []).map((p: any) => ({ id: p.id || '', name: p.name || 'Unknown' }))

  // Load recommendations
  const { data: recsData, isLoading: recsLoading } = trpc.intelligence.getSlotFillerRecommendations.useQuery(
    { sessionId: session.id, clubId, limit: 20 },
    { enabled: spotsLeft > 0 },
  )
  const recs = recsData?.recommendations ?? []

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg)', border: '1px solid var(--card-border)',
    backdropFilter: 'blur(12px)',
  }

  if (selectedPlayerId) {
    return <PlayerProfileIQ userId={selectedPlayerId} clubId={clubId} onBack={() => setSelectedPlayerId(null)} />
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Section 1: Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-3 hover:opacity-80 transition-opacity" style={{ color: '#8B5CF6' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Schedule
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--heading)' }}>{formatLabel}</h1>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
            {sk.label}{sk.range ? ` (${sk.range})` : ''}
          </span>
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
          {session.court || 'Court N/A'} &middot; {dateLabel} &middot; {session.startTime} - {session.endTime}
        </p>
      </div>

      {/* Section 2: Fill Rate */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Fill Rate</span>
          <span className="text-2xl font-bold" style={{ color: fillColor(occPct) }}>{occPct}%</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-medium" style={{ color: 'var(--t2)' }}>{session.registered} / {session.capacity} registered</span>
          {spotsLeft > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>{spotsLeft} spots left</span>}
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(occPct, 100)}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: fillColor(occPct) }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--t4)' }}>
          This slot fills {baseline}% on average. Today is {occPct >= baseline ? 'above' : 'below'} average.
        </p>
      </div>

      {/* Section 3: Two columns */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Left: Registered players */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Players ({session.registered} registered)</span>
          </div>
          {players.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-1.5 rounded-lg px-2 cursor-pointer transition-colors hover:bg-[rgba(139,92,246,0.08)]" onClick={() => p.id && setSelectedPlayerId(p.id)}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                    {initials(p.name)}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--t2)' }}>{p.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--t4)' }}>Player details not available for this session</p>
          )}
        </div>

        {/* Right: Suggested players */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Suggested Players ({spotsLeft} spots left)</span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--t4)' }}>Matched by format, skill level, time, and play history</p>

          {spotsLeft === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--t4)' }}>Session is full — no suggestions needed</p>
          ) : recsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full" style={{ background: 'var(--subtle)' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 rounded" style={{ background: 'var(--subtle)' }} />
                    <div className="h-2 w-48 rounded" style={{ background: 'var(--subtle)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : recs.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--t4)' }}>No suggestions available</p>
          ) : (
            <>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {recs.map((rec: any) => {
                  const id = rec.member?.id ?? rec.member?.email ?? ''
                  const name = rec.member?.name ?? 'Unknown'
                  const isSelected = selectedIds.has(id)
                  const likelihood: string = rec.estimatedLikelihood ?? 'low'
                  const likelihoodColor = likelihood === 'high' ? '#10B981' : likelihood === 'medium' ? '#F59E0B' : '#94A3B8'
                  return (
                    <div key={id} className="flex items-start gap-3 py-2 px-2 rounded-xl transition-colors" style={{ background: isSelected ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                      <button onClick={() => toggleSelect(id)} className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors" style={{ borderColor: isSelected ? '#8B5CF6' : 'var(--card-border)', background: isSelected ? '#8B5CF6' : 'transparent' }}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--heading)' }}>{name}</span>
                          {rec.member?.membershipType && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>{rec.member.membershipType}</span>}
                        </div>
                        {/* Score bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(rec.score ?? 0, 100)}%`, background: '#8B5CF6' }} />
                          </div>
                          <span className="text-[10px] font-semibold shrink-0" style={{ color: likelihoodColor }}>{likelihood}</span>
                        </div>
                        {rec.reasoning?.summary && <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--t4)' }}>{rec.reasoning.summary}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                disabled={selectedIds.size === 0}
                className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: selectedIds.size > 0 ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)' : 'var(--subtle)' }}
              >
                Invite Selected ({selectedIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section 4: Session Insights */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Session Insights</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--t3)' }}>
            <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--t4)' }} />
            <span>This slot fills <strong style={{ color: 'var(--heading)' }}>{baseline}%</strong> on average over the last 90 days</span>
          </div>
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--t3)' }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--t4)' }} />
            <span>Today: <strong style={{ color: fillColor(occPct) }}>{occPct}%</strong> — {occPct >= baseline ? 'above' : 'below'} average</span>
          </div>
          {occPct < 60 && (
            <div className="flex items-start gap-2 text-xs" style={{ color: '#F59E0B' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Consider promoting this session or adjusting the time</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
