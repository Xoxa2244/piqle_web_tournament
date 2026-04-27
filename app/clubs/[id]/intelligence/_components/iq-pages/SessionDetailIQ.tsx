'use client'
import React, { useState, useMemo } from "react"
import { motion } from "motion/react"
import {
  ArrowLeft, Users, Clock, MapPin, CalendarDays, Target,
  Zap, UserPlus, Check, Loader2, AlertTriangle, Send, Mail, X,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { trpc } from "@/lib/trpc"
import type { SessionCalendarItem, SessionRecommendation } from "@/types/intelligence"
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

function recommendationPriorityRank(priority: SessionRecommendation['priority']) {
  if (priority === 'high') return 0
  if (priority === 'medium') return 1
  return 2
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
  const peerSampleSize = session.peerSampleSize ?? null
  const deviationFromPeer = session.deviationFromPeer ?? null
  const topInsightRecommendation = [...(session.recommendations || [])]
    .sort((a, b) => recommendationPriorityRank(a.priority) - recommendationPriorityRank(b.priority))[0] || null
  const demandState = occPct >= 90 ? 'high' : occPct >= 60 ? 'healthy' : occPct >= 35 ? 'soft' : 'weak'
  const demandLabel = demandState === 'high'
    ? 'High demand'
    : demandState === 'healthy'
      ? 'Healthy demand'
      : demandState === 'soft'
        ? 'Soft demand'
        : 'Weak demand'
  const benchmarkLabel = deviationFromPeer == null
    ? null
    : deviationFromPeer > 0
      ? `+${deviationFromPeer} pts vs peer average`
      : deviationFromPeer < 0
        ? `${deviationFromPeer} pts vs peer average`
        : 'Exactly on peer average'
  const revenueDelta = session.peerAvgRevenue != null && session.revenue != null
    ? Math.round(session.revenue - session.peerAvgRevenue)
    : null

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

  const isPast = useMemo(() => new Date(session.date + 'T23:59:59') < new Date(), [session.date])

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
            <>
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
              {isPast && (
                <CreateCohortButton clubId={clubId} sessionId={session.id} playerCount={players.length} />
              )}
            </>
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
                          <span className="text-sm font-medium truncate cursor-pointer hover:underline" style={{ color: 'var(--heading)' }} onClick={() => id && setSelectedPlayerId(id)}>{name}</span>
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

      {/* Fill This Session — Event Marketing Pipeline */}
      {spotsLeft > 0 && (
        <FillSessionButton clubId={clubId} sessionId={session.id} spotsLeft={spotsLeft} />
      )}

      {/* Section 4: Session Insights */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4" style={{ color: '#8B5CF6' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Session Insights</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--t4)', fontWeight: 700 }}>Benchmark</div>
            <div className="mt-2 text-lg font-bold" style={{ color: 'var(--heading)' }}>{baseline}%</div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {peerSampleSize
                ? `${peerSampleSize} similar ${peerSampleSize === 1 ? 'session' : 'sessions'} over the last 90 days`
                : 'Average for similar sessions over the last 90 days'}
            </div>
            {benchmarkLabel && (
              <div className="text-[11px] mt-2" style={{ color: deviationFromPeer && deviationFromPeer < 0 ? '#F59E0B' : '#10B981' }}>
                {benchmarkLabel}
              </div>
            )}
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--t4)', fontWeight: 700 }}>Demand Signal</div>
            <div className="mt-2 text-lg font-bold" style={{ color: fillColor(occPct) }}>{demandLabel}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              Today is at {occPct}% fill with {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} open
            </div>
            {occPct < baseline && (
              <div className="text-[11px] mt-2" style={{ color: '#F59E0B' }}>
                Running below the usual fill for this slot
              </div>
            )}
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--t4)', fontWeight: 700 }}>Revenue Impact</div>
            <div className="mt-2 text-lg font-bold" style={{ color: session.lostRevenue ? '#F59E0B' : 'var(--heading)' }}>
              {session.lostRevenue != null && session.lostRevenue > 0 ? `$${Math.round(session.lostRevenue)}` : session.revenue != null ? `$${Math.round(session.revenue)}` : 'N/A'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {session.lostRevenue != null && session.lostRevenue > 0
                ? 'Estimated revenue still open in unfilled spots'
                : session.revenue != null
                  ? 'Estimated revenue captured by current registrations'
                  : 'No pricing data for this slot'}
            </div>
            {revenueDelta != null && (
              <div className="text-[11px] mt-2" style={{ color: revenueDelta >= 0 ? '#10B981' : '#F59E0B' }}>
                {revenueDelta >= 0 ? '+' : ''}${revenueDelta} vs similar sessions
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--t3)' }}>
            <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--t4)' }} />
            <span>
              Comparable {formatLabel.toLowerCase()} slots usually land around <strong style={{ color: 'var(--heading)' }}>{baseline}%</strong> fill{peerSampleSize ? ` across ${peerSampleSize} recent sessions` : ''}.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--t3)' }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--t4)' }} />
            <span>
              Today is <strong style={{ color: fillColor(occPct) }}>{occPct}%</strong>{deviationFromPeer != null ? `, which is ${Math.abs(deviationFromPeer)} points ${deviationFromPeer >= 0 ? 'above' : 'below'} its peer benchmark` : ''}.
            </span>
          </div>
          {topInsightRecommendation ? (
            <div className="flex items-start gap-2 text-xs" style={{ color: topInsightRecommendation.priority === 'high' ? '#F59E0B' : 'var(--t3)' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: topInsightRecommendation.priority === 'high' ? '#F59E0B' : 'var(--t4)' }} />
              <span>
                <strong style={{ color: 'var(--heading)' }}>{topInsightRecommendation.label}:</strong> {topInsightRecommendation.reason}
              </span>
            </div>
          ) : occPct < 60 ? (
            <div className="flex items-start gap-2 text-xs" style={{ color: '#F59E0B' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>This slot is under 60% full, so a targeted promotion or timing/format tweak is worth considering.</span>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

// ── Create Cohort from Session Participants ──
function CreateCohortButton({ clubId, sessionId, playerCount }: { clubId: string; sessionId: string; playerCount: number }) {
  const [created, setCreated] = useState(false)
  const mutation = trpc.intelligence.createCohortFromSession.useMutation({
    onSuccess: () => setCreated(true),
  })

  if (created) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: '#10B981' }}>
        <Check className="w-3.5 h-3.5" /> Cohort created
      </div>
    )
  }

  return (
    <button
      onClick={() => mutation.mutate({ clubId, sessionId })}
      disabled={mutation.isPending}
      className="mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-all hover:opacity-80"
      style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600, border: 'none', cursor: 'pointer' }}
    >
      {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
      Create Cohort ({playerCount})
    </button>
  )
}

