'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  RefreshCw,
  ArrowRight,
  Settings,
  Navigation,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { Progress } from '@/components/ui/progress'

const mockUser = {
  name: 'Alex Rivera',
  dupr: 4.0,
  targetPerWeek: 3,
  bookedThisWeek: 2,
}

const mockPlan = [
  {
    id: 's1',
    title: 'Wednesday Morning Doubles',
    date: 'Wed, Mar 5',
    startTime: '09:00 AM',
    endTime: '11:00 AM',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    spotsRemaining: 5,
    maxPlayers: 8,
    score: 92,
    reason: 'Wednesday morning — perfect fit for your schedule',
    courtName: 'Court 1',
  },
  {
    id: 's2',
    title: 'Thursday Evening Clinic',
    date: 'Thu, Mar 6',
    startTime: '6:00 PM',
    endTime: '8:00 PM',
    format: 'CLINIC',
    skillLevel: 'INTERMEDIATE',
    spotsRemaining: 6,
    maxPlayers: 8,
    score: 85,
    reason: 'Clinic format matches your preference. Good group forming.',
    courtName: 'Court 3',
  },
  {
    id: 's3',
    title: 'Saturday Competitive Drill',
    date: 'Sat, Mar 8',
    startTime: '8:00 AM',
    endTime: '10:00 AM',
    format: 'DRILL',
    skillLevel: 'ADVANCED',
    spotsRemaining: 4,
    maxPlayers: 6,
    score: 71,
    reason: 'Stretch opportunity — close to your level. Keep momentum going.',
    courtName: 'Court 4',
  },
]

const mockBookings = [
  {
    id: 'b1',
    sessionTitle: 'Monday Open Play',
    date: 'Mon, Mar 3',
    time: '5:00 PM - 7:00 PM',
    court: 'Court 2',
    format: 'OPEN_PLAY',
  },
  {
    id: 'b2',
    sessionTitle: 'Tuesday League Practice',
    date: 'Tue, Mar 4',
    time: '7:00 PM - 9:00 PM',
    court: 'Court 1',
    format: 'LEAGUE_PLAY',
  },
]

const getFormatColor = (format: string) => {
  const colors: Record<string, string> = {
    OPEN_PLAY: 'bg-blue-100 text-blue-800',
    CLINIC: 'bg-purple-100 text-purple-800',
    DRILL: 'bg-orange-100 text-orange-800',
    LEAGUE_PLAY: 'bg-green-100 text-green-800',
    SOCIAL: 'bg-pink-100 text-pink-800',
  }
  return colors[format] || 'bg-gray-100 text-gray-800'
}

const getSkillColor = (level: string) => {
  const colors: Record<string, string> = {
    BEGINNER: 'bg-green-100 text-green-800',
    INTERMEDIATE: 'bg-blue-100 text-blue-800',
    ADVANCED: 'bg-red-100 text-red-800',
    ALL_LEVELS: 'bg-gray-100 text-gray-800',
  }
  return colors[level] || 'bg-gray-100 text-gray-800'
}

const formatNameMap: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}

const skillNameMap: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  ALL_LEVELS: 'All Levels',
}

export default function PlayDashboard() {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshPlan = async () => {
    setIsRefreshing(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    toast({
      title: 'Plan refreshed',
      description: 'Your weekly plan has been updated with new recommendations.',
    })
    setIsRefreshing(false)
  }

  const handleBookSession = (sessionId: string, title: string) => {
    toast({
      title: 'Session booked!',
      description: `You've booked "${title}". Check your email for confirmation.`,
    })
  }

  const handleCancelBooking = (bookingId: string, title: string) => {
    toast({
      title: 'Booking cancelled',
      description: `Cancelled "${title}". You've freed up a spot.`,
      variant: 'destructive',
    })
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Welcome Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back, {mockUser.name.split(' ')[0]} 👋
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    This Week
                  </p>
                  <p className="text-2xl font-bold">
                    {mockUser.bookedThisWeek} of {mockUser.targetPerWeek}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">sessions booked</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Next Session
                  </p>
                  <p className="text-2xl font-bold">Wed, Mar 5</p>
                  <p className="text-xs text-muted-foreground mt-2">9:00 AM</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Your Weekly Plan Card */}
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-card to-card/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Your AI Weekly Plan</CardTitle>
            </div>
            <CardDescription>
              Based on your preferences: {mockUser.targetPerWeek} sessions/week, evenings
              preferred, {skillNameMap['INTERMEDIATE']} level
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockPlan.map((session) => (
              <div
                key={session.id}
                className="border rounded-lg p-4 space-y-3 bg-background/50 hover:bg-background transition-colors"
              >
                {/* Session Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{session.title}</h3>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {session.date}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.startTime} - {session.endTime}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex gap-2 flex-wrap">
                  <Badge className={cn('text-xs', getFormatColor(session.format))}>
                    {formatNameMap[session.format]}
                  </Badge>
                  <Badge className={cn('text-xs', getSkillColor(session.skillLevel))}>
                    {skillNameMap[session.skillLevel]}
                  </Badge>
                </div>

                {/* Occupancy */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Spots Available</span>
                    <span className="font-medium">
                      {session.spotsRemaining}/{session.maxPlayers}
                    </span>
                  </div>
                  <Progress
                    value={
                      ((session.maxPlayers - session.spotsRemaining) /
                        session.maxPlayers) *
                      100
                    }
                    className="h-1.5"
                  />
                </div>

                {/* Score Reasoning */}
                <p className="text-xs text-muted-foreground italic">{session.reason}</p>

                {/* Book Button */}
                <Button
                  size="sm"
                  onClick={() => handleBookSession(session.id, session.title)}
                  className="w-full"
                >
                  Book Now
                </Button>
              </div>
            ))}
          </CardContent>
          <CardFooter className="border-t pt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshPlan}
              disabled={isRefreshing}
              className="flex-1"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh Plan
            </Button>
            <Link href="/play/weekly-plan" className="flex-1">
              <Button variant="ghost" size="sm" className="w-full">
                View All <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Upcoming Bookings */}
        {mockBookings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Your Bookings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockBookings.map((booking) => (
                <Card key={booking.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm">{booking.sessionTitle}</h3>
                      <div className="space-y-1 text-xs text-muted-foreground mt-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {booking.date}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {booking.time}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {booking.court}
                        </div>
                      </div>
                    </div>
                    <Badge className={cn('text-xs w-fit', getFormatColor(booking.format))}>
                      {formatNameMap[booking.format]}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        handleCancelBooking(booking.id, booking.sessionTitle)
                      }
                    >
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Drop-In Marketplace */}
        <Link href="/play/marketplace">
          <Card className="border-lime-200 bg-gradient-to-r from-lime-50 to-green-50 hover:border-lime-300 transition-colors cursor-pointer">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-lime-100 rounded-lg">
                    <Navigation className="w-5 h-5 text-lime-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Drop-In Courts Near You</p>
                    <p className="text-xs text-muted-foreground">Play at any club, no membership needed</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-lime-600" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Post-Match Review */}
        <Link href="/play/review">
          <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 hover:border-amber-300 transition-colors cursor-pointer">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <ClipboardCheck className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Post-Match Review</p>
                    <p className="text-xs text-muted-foreground">Rate your match, earn XP, help AI learn your game</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Settings Link */}
        <Link href="/play/preferences">
          <Button variant="outline" className="w-full" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Adjust Play Preferences
          </Button>
        </Link>
      </div>
    </div>
  )
}
