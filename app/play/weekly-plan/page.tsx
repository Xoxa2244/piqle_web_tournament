'use client'

import { useState } from 'react'
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
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { Progress } from '@/components/ui/progress'

const mockDetailedPlan = [
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
    courtName: 'Court 1',
    score: 92,
    breakdown: { schedule_fit: 95, skill_fit: 100, format_fit: 85, occupancy: 88 },
    summary:
      'Wednesday morning — perfect fit. Intermediate level matches exactly. Good group forming with 3 players already confirmed.',
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
    courtName: 'Court 3',
    score: 85,
    breakdown: { schedule_fit: 80, skill_fit: 100, format_fit: 90, occupancy: 65 },
    summary:
      'Evening time works for you. Clinic format — great for improving technique. Plenty of spots available.',
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
    courtName: 'Court 4',
    score: 71,
    breakdown: { schedule_fit: 70, skill_fit: 60, format_fit: 75, occupancy: 80 },
    summary:
      'Saturday is a preferred day. Advanced session — a good challenge to push your skills. Small group setting.',
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

const getProgressBarColor = (value: number) => {
  if (value >= 85) return 'bg-green-500'
  if (value >= 70) return 'bg-amber-500'
  return 'bg-orange-500'
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

export default function WeeklyPlanPage() {
  const handleBookSession = (sessionId: string, title: string) => {
    toast({
      title: 'Session booked!',
      description: `You've booked "${title}". Check your email for confirmation.`,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <Link href="/play">
            <Button variant="ghost" size="sm" className="mt-0.5">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Your Weekly Plan</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Based on your preferences: 3 sessions/week, evenings preferred, Intermediate level
            </p>
          </div>
        </div>

        {/* Plan Summary */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <p className="text-sm">
              <span className="font-semibold">We found 3 sessions</span> matching your goal of{' '}
              <span className="font-semibold">3 this week</span> (Wednesday, Thursday, Saturday).{' '}
              <span className="text-green-600 font-semibold">This meets your weekly target.</span>
            </p>
          </CardContent>
        </Card>

        {/* Session Cards */}
        <div className="space-y-4">
          {mockDetailedPlan.map((session, index) => (
            <Card key={session.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-lg">{session.title}</CardTitle>
                      <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 rounded-full">
                        <span className="text-sm font-semibold text-primary">
                          {session.score}
                        </span>
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {session.date}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.startTime} - {session.endTime}
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.courtName}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pb-6">
                {/* Badges */}
                <div className="flex gap-2 flex-wrap">
                  <Badge className={cn('text-xs', getFormatColor(session.format))}>
                    {formatNameMap[session.format]}
                  </Badge>
                  <Badge className={cn('text-xs', getSkillColor(session.skillLevel))}>
                    {skillNameMap[session.skillLevel]}
                  </Badge>
                </div>

                {/* Scoring Breakdown */}
                <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-semibold">Scoring Breakdown</p>
                  <div className="space-y-3">
                    {[
                      {
                        label: 'Schedule Fit',
                        value: session.breakdown.schedule_fit,
                      },
                      {
                        label: 'Skill Match',
                        value: session.breakdown.skill_fit,
                      },
                      {
                        label: 'Format Preference',
                        value: session.breakdown.format_fit,
                      },
                      {
                        label: 'Availability',
                        value: session.breakdown.occupancy,
                      },
                    ].map((metric) => (
                      <div key={metric.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{metric.label}</span>
                          <span className="font-medium">{metric.value}%</span>
                        </div>
                        <Progress value={metric.value} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Occupancy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Spots Available</span>
                    <span>
                      {session.spotsRemaining}/{session.maxPlayers}
                    </span>
                  </div>
                  <Progress
                    value={
                      ((session.maxPlayers - session.spotsRemaining) /
                        session.maxPlayers) *
                      100
                    }
                    className="h-2"
                  />
                </div>

                {/* Summary */}
                <p className="text-sm text-muted-foreground italic">{session.summary}</p>
              </CardContent>

              <CardFooter className="border-t pt-4">
                <Button
                  onClick={() => handleBookSession(session.id, session.title)}
                  className="w-full"
                >
                  Book This Session
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Already Booked */}
        {mockBookings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Already Booked</h2>
            <div className="space-y-3">
              {mockBookings.map((booking) => (
                <Card key={booking.id} className="opacity-75">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <h3 className="font-semibold text-sm">{booking.sessionTitle}</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {booking.date}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {booking.time}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {booking.court}
                          </div>
                        </div>
                      </div>
                      <Badge className={cn('text-xs ml-2', getFormatColor(booking.format))}>
                        {formatNameMap[booking.format]}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Settings Link */}
        <Link href="/play/preferences">
          <Button variant="outline" className="w-full">
            Adjust Preferences
          </Button>
        </Link>
      </div>
    </div>
  )
}
