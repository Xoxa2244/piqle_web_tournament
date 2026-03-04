'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { Brain, Sparkles, Users, Calendar, Clock, TrendingUp, ChevronLeft, AlertCircle, Activity, Target, BarChart3, ArrowRight, Upload, DollarSign, Package, Trophy, Globe } from 'lucide-react'

// Mock data - represents what tRPC would return
const mockSessions = [
  {
    id: '1',
    title: 'Wednesday Morning Doubles',
    date: 'Wed, Mar 5',
    startTime: '09:00',
    endTime: '11:00',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    maxPlayers: 8,
    confirmedCount: 3,
    courtName: 'Court 1'
  },
  {
    id: '2',
    title: 'Thursday Evening Clinic',
    date: 'Thu, Mar 6',
    startTime: '18:00',
    endTime: '20:00',
    format: 'CLINIC',
    skillLevel: 'BEGINNER',
    maxPlayers: 8,
    confirmedCount: 2,
    courtName: 'Court 3'
  },
  {
    id: '3',
    title: 'Friday Social Play',
    date: 'Fri, Mar 7',
    startTime: '17:00',
    endTime: '19:00',
    format: 'SOCIAL',
    skillLevel: 'ALL_LEVELS',
    maxPlayers: 12,
    confirmedCount: 4,
    courtName: 'Court 2'
  },
  {
    id: '4',
    title: 'Saturday Competitive Drill',
    date: 'Sat, Mar 8',
    startTime: '08:00',
    endTime: '10:00',
    format: 'DRILL',
    skillLevel: 'ADVANCED',
    maxPlayers: 6,
    confirmedCount: 1,
    courtName: 'Court 4'
  },
]

const mockStats = {
  activeMembers: 20,
  sessionsThisWeek: 8,
  avgOccupancy: 62,
  inactiveMembers: 5
}

const getFormatBadgeColor = (format: string) => {
  switch (format) {
    case 'OPEN_PLAY':
      return 'bg-blue-100 text-blue-800'
    case 'CLINIC':
      return 'bg-purple-100 text-purple-800'
    case 'DRILL':
      return 'bg-orange-100 text-orange-800'
    case 'SOCIAL':
      return 'bg-green-100 text-green-800'
    case 'LEAGUE_PLAY':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getSkillLevelBadgeColor = (level: string) => {
  switch (level) {
    case 'BEGINNER':
      return 'bg-emerald-100 text-emerald-700'
    case 'INTERMEDIATE':
      return 'bg-amber-100 text-amber-700'
    case 'ADVANCED':
      return 'bg-red-100 text-red-700'
    case 'ALL_LEVELS':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

const getFormatDisplayName = (format: string) => {
  return format.replace(/_/g, ' ')
}

const getSkillLevelDisplayName = (level: string) => {
  return level.replace(/_/g, ' ')
}

export default function ClubIntelligencePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const clubId = params.id as string

  // Calculate underfilled sessions (those with available spots)
  const underfilled = mockSessions.filter(s => s.confirmedCount < s.maxPlayers)

  const handleFillWithAI = (sessionId: string) => {
    setIsLoading(true)
    // Simulate navigation delay
    setTimeout(() => {
      setIsLoading(false)
      router.push(`/clubs/${clubId}/intelligence/slot-filler?sessionId=${sessionId}`)
    }, 300)
  }

  const handleReactivationClick = () => {
    router.push(`/clubs/${clubId}/intelligence/reactivation`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={`/clubs/${clubId}`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Club</span>
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Club Intelligence</h1>
              </div>
              <p className="text-muted-foreground">AI-powered member management and session optimization</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/clubs/${clubId}/intelligence/revenue`}>
                <Button variant="outline" className="gap-2">
                  <DollarSign className="w-4 h-4" />
                  Revenue
                </Button>
              </Link>
              <Link href={`/clubs/${clubId}/intelligence/packages`}>
                <Button variant="outline" className="gap-2">
                  <Package className="w-4 h-4" />
                  Packages
                </Button>
              </Link>
              <Link href={`/clubs/${clubId}/intelligence/events`}>
                <Button variant="outline" className="gap-2">
                  <Trophy className="w-4 h-4" />
                  Events
                </Button>
              </Link>
              <Link href={`/clubs/${clubId}/intelligence/marketplace`}>
                <Button variant="outline" className="gap-2">
                  <Globe className="w-4 h-4" />
                  Drop-In
                </Button>
              </Link>
              <Link href={`/clubs/${clubId}/intelligence/import`}>
                <Button variant="outline" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Import
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Active Members */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Members</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mockStats.activeMembers}</div>
              <p className="text-xs text-muted-foreground mt-1">booked sessions this month</p>
            </CardContent>
          </Card>

          {/* Sessions This Week */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sessions This Week</CardTitle>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mockStats.sessionsThisWeek}</div>
              <p className="text-xs text-muted-foreground mt-1">upcoming sessions</p>
            </CardContent>
          </Card>

          {/* Avg Occupancy */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Occupancy</CardTitle>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mockStats.avgOccupancy}%</div>
              <p className="text-xs text-muted-foreground mt-1">across all sessions</p>
            </CardContent>
          </Card>
        </div>

        {/* Underfilled Sessions Section */}
        <div className="mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Underfilled Sessions
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sessions with available spots. Use AI to fill empty court time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {underfilled.map((session) => {
              const occupancyPercent = Math.round((session.confirmedCount / session.maxPlayers) * 100)
              const spotsRemaining = session.maxPlayers - session.confirmedCount

              return (
                <Card key={session.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <CardTitle className="text-base">{session.title}</CardTitle>
                        <CardDescription className="mt-1">{session.courtName}</CardDescription>
                      </div>
                      <Badge className={getFormatBadgeColor(session.format)}>
                        {getFormatDisplayName(session.format)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {session.date}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {session.startTime}–{session.endTime}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1">
                    <div className="space-y-4">
                      {/* Skill Level Badge */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Skill Level</p>
                        <Badge variant="outline" className={getSkillLevelBadgeColor(session.skillLevel)}>
                          {getSkillLevelDisplayName(session.skillLevel)}
                        </Badge>
                      </div>

                      {/* Occupancy Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">Occupancy</p>
                          <p className="text-xs font-medium">
                            {session.confirmedCount}/{session.maxPlayers} spots
                          </p>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${occupancyPercent}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {spotsRemaining} {spotsRemaining === 1 ? 'spot' : 'spots'} available
                        </p>
                      </div>
                    </div>
                  </CardContent>

                  <div className="px-6 py-4 border-t border-border">
                    <Button
                      onClick={() => handleFillWithAI(session.id)}
                      className="w-full"
                      disabled={isLoading}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Fill with AI
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>

          {underfilled.length === 0 && (
            <Card className="text-center py-12">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-secondary rounded-lg mb-4">
                <Target className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">All sessions are well-filled this week!</p>
            </Card>
          )}
        </div>

        {/* Inactive Members Alert */}
        <div>
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-amber-900">Inactive Members</CardTitle>
                    <CardDescription className="text-amber-700 mt-1">
                      {mockStats.inactiveMembers} members haven&apos;t booked in 21+ days
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                  {mockStats.inactiveMembers} members
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <p className="text-sm text-amber-700 mb-4">
                Re-engage your best members with personalized session recommendations and special offers.
              </p>
            </CardContent>

            <div className="px-6 py-4 border-t border-amber-200">
              <Button
                onClick={handleReactivationClick}
                variant="outline"
                className="border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                View Reactivation
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
