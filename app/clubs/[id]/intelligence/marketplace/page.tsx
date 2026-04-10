'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Globe, Sparkles, Users, Calendar, Clock,
  DollarSign, TrendingUp, CheckCircle2, Zap, Eye, EyeOff,
  ArrowRight, ArrowUpRight, Settings, BarChart3, Target
} from 'lucide-react'

// ── Mock Data ──────────────────────────────────────────────────────────────

const clubSessions = [
  {
    id: '1',
    title: 'Wednesday Morning Open Play',
    court: 'Court 1 & 2',
    date: 'Wed, Mar 5',
    startTime: '09:00',
    endTime: '11:00',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    memberPrice: 0, // included in membership
    maxPlayers: 8,
    membersBooked: 3,
    spotsAvailable: 5,
    isPublished: true,
    dropInPrice: 12,
    guestsBooked: 1,
    impressions: 245,
    views: 48,
  },
  {
    id: '2',
    title: 'Wednesday Evening Drill',
    court: 'Court 3',
    date: 'Wed, Mar 5',
    startTime: '18:00',
    endTime: '20:00',
    format: 'DRILL',
    skillLevel: 'ADVANCED',
    memberPrice: 25,
    maxPlayers: 6,
    membersBooked: 4,
    spotsAvailable: 2,
    isPublished: true,
    dropInPrice: 25,
    guestsBooked: 0,
    impressions: 120,
    views: 22,
  },
  {
    id: '3',
    title: 'Thursday Evening Open Play',
    court: 'Court 1',
    date: 'Thu, Mar 6',
    startTime: '18:00',
    endTime: '20:00',
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    memberPrice: 0,
    maxPlayers: 8,
    membersBooked: 2,
    spotsAvailable: 6,
    isPublished: false,
    dropInPrice: 15,
    guestsBooked: 0,
    impressions: 0,
    views: 0,
  },
  {
    id: '4',
    title: 'Friday Social Play',
    court: 'Court 2',
    date: 'Fri, Mar 7',
    startTime: '17:00',
    endTime: '19:00',
    format: 'SOCIAL',
    skillLevel: 'ALL_LEVELS',
    memberPrice: 0,
    maxPlayers: 12,
    membersBooked: 4,
    spotsAvailable: 8,
    isPublished: true,
    dropInPrice: 10,
    guestsBooked: 3,
    impressions: 312,
    views: 67,
  },
  {
    id: '5',
    title: 'Saturday Morning All Courts',
    court: 'All Courts',
    date: 'Sat, Mar 8',
    startTime: '08:00',
    endTime: '12:00',
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    memberPrice: 0,
    maxPlayers: 24,
    membersBooked: 16,
    spotsAvailable: 8,
    isPublished: true,
    dropInPrice: 22,
    guestsBooked: 5,
    impressions: 580,
    views: 134,
  },
]

const marketplaceStats = {
  totalGuestBookings: 9,
  guestRevenue: 186,
  avgDropInPrice: 15.4,
  conversionRate: 6.2,
  impressions: 1257,
  newMembersFromGuests: 2,
}

