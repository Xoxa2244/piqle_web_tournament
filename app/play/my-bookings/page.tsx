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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Calendar,
  Clock,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  Plus,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

const mockUpcoming = [
  {
    id: 'b1',
    title: 'Monday Open Play',
    date: 'Mon, Mar 3',
    time: '5:00 - 7:00 PM',
    court: 'Court 2',
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    bookedAt: '2 days ago',
  },
  {
    id: 'b2',
    title: 'Tuesday League Practice',
    date: 'Tue, Mar 4',
    time: '7:00 - 9:00 PM',
    court: 'Court 1',
    format: 'LEAGUE_PLAY',
    skillLevel: 'INTERMEDIATE',
    bookedAt: '3 days ago',
  },
  {
    id: 'b3',
    title: 'Wednesday Morning Doubles',
    date: 'Wed, Mar 5',
    time: '9:00 - 11:00 AM',
    court: 'Court 1',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    bookedAt: 'Just now',
  },
]

const mockPast = [
  {
    id: 'p1',
    title: 'Friday Social Play',
    date: 'Fri, Feb 28',
    time: '5:00 - 7:00 PM',
    court: 'Court 2',
    format: 'SOCIAL',
    skillLevel: 'ALL_LEVELS',
    bookedAt: '',
  },
  {
    id: 'p2',
    title: 'Saturday Morning Drill',
    date: 'Sat, Mar 1',
    time: '8:00 - 10:00 AM',
    court: 'Court 4',
    format: 'DRILL',
    skillLevel: 'ADVANCED',
    bookedAt: '',
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

function BookingCard({
  booking,
  isPast,
}: {
  booking: (typeof mockUpcoming | typeof mockPast)[0]
  isPast: boolean
}) {
  const handleCancel = (title: string) => {
    toast({
      title: 'Booking cancelled',
      description: `Cancelled "${title}". You've freed up a spot.`,
      variant: 'destructive',
    })
  }

  const handleRebook = (title: string) => {
    toast({
      title: 'Rebooked!',
      description: `You've booked a similar session to "${title}".`,
    })
  }

  return (
    <Card className={cn('overflow-hidden', isPast && 'opacity-65')}>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isPast ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
              )}
              <h3 className="font-semibold text-sm">{booking.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPast ? 'Completed' : 'Booked'} {!isPast && booking.bookedAt}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span>{booking.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>{booking.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span>{booking.court}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge className={cn('text-xs', getFormatColor(booking.format))}>
            {formatNameMap[booking.format]}
          </Badge>
          <Badge className={cn('text-xs', getSkillColor(booking.skillLevel))}>
            {skillNameMap[booking.skillLevel]}
          </Badge>
        </div>

        {/* Action Button */}
        <div>
          {!isPast ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => handleCancel(booking.title)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Booking
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleRebook(booking.title)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Rebook Similar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function MyBookingsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <Link href="/play">
            <Button variant="ghost" size="sm" className="mt-0.5">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage your upcoming and past sessions
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming">
              Upcoming ({mockUpcoming.length})
            </TabsTrigger>
            <TabsTrigger value="past">Past ({mockPast.length})</TabsTrigger>
          </TabsList>

          {/* Upcoming Tab */}
          <TabsContent value="upcoming" className="space-y-4">
            {mockUpcoming.length > 0 ? (
              <div className="space-y-4">
                {mockUpcoming.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} isPast={false} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">No upcoming bookings</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get started by exploring your weekly plan
                  </p>
                  <Link href="/play/weekly-plan">
                    <Button variant="outline" size="sm">
                      View Weekly Plan
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Past Tab */}
          <TabsContent value="past" className="space-y-4">
            {mockPast.length > 0 ? (
              <div className="space-y-4">
                {mockPast.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} isPast={true} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">No past bookings</h3>
                  <p className="text-sm text-muted-foreground">
                    Your completed sessions will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/play/weekly-plan" className="w-full">
            <Button variant="outline" className="w-full">
              View Weekly Plan
            </Button>
          </Link>
          <Link href="/play/preferences" className="w-full">
            <Button variant="outline" className="w-full">
              Adjust Preferences
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
