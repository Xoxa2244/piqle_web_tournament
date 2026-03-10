'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Zap, Calendar, Send, CheckCircle, Star, Clock, Search,
  Users, ChevronDown, ChevronUp, CalendarPlus
} from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'
import { OccupancyBadge } from '../_components/charts'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { useDashboardV2, useSlotFillerRecommendations, useSendInvites } from '../_hooks/use-intelligence'

export default function SlotFillerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const preSelectedSessionId = searchParams.get('session')

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(preSelectedSessionId)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [inviteSent, setInviteSent] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
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
    setSelectedUserIds(new Set(filteredRecs.map((r: any) => r.member.id)))
  }

  const deselectAll = () => setSelectedUserIds(new Set())

  const handleSendInvites = () => {
    if (!selectedSessionId || selectedUserIds.size === 0) return
    sendInvitesMutation.mutate({
      sessionId: selectedSessionId,
      userIds: Array.from(selectedUserIds),
    })
  }

  const selectedSession = recommendations?.session

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
              {sendInvitesMutation.data?.invitedCount} members were invited to this session.
            </span>
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
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => toggleUser(rec.member.id)}
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

                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />}
                      </div>
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
        description={`Invite ${selectedUserIds.size} member${selectedUserIds.size !== 1 ? 's' : ''} to this session? They'll receive a notification to join.`}
        confirmText={`Send ${selectedUserIds.size} Invite${selectedUserIds.size !== 1 ? 's' : ''}`}
        isPending={sendInvitesMutation.isPending}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSendInvites}
      />
    </div>
  )
}
