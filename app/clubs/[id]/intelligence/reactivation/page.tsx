'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  UserMinus, Calendar, Clock, Search, Users,
  TrendingDown, Mail, MessageSquare, ChevronDown, ChevronUp,
  Smile
} from 'lucide-react'
import { MetricCard } from '../_components/metric-card'
import { ListSkeleton } from '../_components/skeleton'
import { EmptyState } from '../_components/empty-state'
import ConfirmModal from '@/components/ConfirmModal'
import { useReactivationCandidates } from '../_hooks/use-intelligence'

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
  const [showEmailConfirm, setShowEmailConfirm] = useState(false)

  const { data, isLoading } = useReactivationCandidates(clubId, inactivityDays)

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

  return (
    <div className="space-y-5">
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
        <div className="grid grid-cols-3 gap-3">
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
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && <ListSkeleton rows={5} />}

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
                <div key={candidate.member.id} className="rounded-lg border bg-card">
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
                    </div>

                    {/* Badges */}
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setSelectedMemberId(candidate.member.id)
                            setShowEmailConfirm(true)
                          }}
                        >
                          <Mail className="h-3 w-3" /> Send Re-engagement Email
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" disabled>
                          <MessageSquare className="h-3 w-3" /> Push Notification
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">Soon</Badge>
                        </Button>
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

      {/* Email confirm modal */}
      <ConfirmModal
        open={showEmailConfirm}
        title="Send Re-engagement Email"
        description="Send a personalized re-engagement email to this member with session recommendations?"
        confirmText="Send Email"
        onClose={() => {
          setShowEmailConfirm(false)
          setSelectedMemberId(null)
        }}
        onConfirm={() => {
          // TODO: implement email sending
          setShowEmailConfirm(false)
          setSelectedMemberId(null)
        }}
      />
    </div>
  )
}