// ── Fill This Session — Event Marketing Pipeline ──
function FillSessionButton({ clubId, sessionId, spotsLeft }: { clubId: string; sessionId: string; spotsLeft: number }) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState<{ sent: number; skipped: number; errors: number } | null>(null)

  const generateMutation = trpc.intelligence.generateEventCampaign.useMutation({
    onSuccess: (data) => {
      setSubject(data.message.subject)
      setBody(data.message.body)
      setSelectedIds(new Set(data.audience.map(a => a.id)))
    },
  })

  const sendMutation = trpc.intelligence.sendEventCampaign.useMutation({
    onSuccess: (result) => setSent(result),
  })

  const handleOpen = () => {
    setOpen(true)
    setSent(null)
    generateMutation.mutate({ clubId, sessionId, maxRecipients: 20 })
  }

  const toggleRecipient = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSend = () => {
    sendMutation.mutate({
      clubId, sessionId,
      recipientIds: Array.from(selectedIds),
      subject, body, channel: 'email',
    })
  }

  const audience = generateMutation.data?.audience || []
  const sessionInfo = generateMutation.data?.session

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleOpen}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-white"
        style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
      >
        <Send className="w-4 h-4" /> Fill This Session ({spotsLeft} spots)
      </motion.button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                <Send className="w-5 h-5 inline mr-2" style={{ color: '#8B5CF6' }} />
                Fill This Session
              </h2>
              <button onClick={() => setOpen(false)} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
            </div>

            {generateMutation.isPending ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8B5CF6' }} />
                <p className="text-sm" style={{ color: 'var(--t3)' }}>Finding best candidates...</p>
              </div>
            ) : sent ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-lg mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Campaign Sent!</p>
                <p className="text-sm" style={{ color: 'var(--t3)' }}>
                  {sent.sent} sent, {sent.skipped} skipped, {sent.errors} errors
                </p>
                <button onClick={() => setOpen(false)} className="mt-4 px-6 py-2 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t2)', fontWeight: 600 }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Session info */}
                {sessionInfo && (
                  <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--subtle)' }}>
                    <div className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>{sessionInfo.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                      {sessionInfo.date} · {sessionInfo.time} {sessionInfo.court ? `· ${sessionInfo.court}` : ''}
                      <span className="ml-2" style={{ color: '#8B5CF6', fontWeight: 700 }}>{sessionInfo.spotsLeft} spots left</span>
                    </div>
                  </div>
                )}

                {/* Message */}
                <div className="mb-4">
                  <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Subject</label>
                  <input
                    value={subject} onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                  />
                </div>
                <div className="mb-4">
                  <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Message</label>
                  <textarea
                    value={body} onChange={e => setBody(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                  />
                </div>

                {/* Audience */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs" style={{ fontWeight: 600, color: 'var(--t2)' }}>
                      Recipients ({selectedIds.size} of {audience.length})
                    </label>
                    <button
                      onClick={() => setSelectedIds(selectedIds.size === audience.length ? new Set() : new Set(audience.map(a => a.id)))}
                      className="text-[10px]" style={{ color: '#8B5CF6', fontWeight: 600 }}
                    >
                      {selectedIds.size === audience.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {audience.map(a => (
                      <div
                        key={a.id}
                        onClick={() => toggleRecipient(a.id)}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                        style={{ background: selectedIds.has(a.id) ? 'rgba(139,92,246,0.08)' : 'transparent' }}
                      >
                        <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0" style={{
                          borderColor: selectedIds.has(a.id) ? '#8B5CF6' : 'var(--card-border)',
                          background: selectedIds.has(a.id) ? '#8B5CF6' : 'transparent',
                        }}>
                          {selectedIds.has(a.id) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs" style={{ fontWeight: 600, color: 'var(--t1)' }}>{a.name}</span>
                          {a.socialProof && (
                            <span className="text-[10px] ml-2" style={{ color: '#8B5CF6' }}>{a.socialProof}</span>
                          )}
                        </div>
                        <div className="text-[10px] shrink-0" style={{ color: 'var(--t4)' }}>
                          {a.formatMatch > 0 ? '🎯' : ''} {a.totalBookings} sessions
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Send */}
                <button
                  onClick={handleSend}
                  disabled={selectedIds.size === 0 || sendMutation.isPending || !subject.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}
                >
                  {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send to {selectedIds.size} player{selectedIds.size > 1 ? 's' : ''}
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </>
  )
}
