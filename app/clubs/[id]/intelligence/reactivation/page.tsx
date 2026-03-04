'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { ChevronLeft, Send, AlertCircle, Activity, Target, Calendar } from 'lucide-react'

// Mock reactivation candidates - represents what tRPC would return
const mockCandidates = [
  {
    id: 'u10',
    name: 'Robert Park',
    dupr: 3.9,
    score: 88,
    daysInactive: 25,
    totalBookings: 12,
    reasons: [
      '12 total bookings — was a very active member',
      'Inactive for 25 days — still in the window to re-engage'
    ],
    suggestedSessions: ['Wednesday Morning Doubles', 'Friday Social Play'],
    avatar: 'RP'
  },
  {
    id: 'u11',
    name: 'Lisa Chang',
    dupr: 3.2,
    score: 72,
    daysInactive: 35,
    totalBookings: 7,
    reasons: ['7 past bookings — moderately active', '3 matching sessions this week'],
    suggestedSessions: ['Thursday Evening Clinic'],
    avatar: 'LC'
  },
  {
    id: 'u12',
    name: 'Mike Johnson',
    dupr: 4.1,
    score: 58,
    daysInactive: 50,
    totalBookings: 4,
    reasons: [
      'Inactive for 50 days — getting further away, act soon',
      'Only 4 past bookings — light engagement'
    ],
    suggestedSessions: ['Saturday Competitive Drill'],
    avatar: 'MJ'
  },
  {
    id: 'u13',
    name: 'Ana Rodriguez',
    dupr: 2.8,
    score: 45,
    daysInactive: 68,
    totalBookings: 2,
    reasons: ['Inactive for 68 days — will need compelling offer', 'Partial preferences on file'],
    suggestedSessions: [],
    avatar: 'AR'
  },
]

const getScoreColor = (score: number) => {
  if (score >= 80) return 'bg-green-100 text-green-800'
  if (score >= 60) return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-800'
}

const getUrgencyColor = (daysInactive: number) => {
  if (daysInactive <= 30) return 'bg-red-100 text-red-800'
  if (daysInactive <= 60) return 'bg-orange-100 text-orange-800'
  return 'bg-gray-100 text-gray-800'
}

const getUrgencyLabel = (daysInactive: number) => {
  return `Inactive for ${daysInactive} days`
}

export default function ReactivationPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { toast } = useToast()
  const [engagedMembers, setEngagedMembers] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const clubId = params.id as string
  const inactiveCount = mockCandidates.length
  const totalMembers = 25 // Mock total members

  const handleSendReengagement = (memberId: string, memberName: string) => {
    setIsLoading(true)
    setTimeout(() => {
      setEngagedMembers((prev) => new Set([...prev, memberId]))
      setIsLoading(false)
      toast({
        title: 'Re-engagement offer sent!',
        description: `${memberName} has been sent a personalized offer to return to play.`,
      })
    }, 400)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href={`/clubs/${clubId}/intelligence`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Back to Intelligence</span>
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Member Reactivation</h1>
              <p className="text-muted-foreground">
                {inactiveCount} of {totalMembers} members inactive. Ranked by re-engagement potential.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-foreground">{inactiveCount}</div>
              <p className="text-xs text-muted-foreground mt-1">need re-engagement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4">
          {mockCandidates.map((candidate) => {
            const hasEngaged = engagedMembers.has(candidate.id)
            const displayedReasons = candidate.reasons.slice(0, 2)

            return (
              <Card key={candidate.id} className={cn('transition-colors', hasEngaged && 'bg-green-50')}>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                    {/* Left Section: Avatar & Member Info */}
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary">{candidate.avatar}</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{candidate.name}</h3>
                          <p className="text-xs text-muted-foreground">DUPR {candidate.dupr}</p>
                        </div>
                      </div>
                    </div>

                    {/* Center Section: Scores & Metrics */}
                    <div className="md:col-span-3">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Reactivation Score</p>
                          <Badge className={getScoreColor(candidate.score)}>
                            {candidate.score}/100
                          </Badge>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Status</p>
                          <Badge className={getUrgencyColor(candidate.daysInactive)}>
                            {getUrgencyLabel(candidate.daysInactive)}
                          </Badge>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Total Bookings</p>
                          <p className="text-sm font-medium text-foreground">{candidate.totalBookings} sessions</p>
                        </div>
                      </div>
                    </div>

                    {/* Right Section: Reasons & Suggestions */}
                    <div className="md:col-span-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Re-engagement Factors</p>
                          <div className="space-y-1">
                            {displayedReasons.map((reason, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground leading-relaxed">
                                • {reason}
                              </p>
                            ))}
                          </div>
                        </div>

                        {candidate.suggestedSessions.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Suggested Sessions</p>
                            <div className="space-y-1">
                              {candidate.suggestedSessions.map((session, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs bg-secondary px-2 py-1 rounded text-foreground font-medium"
                                >
                                  {session}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="md:col-span-3 flex items-end justify-end md:pt-2">
                      <Button
                        onClick={() => handleSendReengagement(candidate.id, candidate.name)}
                        variant={hasEngaged ? 'outline' : 'outline'}
                        size="sm"
                        disabled={hasEngaged || isLoading}
                        className={cn(
                          hasEngaged && 'bg-green-100 text-green-700 border-green-300 hover:bg-green-100 cursor-default'
                        )}
                      >
                        {hasEngaged ? (
                          <>
                            <Send className="w-3 h-3 mr-1.5" />
                            Offer Sent
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3 mr-1.5" />
                            Send Offer
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Summary Stats at Bottom */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                High Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {mockCandidates.filter((c) => c.daysInactive <= 30).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">inactive for ≤30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Medium Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">
                {mockCandidates.filter((c) => c.daysInactive > 30 && c.daysInactive <= 60).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">inactive for 31–60 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="w-4 h-4" />
                Low Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-600">
                {mockCandidates.filter((c) => c.daysInactive > 60).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">inactive for >60 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Offers Sent Counter */}
        {engagedMembers.size > 0 && (
          <Card className="mt-8 bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-900">
                    {engagedMembers.size} re-engagement offer{engagedMembers.size === 1 ? '' : 's'} sent
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Follow up with these members over the next 7 days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
