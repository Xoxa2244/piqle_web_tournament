'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { ChevronLeft, Send, TrendingUp, Users } from 'lucide-react'

// Mock recommendations - represents what tRPC would return
const mockRecommendations = [
  {
    id: 'u1',
    name: 'Maria Santos',
    dupr: 4.2,
    score: 92,
    likelihood: 'high',
    reasons: [
      'Prefers Wednesdays in the morning — perfect match',
      'Intermediate player — exact match for this session'
    ],
    avatar: 'MS'
  },
  {
    id: 'u2',
    name: 'James Chen',
    dupr: 3.8,
    score: 85,
    likelihood: 'high',
    reasons: [
      'Enjoys morning sessions but Wednesday isn\'t a preferred day',
      '1/3 sessions this week — 2 more to reach goal'
    ],
    avatar: 'JC'
  },
  {
    id: 'u3',
    name: 'Sarah Kim',
    dupr: 4.0,
    score: 78,
    likelihood: 'medium',
    reasons: ['Intermediate player — exact match', 'Last played 5 days ago — very active'],
    avatar: 'SK'
  },
  {
    id: 'u4',
    name: 'David Lopez',
    dupr: 3.5,
    score: 65,
    likelihood: 'medium',
    reasons: ['Close to the intermediate level', 'Enjoys Open Play format'],
    avatar: 'DL'
  },
  {
    id: 'u5',
    name: 'Emma Taylor',
    dupr: 4.5,
    score: 52,
    likelihood: 'low',
    reasons: [
      'Advanced player — skill gap with this intermediate session',
      'Wednesday morning doesn\'t match usual schedule'
    ],
    avatar: 'ET'
  },
]

// Mock session being filled
const mockSession = {
  id: '1',
  title: 'Wednesday Morning Doubles',
  date: 'Wednesday, March 5',
  startTime: '09:00',
  endTime: '11:00',
  maxPlayers: 8,
  confirmedCount: 3,
  courtName: 'Court 1'
}

const getLikelihoodColor = (likelihood: string) => {
  switch (likelihood) {
    case 'high':
      return 'bg-green-100 text-green-800'
    case 'medium':
      return 'bg-amber-100 text-amber-800'
    case 'low':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getScoreColor = (score: number) => {
  if (score >= 85) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-gray-600'
}

const getScoreBgColor = (score: number) => {
  if (score >= 85) return 'bg-green-100'
  if (score >= 60) return 'bg-amber-100'
  return 'bg-gray-100'
}

export default function SlotFillerPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const { toast } = useToast()
  const [invitedMembers, setInvitedMembers] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const clubId = params.id as string
  const sessionId = searchParams.get('sessionId')

  const handleSendInvite = (memberId: string, memberName: string) => {
    setIsLoading(true)
    // Simulate sending invite
    setTimeout(() => {
      setInvitedMembers((prev) => new Set([...prev, memberId]))
      setIsLoading(false)
      toast({
        title: 'Invite sent!',
        description: `${memberName} has been invited to join this session.`,
      })
    }, 400)
  }

  const handleInviteTop3 = () => {
    setIsLoading(true)
    // Invite the top 3 recommendations
    const top3 = mockRecommendations.slice(0, 3)
    const newInvited = new Set(invitedMembers)
    top3.forEach((r) => newInvited.add(r.id))

    setTimeout(() => {
      setInvitedMembers(newInvited)
      setIsLoading(false)
      toast({
        title: 'Invites sent!',
        description: `3 top recommendations have been invited to ${mockSession.title}.`,
      })
    }, 500)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href={`/clubs/${clubId}/intelligence`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Back to Intelligence</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">Fill Available Spots</h1>
          <p className="text-muted-foreground">AI recommendations for "{mockSession.title}"</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Session Summary Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">{mockSession.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="font-medium text-sm">{mockSession.date}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Time</p>
                <p className="font-medium text-sm">
                  {mockSession.startTime}–{mockSession.endTime}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Court</p>
                <p className="font-medium text-sm">{mockSession.courtName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Occupancy</p>
                <p className="font-medium text-sm">
                  {mockSession.confirmedCount}/{mockSession.maxPlayers} spots
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recommendations Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">Recommended Members</h2>
          <p className="text-sm text-muted-foreground">
            {mockRecommendations.length} members ranked by likelihood to accept and fit
          </p>
        </div>

        {/* Recommendations List */}
        <div className="space-y-3 mb-8">
          {mockRecommendations.map((recommendation) => {
            const isInvited = invitedMembers.has(recommendation.id)
            const displayedReasons = recommendation.reasons.slice(0, 2)

            return (
              <Card key={recommendation.id} className={cn('transition-colors', isInvited && 'bg-green-50')}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">{recommendation.avatar}</span>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">{recommendation.name}</h3>
                          <p className="text-xs text-muted-foreground">DUPR {recommendation.dupr}</p>
                        </div>
                      </div>

                      {/* Badges Row */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {/* Score Badge */}
                        <Badge
                          className={cn(
                            'text-white',
                            recommendation.score >= 85 && 'bg-green-600',
                            recommendation.score >= 60 && recommendation.score < 85 && 'bg-amber-600',
                            recommendation.score < 60 && 'bg-gray-500'
                          )}
                        >
                          {recommendation.score}/100
                        </Badge>

                        {/* Likelihood Badge */}
                        <Badge className={getLikelihoodColor(recommendation.likelihood)}>
                          {recommendation.likelihood.charAt(0).toUpperCase() + recommendation.likelihood.slice(1)} match
                        </Badge>
                      </div>

                      {/* Reasons */}
                      <div className="space-y-1 mb-3">
                        {displayedReasons.map((reason, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground leading-relaxed">
                            • {reason}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex-shrink-0">
                      <Button
                        onClick={() => handleSendInvite(recommendation.id, recommendation.name)}
                        variant={isInvited ? 'outline' : 'outline'}
                        size="sm"
                        disabled={isInvited || isLoading}
                        className={cn(
                          isInvited && 'bg-green-100 text-green-700 border-green-300 hover:bg-green-100 cursor-default'
                        )}
                      >
                        {isInvited ? (
                          <>
                            <Send className="w-3 h-3 mr-1.5" />
                            Invited
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3 mr-1.5" />
                            Send Invite
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

        {/* Bulk Action Bar */}
        <div className="sticky bottom-0 left-0 right-0 bg-card border-t border-border py-4 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {invitedMembers.size > 0 ? (
                <>
                  <span className="font-semibold text-foreground">{invitedMembers.size}</span> members invited
                </>
              ) : (
                'No invites sent yet'
              )}
            </div>
            <Button
              onClick={handleInviteTop3}
              disabled={isLoading || invitedMembers.has('u1') || invitedMembers.has('u2') || invitedMembers.has('u3')}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              Invite Top 3
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
