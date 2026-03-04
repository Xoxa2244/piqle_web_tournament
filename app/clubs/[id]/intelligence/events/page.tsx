'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Sparkles, Users, Calendar, Clock, DollarSign,
  Trophy, MapPin, Zap, CheckCircle2, Send, ArrowRight,
  BarChart3, Star, TrendingUp, Target
} from 'lucide-react'

// ── Mock AI-Generated Events ───────────────────────────────────────────────

const aiEvents = [
  {
    id: 'rr-advanced',
    type: 'Round Robin',
    title: 'Advanced Round Robin Showdown',
    emoji: '🏆',
    urgency: 'high' as const,
    reason: 'Detected 14 players rated DUPR 4.0+ who rarely play each other. High engagement potential.',
    suggestedDate: 'Saturday, Mar 8',
    suggestedTime: '4:00 PM – 7:00 PM',
    courts: 4,
    format: 'Round Robin (pools of 4 → single elimination)',
    skillRange: '4.0 – 5.0 DUPR',
    suggestedPrice: 25,
    maxPlayers: 16,
    matchedPlayers: [
      { name: 'Carlos Mendez', dupr: 4.5, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 12 },
      { name: 'Tom Wilson', dupr: 4.8, emoji: '⭐', lastPlayed: '3 days ago', tournaments: 18 },
      { name: 'Jake Martinez', dupr: 4.6, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 15 },
      { name: 'David Park', dupr: 4.1, emoji: '📈', lastPlayed: '5 days ago', tournaments: 8 },
      { name: 'Sarah Kim', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 10 },
      { name: 'Lisa Park', dupr: 4.0, emoji: '📈', lastPlayed: '6 days ago', tournaments: 6 },
      { name: 'Alex Rivera', dupr: 4.3, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 11 },
      { name: 'Jennifer Wu', dupr: 4.1, emoji: '📈', lastPlayed: '3 days ago', tournaments: 7 },
      { name: 'Ryan Torres', dupr: 4.4, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 14 },
      { name: 'Emily Zhang', dupr: 4.0, emoji: '📈', lastPlayed: '5 days ago', tournaments: 5 },
      { name: 'Chris Lee', dupr: 4.7, emoji: '⭐', lastPlayed: '2 days ago', tournaments: 16 },
      { name: 'Nicole Adams', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 9 },
      { name: 'Brandon Kim', dupr: 4.3, emoji: '🔥', lastPlayed: '3 days ago', tournaments: 13 },
      { name: 'Sophia Chen', dupr: 4.1, emoji: '📈', lastPlayed: '6 days ago', tournaments: 7 },
    ],
    projectedRevenue: 400,
    courtCost: 80,
    netRevenue: 320,
    fillConfidence: 92,
    insights: [
      '14 of 16 spots auto-filled from member base — only 2 open slots needed',
      'Saturday 4PM has 0% court utilization currently — pure incremental revenue',
      'Average tournament player visits club 2x more the following week',
      'Similar events had 95% return rate for participants',
    ],
  },
  {
    id: 'beginner-social',
    type: 'Social Mixer',
    title: 'New Player Welcome Mixer',
    emoji: '🎉',
    urgency: 'medium' as const,
    reason: '8 new members (joined in last 30 days) haven\'t attended any events yet. Social event lowers the barrier.',
    suggestedDate: 'Sunday, Mar 9',
    suggestedTime: '10:00 AM – 12:00 PM',
    courts: 2,
    format: 'Rotating Partners (King of the Court)',
    skillRange: '2.0 – 3.0 DUPR',
    suggestedPrice: 10,
    maxPlayers: 12,
    matchedPlayers: [
      { name: 'New Player 1', dupr: 2.5, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
      { name: 'New Player 2', dupr: 2.8, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
      { name: 'New Player 3', dupr: 2.3, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
      { name: 'Maria Garcia', dupr: 2.8, emoji: '🤝', lastPlayed: '12 days ago', tournaments: 2 },
      { name: 'Bob Jones', dupr: 2.5, emoji: '🤝', lastPlayed: '8 days ago', tournaments: 1 },
      { name: 'Steve Brown', dupr: 2.6, emoji: '🤝', lastPlayed: '10 days ago', tournaments: 3 },
      { name: 'New Player 4', dupr: 2.6, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
      { name: 'New Player 5', dupr: 2.7, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
    ],
    projectedRevenue: 120,
    courtCost: 40,
    netRevenue: 80,
    fillConfidence: 75,
    insights: [
      'New member retention jumps 40% after first social event',
      'Mixing new + existing social players creates natural mentoring',
      'Low price point ($10) removes cost barrier for first-timers',
      'Sunday morning has 25% court utilization — underused slot',
    ],
  },
  {
    id: 'doubles-league',
    type: 'Mini League',
    title: 'Wednesday Night Doubles League',
    emoji: '⚡',
    urgency: 'high' as const,
    reason: '12 intermediate players book Wednesday evenings regularly but without structure. A league would lock in 6-week commitment.',
    suggestedDate: 'Starting Wed, Mar 12 (6 weeks)',
    suggestedTime: '6:30 PM – 8:30 PM',
    courts: 3,
    format: 'Fixed Doubles Teams, Round Robin (6 weeks)',
    skillRange: '3.0 – 3.8 DUPR',
    suggestedPrice: 35,
    maxPlayers: 12,
    matchedPlayers: [
      { name: 'Alex Rivera', dupr: 3.8, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 11 },
      { name: 'Mike Thompson', dupr: 3.5, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 5 },
      { name: 'Jennifer Wu', dupr: 3.6, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 7 },
      { name: 'Emily Zhang', dupr: 3.4, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 5 },
      { name: 'Jason Lee', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 8 },
      { name: 'Amanda Cruz', dupr: 3.9, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
      { name: 'Kevin Park', dupr: 3.3, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 4 },
      { name: 'Rachel Kim', dupr: 3.5, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 7 },
      { name: 'Brian Johnson', dupr: 3.6, emoji: '🎯', lastPlayed: '1 day ago', tournaments: 9 },
      { name: 'Tina Chen', dupr: 3.2, emoji: '🎯', lastPlayed: '6 days ago', tournaments: 3 },
      { name: 'Mark Davis', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 10 },
      { name: 'Sara Wilson', dupr: 3.4, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
    ],
    projectedRevenue: 2520,
    courtCost: 480,
    netRevenue: 2040,
    fillConfidence: 88,
    insights: [
      '6-week commitment = $35/week × 6 = $210/player guaranteed revenue',
      'Total projected: $2,520 over 6 weeks from 12 players',
      'Wednesday evening utilization jumps from 45% to 90%',
      'League players show 3x higher retention vs casual bookers',
    ],
  },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function EventGeneratorPage() {
  const params = useParams()
  const clubId = params.id as string
  const [expandedId, setExpandedId] = useState<string | null>(aiEvents[0].id)
  const [createdIds, setCreatedIds] = useState<Set<string>>(new Set())

  const totalRevenue = aiEvents.reduce((s, e) => s + e.netRevenue, 0)
  const totalPlayers = aiEvents.reduce((s, e) => s + e.matchedPlayers.length, 0)

  const handleCreate = (id: string) => {
    setCreatedIds(prev => new Set([...Array.from(prev), id]))
  }

  const getUrgencyBadge = (u: 'high' | 'medium' | 'low') => {
    if (u === 'high') return 'bg-red-100 text-red-800'
    if (u === 'medium') return 'bg-amber-100 text-amber-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={`/clubs/${clubId}/intelligence`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Intelligence</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-500/10 rounded-lg">
              <Trophy className="w-6 h-6 text-orange-600" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Event Generator</h1>
            <Badge className="bg-orange-100 text-orange-800">AI Powered</Badge>
          </div>
          <p className="text-muted-foreground">
            AI identified player clusters and recommends {aiEvents.length} events to maximize revenue and engagement
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-sm text-muted-foreground">Events Suggested</p>
              <p className="text-3xl font-bold">{aiEvents.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-sm text-muted-foreground">Players Matched</p>
              <p className="text-3xl font-bold">{totalPlayers}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-5 pb-5">
              <p className="text-sm text-muted-foreground">Projected Net Revenue</p>
              <p className="text-3xl font-bold text-green-600">${totalRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-sm text-muted-foreground">Avg Fill Confidence</p>
              <p className="text-3xl font-bold">
                {Math.round(aiEvents.reduce((s, e) => s + e.fillConfidence, 0) / aiEvents.length)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Event Cards */}
        {aiEvents.map(event => {
          const isExpanded = expandedId === event.id
          const isCreated = createdIds.has(event.id)

          return (
            <Card key={event.id} className={cn(isCreated && 'border-green-300 bg-green-50/30')}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{event.emoji}</span>
                      <CardTitle className="text-lg">{event.title}</CardTitle>
                      <Badge className={getUrgencyBadge(event.urgency)}>
                        {event.urgency} opportunity
                      </Badge>
                      <Badge variant="outline">{event.type}</Badge>
                      {isCreated && (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Created
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">{event.reason}</CardDescription>
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
              </CardHeader>

              {isExpanded && (
                <CardContent className="border-t pt-6 space-y-6">
                  {/* AI Insights */}
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">AI Insights</span>
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
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4 pb-4 text-center">
                        <p className="text-xs text-muted-foreground">Gross Revenue</p>
                        <p className="text-lg font-bold">${event.projectedRevenue}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.maxPlayers} × ${event.suggestedPrice}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-4 text-center">
                        <p className="text-xs text-muted-foreground">Court Cost</p>
                        <p className="text-lg font-bold text-red-500">-${event.courtCost}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.courts} courts × {event.id === 'doubles-league' ? '6 weeks' : '3 hrs'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-green-200">
                      <CardContent className="pt-4 pb-4 text-center">
                        <p className="text-xs text-muted-foreground">Net Revenue</p>
                        <p className="text-lg font-bold text-green-600">${event.netRevenue}</p>
                        <p className="text-xs text-green-600">
                          {event.fillConfidence}% fill confidence
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Matched Players */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">
                      AI-Matched Players ({event.matchedPlayers.length}/{event.maxPlayers})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {event.matchedPlayers.map((player, i) => (
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
                        </div>
                      ))}
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
                  <div className="flex gap-3 pt-2">
                    {!isCreated ? (
                      <>
                        <Button onClick={() => handleCreate(event.id)} className="gap-2">
                          <Zap className="w-4 h-4" />
                          Create Event & Send Invites
                        </Button>
                        <Button variant="outline" className="gap-2">
                          Edit Details
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">
                          Event created! Invites sent to {event.matchedPlayers.length} players.
                        </span>
                        <Link
                          href={`/clubs/${clubId}/intelligence`}
                          className="text-primary hover:underline ml-2 text-sm"
                        >
                          View in Dashboard →
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
