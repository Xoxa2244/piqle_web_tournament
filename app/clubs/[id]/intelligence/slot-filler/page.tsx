'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Zap, Calendar, Send, CheckCircle, Star, Clock, Search,
  Users, ChevronDown, ChevronUp, CalendarPlus, Mail, MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmModal from '@/components/ConfirmModal'
import { OccupancyBadge } from '../_components/charts'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { isCsvPlayer, CsvPlayerBadge } from '../_components/csv-player-badge'
import { useDashboardV2, useSlotFillerRecommendations, useSendInvites } from '../_hooks/use-intelligence'
import { MessageSelector } from '../_components/message-selector'
import { generateSlotFillerMessages, classifySlotFillerPlayerType, playerTypeLabels } from '@/lib/ai/slot-filler-messages'
import { useSetPageContext } from '../_hooks/usePageContext'
import { useBrand } from '@/components/BrandProvider'
import { SlotFillerIQ } from '../_components/iq-pages/SlotFillerIQ'

export default function SlotFillerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const preSelectedSessionId = searchParams.get('session')

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(preSelectedSessionId)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [inviteSent, setInviteSent] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  // Get dashboard for session list (V2 has CSV fallback)
  const { data: dashboard, isLoading: loadingDashboard } = useDashboardV2(clubId)

  // Get recommendations for selected session (pass clubId for CSV sessions)
  const { data: recommendations, isLoading: loadingRecs } = useSlotFillerRecommendations(selectedSessionId, 15, clubId)

  // Send invites mutation
  const sendInvitesMutationRaw = useSendInvites()
  const sendInvitesMutation = {
    ...sendInvitesMutationRaw,
    mutate: (input: any) => {
      sendInvitesMutationRaw.mutate(input, {
        onSuccess: () => {
          setInviteSent(true)
          setSelectedUserIds(new Set())
          setShowConfirm(false)
        },
      })
    },
  }

  // V2: problematicSessions = underfilled, topSessions = well-performing
  const problematic = dashboard?.sessions?.problematicSessions || []
  const topSessions = dashboard?.sessions?.topSessions || []
  const allSessions = [...problematic, ...topSessions]
    .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i) // dedupe
  const sessionsToShow = problematic.length > 0 ? problematic : allSessions

  // Filter recommendations by search
  const filteredRecs = useMemo(() => {
    if (!recommendations?.recommendations) return []
    if (!searchQuery.trim()) return recommendations.recommendations
    const q = searchQuery.toLowerCase()
    return recommendations.recommendations.filter((rec: any) =>
      (rec.member.name || '').toLowerCase().includes(q) ||
      (rec.member.email || '').toLowerCase().includes(q)
    )
  }, [recommendations, searchQuery])

  const selectedSession = recommendations?.session

  const setPageContext = useSetPageContext()
  useEffect(() => {
    const parts = ['Page: Slot Filler']
    if (selectedSession) {
      parts.push(`Selected session: ${selectedSession.title} on ${selectedSession.date} ${selectedSession.startTime}-${selectedSession.endTime}, ${selectedSession.spotsRemaining} spots open, format: ${selectedSession.format}`)
    }
    if (recommendations?.recommendations) {
      parts.push(`${recommendations.totalCandidatesScored} candidates scored, showing top ${recommendations.recommendations.length}`)
      const top5 = recommendations.recommendations.slice(0, 5).map((r: any) =>
        `${r.member.name || r.member.email} (score: ${r.score}, likelihood: ${r.estimatedLikelihood})`
      )
      parts.push(`Top recommendations: ${top5.join(', ')}`)
    }
    if (!selectedSessionId && sessionsToShow.length > 0) {
      parts.push(`${sessionsToShow.length} sessions available to fill`)
      parts.push(`Underfilled sessions: ${sessionsToShow.map((s: any) => s.title + ' ' + (s.occupancyPercent ?? Math.round((s.confirmedCount / s.maxPlayers) * 100)) + '%').join(', ')}`)
    }
    setPageContext(parts.join('\n'))
  }, [selectedSession, recommendations, selectedSessionId, sessionsToShow, setPageContext])

  // Generate preview message variants based on first selected player
  const previewVariants = useMemo(() => {
    if (!selectedSession || selectedUserIds.size === 0 || !recommendations?.recommendations) return []
    const firstId = Array.from(selectedUserIds)[0]
    const rec = recommendations.recommendations.find((r: any) => r.member.id === firstId)
    if (!rec) return []

    const playerType = classifySlotFillerPlayerType({
      score: rec.score,
      likelihood: rec.estimatedLikelihood as 'high' | 'medium' | 'low',
      scheduleFitScore: rec.reasoning?.components?.schedule_fit?.score || 0,
    })

    return generateSlotFillerMessages({
      playerName: rec.member.name || 'there',
      clubName: selectedSession.clubName || 'the club',
      sessionTitle: selectedSession.title,
      sessionDate: selectedSession.date,
      sessionTime: `${selectedSession.startTime}–${selectedSession.endTime}`,
      sessionFormat: selectedSession.format,
      spotsLeft: selectedSession.spotsRemaining,
      playerType,
      score: rec.score,
      duprRating: rec.member.duprRatingDoubles,
      daysSinceLastPlay: rec.reasoning?.components?.recency?.score,
    })
  }, [selectedUserIds, recommendations, selectedSession])

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const selectAll = () => {
    if (!filteredRecs.length) return
    setSelectedUserIds(new Set(filteredRecs.filter((r: any) => !isCsvPlayer(r.member)).map((r: any) => r.member.id)))
  }

  const deselectAll = () => setSelectedUserIds(new Set())

  const handleSendInvites = () => {
    if (!selectedSessionId || selectedUserIds.size === 0 || !selectedSession) return

    // Determine which message variant style the admin picked
    const selectedVariant = previewVariants.find(v => v.id === selectedMessageId)
      || previewVariants.find(v => v.recommended)
      || previewVariants[0]

    sendInvitesMutation.mutate({
      sessionId: selectedSessionId,
      clubId,
      candidates: Array.from(selectedUserIds).map(memberId => {
        const rec = recommendations?.recommendations?.find((r: any) => r.member.id === memberId)

        // Generate per-player personalized message
        const playerType = classifySlotFillerPlayerType({
          score: rec?.score || 0,
          likelihood: (rec?.estimatedLikelihood || 'low') as 'high' | 'medium' | 'low',
          scheduleFitScore: rec?.reasoning?.components?.schedule_fit?.score || 0,
        })
        const variants = generateSlotFillerMessages({
          playerName: rec?.member?.name || 'there',
          clubName: selectedSession.clubName || 'the club',
          sessionTitle: selectedSession.title,
          sessionDate: selectedSession.date,
          sessionTime: `${selectedSession.startTime}–${selectedSession.endTime}`,
          sessionFormat: selectedSession.format,
          spotsLeft: selectedSession.spotsRemaining,
          playerType,
          score: rec?.score || 0,
          duprRating: rec?.member?.duprRatingDoubles,
          daysSinceLastPlay: rec?.reasoning?.components?.recency?.score,
        })

        // Use same variant style but personalized to this player
        const variant = selectedVariant
          ? (variants.find(v => v.id === selectedVariant.id) || variants[0])
          : variants[0]

        return {
          memberId,
          channel: selectedChannel,
          customMessage: selectedChannel === 'sms' ? variant.smsBody : variant.emailBody,
        }
      }),
    })
  }

  const brand = useBrand()
  if (brand.key === 'iqsport') return <SlotFillerIQ dashboardData={dashboard} recommendations={recommendations} isLoading={loadingDashboard || loadingRecs} sendInvites={sendInvitesMutationRaw} clubId={clubId} />

  // ── Session selector state ──
  if (!selectedSessionId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20">
            <CalendarPlus className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Select a Session</h2>
            <p className="text-xs text-muted-foreground">
              Choose a session to see AI-recommended members to invite.
            </p>
          </div>
        </div>

        {loadingDashboard ? (
          <ListSkeleton rows={4} />
        ) : sessionsToShow.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No Sessions Available"
            description="All upcoming sessions have great occupancy, or no sessions are scheduled yet."
          />
        ) : (
          <div className="space-y-2">
            {problematic.length > 0 && (
              <div className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">
                Needs Attention — Below 50% capacity
              </div>
            )}
            {sessionsToShow.map((session: any) => {
              const occ = session.occupancyPercent ?? (session.maxPlayers > 0
                ? Math.round((session.confirmedCount / session.maxPlayers) * 100)
                : 0)
              const spotsRemaining = session.maxPlayers - session.confirmedCount

              return (
                <button
                  key={session.id}
                  onClick={() => {
                    setSelectedSessionId(session.id)
                    setInviteSent(false)
                    setSelectedUserIds(new Set())
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card shadow-sm hover:border-primary/40 hover:shadow-md transition-all text-left group"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm group-hover:text-primary transition-colors">
                      {session.title}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {new Date(session.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                      <Clock className="h-3 w-3 ml-1 shrink-0" />
                      {session.startTime}–{session.endTime}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <OccupancyBadge value={occ} size="md" />
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {session.confirmedCount}/{session.maxPlayers}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {spotsRemaining} to fill
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Recommendations state ──
  return (
    <div className="space-y-4">
      {/* Session header */}
      {selectedSession && (
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="min-w-0">
            <div className="font-semibold">{selectedSession.title}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {new Date(selectedSession.date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
              {' '}· {selectedSession.startTime}–{selectedSession.endTime}
              {' '}· {selectedSession.format.replace(/_/g, ' ')}
              {selectedSession.skillLevel && ` · ${selectedSession.skillLevel.replace(/_/g, ' ')}`}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold text-green-600 tabular-nums">
                {selectedSession.spotsRemaining}
              </div>
              <div className="text-[10px] text-muted-foreground">spots open</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedSessionId(null)
                setSelectedUserIds(new Set())
                setInviteSent(false)
                setSearchQuery('')
              }}
              className="text-xs"
            >
              Change
            </Button>
          </div>
        </div>
      )}

      {/* Success alert */}
      {inviteSent && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50/50">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-green-800">Invites sent!</span>{' '}
            <span className="text-green-600">
              {sendInvitesMutation.data?.sent} member{sendInvitesMutation.data?.sent !== 1 ? 's' : ''} invited via {selectedChannel}.
            </span>
            {(sendInvitesMutation.data?.results?.some((r: any) => r.status === 'skipped')) && (
              <span className="text-amber-600 ml-1">
                {sendInvitesMutation.data.results.filter((r: any) => r.status === 'skipped').length} skipped (recently contacted).
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingRecs && <ListSkeleton rows={5} />}

      {/* Recommendations list */}
      {!loadingRecs && recommendations && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {recommendations.totalCandidatesScored} scored · {filteredRecs.length} shown
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs h-7">
                Select all
              </Button>
              {selectedUserIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={deselectAll} className="text-xs h-7">
                  Clear
                </Button>
              )}
              <div className="flex bg-muted/60 rounded-lg p-0.5">
                <button
                  onClick={() => setSelectedChannel('email')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    selectedChannel === 'email'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Mail className="h-3 w-3" /> Email
                </button>
                <button
                  onClick={() => setSelectedChannel('sms')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    selectedChannel === 'sms'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MessageSquare className="h-3 w-3" /> SMS
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={selectedUserIds.size === 0}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Invite ({selectedUserIds.size})
              </Button>
            </div>
          </div>

          {/* Message style selector */}
          {selectedUserIds.size > 0 && previewVariants.length > 0 && (
            <MessageSelector
              variants={previewVariants}
              selectedId={selectedMessageId}
              channel={selectedChannel}
              onSelect={setSelectedMessageId}
            />
          )}

          {/* Cards */}
          {filteredRecs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {searchQuery ? 'No members match your search.' : 'No recommendations available for this session.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRecs.map((rec: any, index: number) => {
                const isSelected = selectedUserIds.has(rec.member.id)
                const isExpanded = expandedCard === rec.member.id

                return (
                  <div
                    key={rec.member.id}
                    className={`rounded-xl border border-border/60 bg-card shadow-sm transition-all ${
                      isSelected ? 'border-primary ring-1 ring-primary/20' : 'hover:border-muted-foreground/20'
                    }`}
                  >
                    {/* Main row */}
                    <div
                      className={`flex items-center gap-3 p-3 ${isCsvPlayer(rec.member) ? 'cursor-default' : 'cursor-pointer'}`}
                      onClick={() => !isCsvPlayer(rec.member) && toggleUser(rec.member.id)}
                    >
                      {/* Rank/score circle */}
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          rec.score >= 75 ? 'bg-green-500' :
                          rec.score >= 50 ? 'bg-amber-500' : 'bg-gray-400'
                        }`}>
                          {rec.score}
                        </div>
                        {index < 3 && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                            {index + 1}
                          </div>
                        )}
                      </div>

                      {/* Name & details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {rec.member.name || rec.member.email}
                          </span>
                          {rec.estimatedLikelihood === 'high' && (
                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {rec.member.duprRatingDoubles
                            ? `DUPR ${rec.member.duprRatingDoubles}`
                            : 'No rating'}
                          {rec.member.gender && ` · ${rec.member.gender === 'M' ? 'Male' : 'Female'}`}
                          {' '}· {rec.estimatedLikelihood} likelihood
                          {' '}· <span className={cn(
                            'font-medium',
                            rec.score >= 80 && rec.estimatedLikelihood === 'high' ? 'text-green-600' :
                            rec.score >= 60 ? 'text-blue-600' :
                            rec.score >= 40 ? 'text-amber-600' : 'text-gray-500'
                          )}>
                            {playerTypeLabels[classifySlotFillerPlayerType({
                              score: rec.score,
                              likelihood: rec.estimatedLikelihood as 'high' | 'medium' | 'low',
                              scheduleFitScore: rec.reasoning?.components?.schedule_fit?.score || 0,
                            })]}
                          </span>
                        </div>
                      </div>

                      {/* Score pills (compact) */}
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        {Object.entries(rec.reasoning.components || {})
                          .sort(([, a]: any, [, b]: any) => b.score - a.score)
                          .slice(0, 3)
                          .map(([key, comp]: [string, any]) => (
                            <span
                              key={key}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                comp.score >= 70
                                  ? 'bg-green-100 text-green-700'
                                  : comp.score >= 40
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {key.replace(/_/g, ' ')}
                            </span>
                          ))}
                      </div>

                      {/* Expand toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedCard(isExpanded ? null : rec.member.id)
                        }}
                        className="p-1 rounded hover:bg-muted shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Checkbox or CSV badge */}
                      {isCsvPlayer(rec.member) ? (
                        <CsvPlayerBadge variant="compact" />
                      ) : (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                        }`}>
                          {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />}
                        </div>
                      )}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t mx-3 mt-0 pt-3">
                        <div className="text-sm text-muted-foreground mb-3">
                          {rec.reasoning.summary}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(rec.reasoning.components || {}).map(
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
                                  <span className="text-muted-foreground font-normal ml-1">
                                    (×{comp.weight})
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        open={showConfirm}
        title="Send Invitations"
        description={`Send ${selectedChannel === 'sms' ? 'SMS' : 'email'} invite to ${selectedUserIds.size} member${selectedUserIds.size !== 1 ? 's' : ''} for this session?`}
        confirmText={`Send ${selectedUserIds.size} Invite${selectedUserIds.size !== 1 ? 's' : ''}`}
        isPending={sendInvitesMutation.isPending}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSendInvites}
      />
    </div>
  )
}