const aiPricingSuggestions = [
  { sessionId: '1', reason: 'Session is tomorrow with 5 empty spots. Reduce from $12 to $8 to fill.', suggestedPrice: 8 },
  { sessionId: '3', reason: 'Thursday evening popular with non-members. Publish at $15 — AI predicts 3-4 bookings.', suggestedPrice: 15 },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function ClubMarketplacePage() {
  const params = useParams()
  const clubId = params.id as string
  const [sessions, setSessions] = useState(clubSessions)
  const [defaultDropInPrice, setDefaultDropInPrice] = useState('15')

  const togglePublish = (id: string) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, isPublished: !s.isPublished } : s
    ))
  }

  const publishAll = () => {
    setSessions(prev => prev.map(s =>
      s.spotsAvailable > 0 ? { ...s, isPublished: true } : s
    ))
  }

  const publishedCount = sessions.filter(s => s.isPublished).length
  const totalGuestSpots = sessions.filter(s => s.isPublished).reduce((s, x) => s + x.spotsAvailable, 0)

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

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-lime-500/20 to-green-500/10 rounded-lg">
                  <Globe className="w-6 h-6 text-lime-600" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Drop-In Marketplace</h1>
              </div>
              <p className="text-muted-foreground">
                Sell empty court time to non-members. Turn dead slots into revenue.
              </p>
            </div>
            <Button onClick={publishAll} className="gap-2">
              <Globe className="w-4 h-4" />
              Publish All Empty Slots
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground">Guest Bookings</p>
              <p className="text-2xl font-bold">{marketplaceStats.totalGuestBookings}</p>
              <p className="text-xs text-muted-foreground">this week</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground">Guest Revenue</p>
              <p className="text-2xl font-bold text-green-600">${marketplaceStats.guestRevenue}</p>
              <p className="text-xs text-muted-foreground">from empty slots</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground">Impressions</p>
              <p className="text-2xl font-bold">{marketplaceStats.impressions.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">players saw your slots</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground">Conversion</p>
              <p className="text-2xl font-bold">{marketplaceStats.conversionRate}%</p>
              <p className="text-xs text-muted-foreground">view → book</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs text-muted-foreground">Guest → Member</p>
              <p className="text-2xl font-bold text-blue-600">{marketplaceStats.newMembersFromGuests}</p>
              <p className="text-xs text-muted-foreground">conversions this month</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Suggestions */}
        {aiPricingSuggestions.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm">AI Pricing Suggestions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiPricingSuggestions.map((suggestion, i) => {
                const session = sessions.find(s => s.id === suggestion.sessionId)
                if (!session) return null
                return (
                  <div key={i} className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{suggestion.reason}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        {session.dropInPrice !== suggestion.suggestedPrice && (
                          <span className="text-xs text-muted-foreground line-through mr-2">
                            ${session.dropInPrice}
                          </span>
                        )}
                        <span className="text-sm font-bold text-primary">${suggestion.suggestedPrice}</span>
                      </div>
                      <Button size="sm" variant="outline">Apply</Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Session List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Sessions</h2>
            <p className="text-sm text-muted-foreground">
              {publishedCount} of {sessions.length} published · {totalGuestSpots} guest spots available
            </p>
          </div>

          <div className="space-y-3">
            {sessions.map(session => {
              const occupancyPercent = Math.round(((session.membersBooked + session.guestsBooked) / session.maxPlayers) * 100)

              return (
                <Card key={session.id} className={cn(
                  session.isPublished ? 'border-green-200' : 'border-muted opacity-75'
                )}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      {/* Toggle */}
                      <button
                        onClick={() => togglePublish(session.id)}
                        className={cn(
                          'p-2 rounded-lg transition-colors flex-shrink-0',
                          session.isPublished
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                        title={session.isPublished ? 'Published — click to hide' : 'Hidden — click to publish'}
                      >
                        {session.isPublished ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      </button>

                      {/* Session info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{session.title}</span>
                          <Badge variant="outline" className="text-xs">{session.court}</Badge>
                          {session.isPublished && (
                            <Badge className="bg-green-100 text-green-700 text-xs">Live</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {session.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {session.startTime}–{session.endTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {session.membersBooked} members + {session.guestsBooked} guests / {session.maxPlayers}
                          </span>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-center flex-shrink-0 w-20">
                        <p className="text-lg font-bold">${session.dropInPrice}</p>
                        <p className="text-xs text-muted-foreground">drop-in</p>
                      </div>

                      {/* Spots + Stats */}
                      <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0 w-36">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            'font-medium',
                            session.spotsAvailable > 4 ? 'text-red-600' : session.spotsAvailable > 2 ? 'text-orange-600' : 'text-green-600'
                          )}>
                            {session.spotsAvailable} empty
                          </span>
                          <div className="w-16 bg-secondary rounded-full h-1.5">
                            <div
                              className={cn(
                                'rounded-full h-1.5',
                                occupancyPercent >= 80 ? 'bg-green-500' : occupancyPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              )}
                              style={{ width: `${occupancyPercent}%` }}
                            />
                          </div>
                        </div>
                        {session.isPublished && session.impressions > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {session.impressions} views · {session.guestsBooked} booked
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <Card className="bg-gradient-to-r from-lime-50 to-green-50 border-lime-200">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Maximize empty court revenue</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI estimates <span className="font-semibold text-green-600">$340-520/week</span> in additional revenue by publishing all empty slots with dynamic pricing.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Pricing Rules
                </Button>
                <Button className="gap-2">
                  <Zap className="w-4 h-4" />
                  Enable Auto-Publish
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
