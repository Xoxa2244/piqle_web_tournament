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
import { getTierMeta } from "@/lib/ai/programming-tier-classifier"

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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const sk = classifySkill(session.format, session.skillLevel)
  const colors = SKILL_COLORS[sk.tier]
  const sessionTier = getTierMeta({ title: session.title, format: session.format })
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
          {/* P1.4 (Sprint 1): Programming Tier badge — IPC's 7-tier
              taxonomy (T1 Core / T2 League / T3 Signature / T4 Social /
              T5 Tournament / T6 Premium / T7 Youth). Auto-classified
              from session title + format. */}
          {(() => {
            const tierMeta = sessionTier
            return (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: tierMeta.bg,
                  border: `1px solid ${tierMeta.border}`,
                  color: tierMeta.color,
                }}
                title={`${tierMeta.label} · expected cadence: ${tierMeta.cadence}`}
              >
                {tierMeta.shortLabel}
              </span>
            )
          })()}
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
                  const likelihood: string = rec.estimatedLikelihood ?? 'low'
                  const likelihoodColor = likelihood === 'high' ? '#10B981' : likelihood === 'medium' ? '#F59E0B' : '#94A3B8'
                  return (
                    <div key={id} className="flex items-start gap-3 py-2 px-2 rounded-xl transition-colors">
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
  const STEP_LABELS = ['Audience', 'Message', 'Launch']
  const { isDark } = useTheme()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [launchResult, setLaunchResult] = useState<{ campaignId: string; recipientCount: number; status: string } | null>(null)

  const modalSurface = isDark ? '#0B1220' : '#FFFFFF'
  const modalInset = isDark ? '#151D2E' : '#F8FAFC'
  const modalBorder = isDark ? 'rgba(148,163,184,0.24)' : '#E2E8F0'
  const truncateText = (value: string, max: number) => value.length > max ? value.slice(0, max).trimEnd() : value

  const generateMutation = trpc.intelligence.generateEventCampaign.useMutation({
    onSuccess: (data) => {
      setSubject(data.message.subject)
      setBody(data.message.body)
      setSelectedIds(new Set(data.audience.map(a => a.id)))
      setStep(0)
    },
  })

  const launchMutation = trpc.intelligence.launchCampaign.useMutation({
    onSuccess: async (result) => {
      setLaunchResult(result)
      setStep(2)
      await Promise.all([
        utils.intelligence.getCampaignAnalytics.invalidate().catch(() => undefined),
        utils.intelligence.getCampaignList.invalidate().catch(() => undefined),
        utils.intelligence.listAgentDecisionRecords.invalidate().catch(() => undefined),
      ])
    },
  })

  const handleOpen = () => {
    setOpen(true)
    setStep(0)
    setSelectedIds(new Set())
    setSubject('')
    setBody('')
    setLaunchResult(null)
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
    const sessionTitle = sessionInfo?.title || 'Session'
    const bookingUrl = generateMutation.data?.message?.bookingUrl
    launchMutation.mutate({
      clubId,
      name: truncateText(`Fill open slots: ${sessionTitle}`, 100),
      goal: 'Fill open slots',
      subject: subject.trim(),
      body: body.trim(),
      channels: ['email' as const],
      userIds: Array.from(selectedIds),
      audienceLabel: truncateText(`${sessionTitle} selected slot-filler audience`, 120),
      format: 'one_time' as const,
      ...(bookingUrl ? { ctaLabel: 'Book this spot', ctaUrl: bookingUrl } : {}),
    })
  }

  const audience = generateMutation.data?.audience || []
  const selectedAudience = audience.filter((a: any) => selectedIds.has(a.id))
  const sessionInfo = generateMutation.data?.session
  const currentStep = launchResult ? 2 : step
  const errorMessage = generateMutation.error?.message || launchMutation.error?.message
  const canContinueToMessage = selectedIds.size > 0
  const canReviewLaunch = subject.trim().length > 0 && body.trim().length > 0

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleOpen}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-white"
        style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
      >
        <Send className="w-4 h-4" /> Fill Open Slots ({spotsLeft})
      </motion.button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,0.86)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: modalSurface, border: `1px solid ${modalBorder}`, boxShadow: '0 25px 50px rgba(0,0,0,0.35)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${modalBorder}` }}>
              <div className="flex items-center gap-3">
                <h2 className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>One-Time Slot Filler</h2>
                <div className="flex items-center gap-1.5">
                  {STEP_LABELS.map((label, i) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: i <= currentStep ? '#8B5CF6' : modalInset }} />
                      {i < STEP_LABELS.length - 1 && <div className="w-3 h-px" style={{ background: i < currentStep ? '#8B5CF6' : modalInset }} />}
                    </div>
                  ))}
                </div>
                <span className="text-[10px]" style={{ color: 'var(--t4)' }}>Step {currentStep + 1} of 3</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg transition-colors hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--t3)' }} />
              </button>
            </div>

            <div className="px-6 py-5">
              {generateMutation.isPending ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8B5CF6' }} />
                  <p className="text-sm" style={{ color: 'var(--t3)' }}>Building one-time campaign audience...</p>
                </div>
              ) : launchResult ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}>
                    <Check className="w-6 h-6" />
                  </div>
                  <p className="text-lg mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>One-time campaign launched</p>
                  <p className="text-sm" style={{ color: 'var(--t3)' }}>
                    {launchResult.recipientCount} selected player{launchResult.recipientCount === 1 ? '' : 's'} will receive this email.
                  </p>
                  <button onClick={() => setOpen(false)} className="mt-4 px-6 py-2 rounded-xl text-sm" style={{ background: modalInset, color: 'var(--t2)', fontWeight: 600 }}>
                    Close
                  </button>
                </div>
              ) : errorMessage ? (
                <div className="py-6">
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4" style={{ background: isDark ? '#351A22' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.28)' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#EF4444' }} />
                    <div>
                      <div className="text-xs" style={{ color: '#EF4444', fontWeight: 700 }}>Campaign could not be prepared</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#EF4444' }}>{errorMessage}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm" style={{ background: modalInset, color: 'var(--t2)', fontWeight: 600 }}>
                      Close
                    </button>
                    <button onClick={handleOpen} className="px-5 py-2.5 rounded-xl text-sm text-white" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <>
                {/* Session info */}
                {sessionInfo && (
                  <div className="p-4 rounded-2xl mb-5" style={{ background: modalInset, border: `1px solid ${modalBorder}` }}>
                    <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--t4)', fontWeight: 700 }}>One-time email campaign</div>
                    <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>{sessionInfo.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                      {sessionInfo.date} · {sessionInfo.time} {sessionInfo.court ? `· ${sessionInfo.court}` : ''}
                      <span className="ml-2" style={{ color: '#8B5CF6', fontWeight: 700 }}>{sessionInfo.spotsLeft} spots left</span>
                    </div>
                  </div>
                )}

                {step === 0 && (
                  <>
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Select recipients</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                            {selectedIds.size} selected out of {audience.length} matched players
                          </div>
                        </div>
                        {audience.length > 0 && (
                          <button
                            onClick={() => setSelectedIds(selectedIds.size === audience.length ? new Set() : new Set(audience.map(a => a.id)))}
                            className="text-[10px]" style={{ color: '#8B5CF6', fontWeight: 600 }}
                          >
                            {selectedIds.size === audience.length ? 'Deselect all' : 'Select all'}
                          </button>
                        )}
                      </div>
                      {audience.length === 0 ? (
                        <p className="text-sm py-8 text-center rounded-xl" style={{ color: 'var(--t4)', background: modalInset, border: `1px solid ${modalBorder}` }}>
                          No eligible recipients found for this session.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                          {audience.map(a => (
                            <div
                              key={a.id}
                              onClick={() => toggleRecipient(a.id)}
                              className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                              style={{ background: selectedIds.has(a.id) ? 'rgba(139,92,246,0.14)' : modalInset, border: `1px solid ${selectedIds.has(a.id) ? 'rgba(139,92,246,0.45)' : modalBorder}` }}
                            >
                              <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0" style={{
                                borderColor: selectedIds.has(a.id) ? '#8B5CF6' : modalBorder,
                                background: selectedIds.has(a.id) ? '#8B5CF6' : modalSurface,
                              }}>
                                {selectedIds.has(a.id) && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs" style={{ fontWeight: 600, color: 'var(--t1)' }}>{a.name}</span>
                                {a.socialProof && (
                                  <span className="text-[10px] ml-2" style={{ color: '#8B5CF6' }}>{a.socialProof}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] shrink-0" style={{ color: 'var(--t4)' }}>
                                {a.formatMatch > 0 && <Target className="w-3 h-3" style={{ color: '#06B6D4' }} />}
                                {a.totalBookings} sessions
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        onClick={() => setOpen(false)}
                        className="px-4 py-2 rounded-xl text-sm"
                        style={{ background: modalInset, color: 'var(--t2)', fontWeight: 600 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setStep(1)}
                        disabled={!canContinueToMessage}
                        className="px-5 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}
                      >
                        Continue to message
                      </button>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="mb-5">
                      <div className="text-sm mb-2" style={{ fontWeight: 700, color: 'var(--heading)' }}>Review message</div>
                      <div className="mb-3">
                        <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Subject</label>
                        <input
                          value={subject} onChange={e => setSubject(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                          style={{ background: modalInset, color: 'var(--t1)', border: `1px solid ${modalBorder}` }}
                        />
                      </div>
                      <div>
                        <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Message</label>
                        <textarea
                          value={body} onChange={e => setBody(e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                          style={{ background: modalInset, color: 'var(--t1)', border: `1px solid ${modalBorder}` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        onClick={() => setStep(0)}
                        className="px-4 py-2 rounded-xl text-sm"
                        style={{ background: modalInset, color: 'var(--t2)', fontWeight: 600 }}
                      >
                        Back
                      </button>
                      <button
                        onClick={() => setStep(2)}
                        disabled={!canReviewLaunch}
                        className="px-5 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}
                      >
                        Review launch
                      </button>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="space-y-4 mb-5">
                      <div className="rounded-xl p-4" style={{ background: modalInset, border: `1px solid ${modalBorder}` }}>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div style={{ color: 'var(--t4)', fontWeight: 700 }}>Type</div>
                            <div className="mt-1" style={{ color: 'var(--heading)', fontWeight: 700 }}>One-time</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--t4)', fontWeight: 700 }}>Channel</div>
                            <div className="mt-1" style={{ color: 'var(--heading)', fontWeight: 700 }}>Email</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--t4)', fontWeight: 700 }}>Recipients</div>
                            <div className="mt-1" style={{ color: 'var(--heading)', fontWeight: 700 }}>{selectedIds.size}</div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl p-4" style={{ background: modalInset, border: `1px solid ${modalBorder}` }}>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 700 }}>Selected recipients</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAudience.slice(0, 8).map((a: any) => (
                            <span key={a.id} className="px-2 py-1 rounded-lg text-[11px]" style={{ background: modalSurface, color: 'var(--t2)', border: `1px solid ${modalBorder}` }}>
                              {a.name}
                            </span>
                          ))}
                          {selectedAudience.length > 8 && (
                            <span className="px-2 py-1 rounded-lg text-[11px]" style={{ background: modalSurface, color: 'var(--t3)', border: `1px solid ${modalBorder}` }}>
                              +{selectedAudience.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl p-4" style={{ background: modalInset, border: `1px solid ${modalBorder}` }}>
                        <div className="text-[11px] mb-1" style={{ color: 'var(--t3)', fontWeight: 700 }}>Email subject</div>
                        <div className="text-xs" style={{ color: 'var(--heading)', fontWeight: 700 }}>{subject}</div>
                      </div>

                      <div className="rounded-xl p-4" style={{ background: modalInset, border: `1px solid ${modalBorder}` }}>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--t3)', fontWeight: 700 }}>Email body</div>
                        <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--t2)' }}>{body}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        onClick={() => setStep(1)}
                        className="px-4 py-2 rounded-xl text-sm"
                        style={{ background: modalInset, color: 'var(--t2)', fontWeight: 600 }}
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={selectedIds.size === 0 || launchMutation.isPending || !canReviewLaunch}
                        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}
                      >
                        {launchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        Launch one-time campaign ({selectedIds.size})
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
