'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  UserMinus, Calendar, Clock, Search, Users, AlertTriangle,
  TrendingDown, Mail, MessageSquare, ChevronDown, ChevronUp,
  Smile, Bell, Check, CheckCheck
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { isCsvPlayer, CsvPlayerBadge } from '../_components/csv-player-badge'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/ui/use-toast'
import { useReactivationCandidates, useSendReactivation, useChurnTrend, useCampaignList, useMemberAiProfiles, useRegenerateMemberProfiles, useGenerateNotifyMeLink } from '../_hooks/use-intelligence'
import { generateReactivationMessages, archetypeLabels } from '@/lib/ai/reactivation-messages'
import type { PlayerArchetype } from '@/types/intelligence'
import { MessageSelector } from '../_components/message-selector'
import { useSetPageContext } from '../_hooks/usePageContext'
import { useBrand } from '@/components/BrandProvider'
import { ReactivationIQ } from '../_components/iq-pages/ReactivationIQ'

function formatRelativeDate(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} week${Math.floor(diff / 7) > 1 ? 's' : ''} ago`
  return `${Math.floor(diff / 30)} month${Math.floor(diff / 30) > 1 ? 's' : ''} ago`
}

const INACTIVITY_OPTIONS = [
  { value: 14, label: '14 days' },
  { value: 21, label: '21 days' },
  { value: 30, label: '30 days' },
  { value: 45, label: '45 days' },
]

export default function ReactivationPage() {
  const params = useParams()
  const clubId = params.id as string

  const [inactivityDays, setInactivityDays] = useState(21)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [showEmailConfirm, setShowEmailConfirm] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string>('')

  const { data, isLoading: candidatesLoading, error } = useReactivationCandidates(clubId, inactivityDays)
  const { data: churnTrendData, isLoading: churnLoading } = useChurnTrend(clubId)
  const { data: campaignListData, isLoading: campaignListLoading } = useCampaignList(clubId)
  const [isPolling, setIsPolling] = useState(false)
  const { data: aiProfilesRaw } = useMemberAiProfiles(clubId, undefined, isPolling ? 15000 : undefined)
  const regenerateProfiles = useRegenerateMemberProfiles()
  const generateNotifyMeLink = useGenerateNotifyMeLink()
  const sendReactivation = useSendReactivation()
  const isLoading = candidatesLoading || churnLoading || campaignListLoading

  // Build userId → profile map for O(1) lookup in ReactivationIQ
  const aiProfilesMap = useMemo(() => {
    if (!aiProfilesRaw?.length) return {}
    return Object.fromEntries(aiProfilesRaw.map((p: any) => [p.userId, p]))
  }, [aiProfilesRaw])

  // Stop polling when all candidates have profiles
  useEffect(() => {
    if (!isPolling) return
    const total = data?.candidates?.length ?? 0
    const done = aiProfilesRaw?.length ?? 0
    if (total > 0 && done >= total) setIsPolling(false)
  }, [aiProfilesRaw, data, isPolling])
  const { toast } = useToast()

  const setPageContext = useSetPageContext()
  useEffect(() => {
    if (!data) return
    const churnPct = data.totalClubMembers > 0
      ? Math.round((data.totalInactiveMembers / data.totalClubMembers) * 100)
      : 0
    const avgDaysInactive = data.candidates.length > 0
      ? Math.round(data.candidates.reduce((s: number, c: any) => s + c.daysSinceLastActivity, 0) / data.candidates.length)
      : 0
    const parts = [
      'Page: Member Reactivation',
      `Inactivity threshold: ${inactivityDays} days`,
      `Total members: ${data.totalClubMembers}, Inactive: ${data.totalInactiveMembers} (${churnPct}% churn risk)`,
      `Avg days inactive: ${avgDaysInactive}`,
      `Candidates: ${data.candidates.length}`,
    ]
    const top5 = data.candidates.slice(0, 5).map((c: any) =>
      `${c.member.name || c.member.email} (${c.daysSinceLastActivity}d inactive, score: ${c.score}, ${c.totalHistoricalBookings} bookings)`
    )
    if (top5.length > 0) parts.push(`Top candidates: ${top5.join(', ')}`)
    setPageContext(parts.join('\n'))
  }, [data, inactivityDays, setPageContext])


  // Message variants for selected candidate
  const selectedCandidate = useMemo(() => {
    if (!selectedMemberId || !data?.candidates) return null
    return data.candidates.find((c: any) => c.member.id === selectedMemberId) || null
  }, [selectedMemberId, data])

  const messageVariants = useMemo(() => {
    if (!selectedCandidate) return []
    const bh = selectedCandidate.bookingHistory
    return generateReactivationMessages({
      memberName: selectedCandidate.member.name || selectedCandidate.member.email || 'there',
      clubName: data?.clubName || 'the club',
      daysSinceLastActivity: selectedCandidate.daysSinceLastActivity,
      sessionCount: selectedCandidate.suggestedSessions?.length || 0,
      // Hyper-personalization data
      duprRating: selectedCandidate.member.duprRatingDoubles,
      preferredDays: selectedCandidate.preference?.preferredDays,
      preferredFormats: selectedCandidate.preference?.preferredFormats,
      preferredTimeSlots: selectedCandidate.preference?.preferredTimeSlots,
      totalBookings: selectedCandidate.totalHistoricalBookings,
      bookingsLastMonth: bh?.bookingsLastMonth,
      noShowRate: bh ? bh.noShowCount / Math.max(bh.totalBookings, 1) : undefined,
      suggestedSessionTitles: selectedCandidate.suggestedSessions?.map((s: any) => s.title),
      archetype: selectedCandidate.archetype,
    })
  }, [selectedCandidate, data])

  const selectedMessage = useMemo(() => {
    return messageVariants.find(v => v.id === selectedMessageId) || messageVariants[0] || null
  }, [messageVariants, selectedMessageId])

  // Filter by search
  const filteredCandidates = useMemo(() => {
    if (!data?.candidates) return []
    if (!searchQuery.trim()) return data.candidates
    const q = searchQuery.toLowerCase()
    return data.candidates.filter(
      (c: any) =>
        (c.member.name || '').toLowerCase().includes(q) ||
        (c.member.email || '').toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  const churnRate =
    data && data.totalClubMembers > 0
      ? Math.round((data.totalInactiveMembers / data.totalClubMembers) * 100)
      : 0

  const brand = useBrand()
  if (brand.key === 'iqsport') return <ReactivationIQ reactivationData={data} churnTrendData={churnTrendData} campaignListData={campaignListData} isLoading={isLoading} error={error} sendReactivation={sendReactivation} clubId={clubId} aiProfiles={aiProfilesMap} regenerateProfiles={regenerateProfiles} onGenerationStarted={() => setIsPolling(true)} generateNotifyMeLink={generateNotifyMeLink} />

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">Inactive for:</div>
        <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
          {INACTIVITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setInactivityDays(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                inactivityDays === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* ── Metrics ── */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Users}
            label="Total Members"
            value={data.totalClubMembers}
          />
          <MetricCard
            icon={UserMinus}
            label={`Inactive (${inactivityDays}d+)`}
            value={data.totalInactiveMembers}
            variant={data.totalInactiveMembers > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            icon={TrendingDown}
            label="Churn Risk"
            value={`${churnRate}%`}
            variant={churnRate >= 20 ? 'danger' : churnRate >= 10 ? 'warning' : 'success'}
          />
          <MetricCard
            icon={Calendar}
            label="Avg Days Inactive"
            value={data.candidates.length > 0
              ? Math.round(data.candidates.reduce((s: number, c: any) => s + c.daysSinceLastActivity, 0) / data.candidates.length)
              : 0
            }
          />
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && <ListSkeleton rows={5} />}

      {/* ── Error ── */}
      {error && !isLoading && (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load reactivation data"
          description={(error as any)?.message || 'Could not load member data.'}
        />
      )}

      {/* ── Empty: all active ── */}
      {data && data.candidates.length === 0 && (
        <EmptyState
          icon={Smile}
          title="All Members Active!"
          description={`No members have been inactive for more than ${inactivityDays} days. Your engagement is strong.`}
        />
      )}

      {/* ── Candidate list ── */}
      {data && filteredCandidates.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">
            {filteredCandidates.length} member{filteredCandidates.length !== 1 ? 's' : ''} to re-engage
          </div>

          <div className="space-y-2">
            {filteredCandidates.map((candidate: any) => {
              const isExpanded = expandedCard === candidate.member.id
              const daysAgo = candidate.daysSinceLastActivity
              const urgency =
                daysAgo >= 45 ? 'critical' : daysAgo >= 30 ? 'high' : daysAgo >= 21 ? 'medium' : 'low'
              const urgencyColor = {
                critical: 'bg-red-500',
                high: 'bg-orange-500',
                medium: 'bg-amber-500',
                low: 'bg-yellow-500',
              }[urgency]

              return (
                <div key={candidate.member.id} className="rounded-xl border border-border/60 bg-card shadow-sm">
                  {/* Main row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Days badge */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${urgencyColor}`}>
                      {daysAgo}d
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {candidate.member.name || candidate.member.email}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3 shrink-0" />
                        Last active {daysAgo} days ago
                        {candidate.member.duprRatingDoubles && (
                          <>
                            <span className="text-muted-foreground/40">|</span>
                            DUPR {candidate.member.duprRatingDoubles}
                          </>
                        )}
                      </div>
                      {candidate.lastContactedAt && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          {candidate.lastContactStatus === 'sent' ? (
                            <CheckCheck className="h-3 w-3 text-blue-500 shrink-0" />
                          ) : (
                            <Check className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span>
                            Contacted {formatRelativeDate(candidate.lastContactedAt)} via {candidate.lastContactChannel || 'email'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    {candidate.archetype && (
                      <Badge variant="outline" className="text-xs shrink-0 border-purple-200 text-purple-700 bg-purple-50">
                        {archetypeLabels[candidate.archetype as PlayerArchetype]}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs tabular-nums shrink-0">
                      Score: {candidate.score}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs tabular-nums shrink-0 ${
                        candidate.totalHistoricalBookings >= 10
                          ? 'border-green-200 text-green-700'
                          : ''
                      }`}
                    >
                      {candidate.totalHistoricalBookings} bookings
                    </Badge>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : candidate.member.id)}
                      className="p-1 rounded hover:bg-muted shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3">
                      <div className="border-t pt-3" />

                      {/* AI reasoning */}
                      <div className="text-sm text-muted-foreground">
                        {candidate.reasoning.summary}
                      </div>

                      {/* Score breakdown */}
                      {candidate.reasoning.components && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(candidate.reasoning.components).map(
                            ([key, comp]: [string, any]) => (
                              <div key={key} className="text-xs p-2 rounded-md bg-muted/50">
                                <div className="text-muted-foreground capitalize mb-0.5">
                                  {key.replace(/_/g, ' ')}
                                </div>
                                <div className="font-semibold tabular-nums">
                                  <span className={
                                    comp.score >= 70 ? 'text-green-600' :
                                    comp.score >= 40 ? 'text-amber-600' : 'text-gray-500'
                                  }>
                                    {comp.score}
                                  </span>
                                  <span className="text-muted-foreground font-normal">/100</span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Suggested sessions */}
                      {candidate.suggestedSessions?.length > 0 && (
                        <div className="p-3 rounded-md bg-green-50/50 border border-green-100">
                          <div className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Suggested Sessions
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.suggestedSessions.slice(0, 3).map((session: any) => (
                              <Badge
                                key={session.id}
                                variant="outline"
                                className="text-green-700 border-green-200 bg-white text-xs"
                              >
                                {session.title}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        {isCsvPlayer(candidate.member) ? (
                          <CsvPlayerBadge />
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                setSelectedMemberId(candidate.member.id)
                                setSelectedChannel('email')
                                setSelectedMessageId('')
                                setShowEmailConfirm(true)
                              }}
                            >
                              <Mail className="h-3 w-3" /> Send Re-engagement Email
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                setSelectedMemberId(candidate.member.id)
                                setSelectedChannel('sms')
                                setSelectedMessageId('')
                                setShowEmailConfirm(true)
                              }}
                            >
                              <MessageSquare className="h-3 w-3" /> Send SMS
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-xs opacity-50 cursor-not-allowed"
                              disabled
                            >
                              <Bell className="h-3 w-3" /> Push
                              <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1 py-0 font-medium ml-0.5">
                                Soon
                              </Badge>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Search no results */}
      {data && data.candidates.length > 0 && filteredCandidates.length === 0 && searchQuery && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No members match &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* Send confirm modal */}
      <ConfirmModal
        open={showEmailConfirm}
        size="lg"
        title={selectedChannel === 'sms' ? 'Send Re-engagement SMS' : 'Send Re-engagement Email'}
        description={
          selectedChannel === 'sms'
            ? 'Choose a message style for the SMS.'
            : 'Choose a message style for the re-engagement email.'
        }
        confirmText={selectedChannel === 'sms' ? 'Send SMS' : 'Send Email'}
        isPending={sendReactivation.isPending}
        onClose={() => {
          setShowEmailConfirm(false)
          setSelectedMemberId(null)
        }}
        onConfirm={() => {
          if (!selectedMemberId || !selectedMessage) return
          const customMessage = selectedChannel === 'sms'
            ? selectedMessage.smsBody
            : selectedMessage.emailBody
          sendReactivation.mutate(
            {
              clubId,
              candidates: [{ memberId: selectedMemberId, channel: selectedChannel }],
              customMessage,
            },
            {
              onSuccess: (data: any) => {
                toast({
                  title: data.sent > 0 ? 'Message sent!' : 'Failed to send',
                  description: data.sent > 0
                    ? `Successfully sent ${selectedChannel === 'sms' ? 'SMS' : 'email'} to member.`
                    : data.results?.[0]?.error || 'Unknown error',
                  variant: data.sent > 0 ? 'default' : 'destructive',
                })
                setShowEmailConfirm(false)
                setSelectedMemberId(null)
              },
              onError: (err: any) => {
                toast({
                  title: 'Failed to send',
                  description: err.message,
                  variant: 'destructive',
                })
              },
            }
          )
        }}
      >
        {messageVariants.length > 0 && (
          <MessageSelector
            variants={messageVariants}
            selectedId={selectedMessageId}
            channel={selectedChannel}
            onSelect={setSelectedMessageId}
          />
        )}
      </ConfirmModal>
    </div>
  )
}
