'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Sparkles, Users, Calendar, Clock, CalendarPlus, DollarSign,
  MapPin, CheckCircle2, Send, AlertTriangle,
  Target, Upload, Mail, MessageSquare,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useEventRecommendations, useSendEventInvites, useEventsList } from '../_hooks/use-intelligence'
import { MessageSelector } from '../_components/message-selector'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import { isCsvPlayer, CsvPlayerBadge } from '../_components/csv-player-badge'
import ConfirmModal from '@/components/ConfirmModal'
import {
  generateEventInviteMessages,
  classifyPlayerRole,
  type EventMessageVariant,
} from '@/lib/ai/event-messages'
import type { MatchedPlayer, EventRecommendation } from '@/types/intelligence'
import { useBrand } from '@/components/BrandProvider'
import { SessionsIQ } from '../_components/iq-pages/SessionsIQ'

// ── Component ──────────────────────────────────────────────────────────────

export default function EventGeneratorPage() {
  const params = useParams()
  const clubId = params.id as string
  const { toast } = useToast()
  const { data, isLoading, error } = useEventRecommendations(clubId)
  const { data: eventsListData } = useEventsList(clubId)
  const sendEventInvites = useSendEventInvites()

  const aiEvents = data?.events ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Invite state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEventId, setInviteEventId] = useState<string | null>(null)
  const [inviteMode, setInviteMode] = useState<'single' | 'all'>('all')
  const [selectedPlayerIdx, setSelectedPlayerIdx] = useState<number | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'sms'>('email')
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [sentEventIds, setSentEventIds] = useState<Set<string>>(new Set())

  // Auto-expand first event when data loads
  useEffect(() => {
    if (aiEvents.length > 0 && expandedId === null) {
      setExpandedId(aiEvents[0].id)
    }
  }, [aiEvents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalRevenue = aiEvents.reduce((s, e) => s + e.netRevenue, 0)
  const totalPlayers = aiEvents.reduce((s, e) => s + e.matchedPlayers.length, 0)

  // Current event for invite modal
  const inviteEvent = aiEvents.find(e => e.id === inviteEventId)

  // Target players for the invite
  const targetPlayers = useMemo(() => {
    if (!inviteEvent) return []
    if (inviteMode === 'single' && selectedPlayerIdx !== null) {
      return [inviteEvent.matchedPlayers[selectedPlayerIdx]].filter(Boolean)
    }
    return inviteEvent.matchedPlayers
  }, [inviteEvent, inviteMode, selectedPlayerIdx])

  // Generate message variants for the first target player (preview)
  const messageVariants = useMemo((): EventMessageVariant[] => {
    if (!inviteEvent || targetPlayers.length === 0) return []
    const player = targetPlayers[0]
    const allDuprs = inviteEvent.matchedPlayers.map(p => p.dupr)
    const role = classifyPlayerRole({
      dupr: player.dupr,
      totalEvents: player.tournaments,
      lastPlayed: player.lastPlayed,
      allDuprs,
    })
    return generateEventInviteMessages({
      playerName: player.name,
      clubName: 'Your Club',
      eventType: inviteEvent.type,
      eventTitle: inviteEvent.title,
      eventDate: inviteEvent.suggestedDate,
      eventTime: inviteEvent.suggestedTime,
      eventPrice: inviteEvent.suggestedPrice,
      spotsLeft: inviteEvent.maxPlayers - inviteEvent.matchedPlayers.length,
      totalSpots: inviteEvent.maxPlayers,
      playerRole: role,
      duprRating: player.dupr,
      lastPlayed: player.lastPlayed,
      totalEvents: player.tournaments,
      skillRange: inviteEvent.skillRange,
    })
  }, [inviteEvent, targetPlayers])

  // Auto-select recommended message
  useEffect(() => {
    if (messageVariants.length > 0 && !selectedMessageId) {
      const rec = messageVariants.find(v => v.recommended)
      setSelectedMessageId(rec?.id || messageVariants[0].id)
    }
  }, [messageVariants]) // eslint-disable-line react-hooks/exhaustive-deps

  const openInviteModal = (event: EventRecommendation, mode: 'single' | 'all', playerIdx?: number) => {
    setInviteEventId(event.id)
    setInviteMode(mode)
    setSelectedPlayerIdx(playerIdx ?? null)
    setSelectedMessageId('')
    setShowInviteModal(true)
  }

  const handleSendInvites = () => {
    if (!inviteEvent) return
    const selectedVariant = messageVariants.find(v => v.id === selectedMessageId) || messageVariants[0]
    if (!selectedVariant) return

    // Build per-player candidates with personalized messages
    const candidates = targetPlayers
      .filter(p => !isCsvPlayer(p))
      .map(player => {
        const allDuprs = inviteEvent.matchedPlayers.map(p => p.dupr)
        const role = classifyPlayerRole({
          dupr: player.dupr,
          totalEvents: player.tournaments,
          lastPlayed: player.lastPlayed,
          allDuprs,
        })
        const variants = generateEventInviteMessages({
          playerName: player.name,
          clubName: 'Your Club',
          eventType: inviteEvent.type,
          eventTitle: inviteEvent.title,
          eventDate: inviteEvent.suggestedDate,
          eventTime: inviteEvent.suggestedTime,
          eventPrice: inviteEvent.suggestedPrice,
          spotsLeft: inviteEvent.maxPlayers - inviteEvent.matchedPlayers.length,
          totalSpots: inviteEvent.maxPlayers,
          playerRole: role,
          duprRating: player.dupr,
          lastPlayed: player.lastPlayed,
          totalEvents: player.tournaments,
          skillRange: inviteEvent.skillRange,
        })
        const variant = variants.find(v => v.id === selectedMessageId) || variants[0]
        return {
          memberId: player.id,
          channel: selectedChannel as 'email' | 'sms' | 'both',
          customMessage: selectedChannel === 'sms' ? variant.smsBody : variant.emailBody,
        }
      })

    const csvCount = targetPlayers.filter(p => isCsvPlayer(p)).length

    sendEventInvites.mutate(
      {
        clubId,
        eventTitle: inviteEvent.title,
        eventDate: inviteEvent.suggestedDate,
        eventTime: inviteEvent.suggestedTime,
        eventPrice: inviteEvent.suggestedPrice,
        candidates,
      },
      {
        onSuccess: (result: any) => {
          const sent = result.sent || 0
          const failed = result.failed || 0
          toast({
            title: sent > 0 ? 'Invites sent!' : 'Failed to send',
            description: sent > 0
              ? `Sent ${sent} personalized ${selectedChannel === 'sms' ? 'SMS' : 'email'}${sent > 1 ? 's' : ''}.${csvCount > 0 ? ` ${csvCount} CSV player${csvCount > 1 ? 's' : ''} skipped (no email).` : ''}${failed > 0 ? ` ${failed} failed.` : ''}`
              : result.results?.[0]?.error || 'Unknown error',
            variant: sent > 0 ? 'default' : 'destructive',
          })
          if (sent > 0) {
            setSentEventIds(prev => new Set([...Array.from(prev), inviteEvent.id]))
          }
          setShowInviteModal(false)
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
  }

  const getUrgencyBadge = (u: 'high' | 'medium' | 'low') => {
    if (u === 'high') return 'bg-red-100 text-red-800'
    if (u === 'medium') return 'bg-amber-100 text-amber-800'
    return 'bg-gray-100 text-gray-800'
  }

  // isCsvPlayer is now imported from shared component

  const brand = useBrand()
  if (brand.key === 'iqsport') return <SessionsIQ initialTab="events" eventsListData={eventsListData} clubId={clubId} />

  // ── Loading ──
  if (isLoading) return <ListSkeleton rows={4} />

  // ── Error ──
  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Failed to load events"
        description={(error as any)?.message || 'Could not generate event recommendations.'}
      />
    )
  }

  // ── Empty ──
  if (aiEvents.length === 0) {
    return (
      <EmptyState
        icon={data?.needsCsvImport ? Upload : CalendarPlus}
        title={data?.needsCsvImport ? 'Session data needed' : 'No events to recommend yet'}
        description={
          data?.needsCsvImport
            ? 'Import your session history so AI can analyze player clusters and recommend optimal events.'
            : 'We need more member activity to identify player clusters. As members book sessions, AI will start recommending events.'
        }
        actionLabel={data?.needsCsvImport ? 'Import Session Data' : undefined}
        onAction={data?.needsCsvImport ? () => window.location.href = `/clubs/${clubId}/intelligence/advisor` : undefined}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* ── KPI Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={CalendarPlus}
          label="Events Suggested"
          value={aiEvents.length}
        />
        <MetricCard
          icon={Users}
          label="Players Matched"
          value={totalPlayers}
        />
        <MetricCard
          icon={DollarSign}
          label="Projected Net Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          variant="success"
        />
        <MetricCard
          icon={Target}
          label="Avg Fill Confidence"
          value={`${Math.round(aiEvents.reduce((s, e) => s + e.fillConfidence, 0) / aiEvents.length)}%`}
        />
      </div>

      {/* ── Event Cards ── */}
      {aiEvents.map(event => {
        const isExpanded = expandedId === event.id
        const isSent = sentEventIds.has(event.id)
        const invitableCount = event.matchedPlayers.filter(p => !isCsvPlayer(p)).length

        return (
          <div key={event.id} className={cn(
            'rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden',
            isSent && 'border-green-300 bg-green-50/30'
          )}>
            <div
              className="cursor-pointer p-5"
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{event.emoji}</span>
                    <h3 className="text-lg font-bold text-foreground">{event.title}</h3>
                    <Badge className={getUrgencyBadge(event.urgency)}>
                      {event.urgency} opportunity
                    </Badge>
                    <Badge variant="outline">{event.type}</Badge>
                    {isSent && (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Invites Sent
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{event.reason}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {event.suggestedDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {event.suggestedTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.courts} courts
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {event.matchedPlayers.length}/{event.maxPlayers} players
                    </span>
                    <span className="flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      {event.skillRange}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-bold text-green-600">${event.netRevenue}</p>
                  <p className="text-xs text-muted-foreground">net revenue</p>
                  <p className="text-xs text-muted-foreground mt-1">${event.suggestedPrice}/player</p>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border/60 px-5 pb-5 pt-5 space-y-6">
                {/* AI Insights */}
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">AI Insights</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {event.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        {insight}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue Breakdown */}
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
                      <DollarSign className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">Revenue Breakdown</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border/60 bg-card shadow-sm p-4 text-center">
                      <p className="text-xs text-muted-foreground">Gross Revenue</p>
                      <p className="text-lg font-bold">${event.projectedRevenue}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.maxPlayers} x ${event.suggestedPrice}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card shadow-sm p-4 text-center">
                      <p className="text-xs text-muted-foreground">Court Cost</p>
                      <p className="text-lg font-bold text-red-500">-${event.courtCost}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.type === 'Ladder'
                          ? 'registration fee'
                          : `${event.courts} courts x ${event.type === 'League' ? `${event.leagueWeeks || 6} weeks` : `${event.durationHours || 3} hrs`}`
                        }
                      </p>
                    </div>
                    <div className="rounded-xl border border-green-200 bg-card shadow-sm p-4 text-center">
                      <p className="text-xs text-muted-foreground">Net Revenue</p>
                      <p className="text-lg font-bold text-green-600">${event.netRevenue}</p>
                      <p className="text-xs text-green-600">
                        {event.fillConfidence}% fill confidence
                      </p>
                    </div>
                  </div>
                </div>

                {/* Matched Players */}
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">
                      AI-Matched Players ({event.matchedPlayers.length}/{event.maxPlayers})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {event.matchedPlayers.map((player, i) => {
                      const csv = isCsvPlayer(player)
                      return (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                          <span>{player.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{player.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {player.lastPlayed} · {player.tournaments} events
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {player.dupr}
                          </Badge>
                          {csv ? (
                            <CsvPlayerBadge variant="compact" />
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); openInviteModal(event, 'single', i) }}
                              className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
                              title="Send invite"
                            >
                              <Mail className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {event.maxPlayers > event.matchedPlayers.length && (
                      <div className="flex items-center justify-center p-2.5 rounded-lg border-2 border-dashed border-muted-foreground/20">
                        <span className="text-sm text-muted-foreground">
                          +{event.maxPlayers - event.matchedPlayers.length} open spots
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Format Details */}
                <div className="flex items-center gap-6 text-sm bg-muted/50 rounded-lg p-4">
                  <div>
                    <span className="text-muted-foreground">Format: </span>
                    <span className="font-medium">{event.format}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Skill: </span>
                    <span className="font-medium">{event.skillRange}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Courts: </span>
                    <span className="font-medium">{event.courts}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  {/* Channel selector */}
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

                  {isSent ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Invites sent to {invitableCount} players
                      </span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => openInviteModal(event, 'all')}
                      className="gap-2"
                      disabled={invitableCount === 0}
                    >
                      <Send className="h-4 w-4" />
                      Invite All ({invitableCount} players)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Invite Modal */}
      <ConfirmModal
        open={showInviteModal}
        size="lg"
        title={
          inviteMode === 'all'
            ? `Invite ${targetPlayers.filter(p => !isCsvPlayer(p)).length} Players`
            : `Invite ${targetPlayers[0]?.name || 'Player'}`
        }
        description={
          inviteMode === 'all'
            ? `Send personalized ${selectedChannel === 'sms' ? 'SMS' : 'email'} invites to each matched player for ${inviteEvent?.title || 'this event'}.`
            : `Send a personalized ${selectedChannel === 'sms' ? 'SMS' : 'email'} invite.`
        }
        confirmText={
          inviteMode === 'all'
            ? `Send ${targetPlayers.filter(p => !isCsvPlayer(p)).length} Personalized Invites`
            : 'Send Invite'
        }
        isPending={sendEventInvites.isPending}
        onClose={() => { setShowInviteModal(false); setSelectedMessageId('') }}
        onConfirm={handleSendInvites}
      >
        {messageVariants.length > 0 && (
          <MessageSelector
            variants={messageVariants as any}
            selectedId={selectedMessageId}
            channel={selectedChannel}
            onSelect={setSelectedMessageId}
          />
        )}
        {inviteMode === 'all' && (
          <div className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg p-3">
            <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
            Each player will receive a <strong>personalized message</strong> based on their DUPR, activity level, and role in this event.
            {targetPlayers.filter(p => isCsvPlayer(p)).length > 0 && (
              <span className="block mt-1 text-amber-600">
                {targetPlayers.filter(p => isCsvPlayer(p)).length} CSV player{targetPlayers.filter(p => isCsvPlayer(p)).length > 1 ? 's' : ''} will be skipped (no email on file).
              </span>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  )
}
