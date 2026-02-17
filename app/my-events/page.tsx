'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, ClipboardList, Clock3, MapPin, Users } from 'lucide-react'
import { formatUsDateTimeShort, getTimezoneLabel } from '@/lib/dateFormat'

type TournamentStatus = 'past' | 'upcoming' | 'in_progress'

const getTournamentStatus = (tournament: { startDate: Date | string; endDate: Date | string }): TournamentStatus => {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}

const getTournamentStatusBadgeClass = (status: TournamentStatus) => {
  switch (status) {
    case 'past':
      return 'bg-gray-100 text-gray-700'
    case 'upcoming':
      return 'bg-blue-50 text-blue-700'
    case 'in_progress':
      return 'bg-green-50 text-green-700'
  }
}

const getTournamentStatusLabel = (status: TournamentStatus) => {
  switch (status) {
    case 'past':
      return 'Completed'
    case 'upcoming':
      return 'Upcoming'
    case 'in_progress':
      return 'In progress'
  }
}

export default function MyEventsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery(undefined, {
    enabled: isLoggedIn,
  })

  const tournamentsList = useMemo<any[]>(() => (tournaments as any[]) ?? [], [tournaments])
  const tournamentIds = useMemo<string[]>(
    () => tournamentsList.map((tournament) => String(tournament.id)),
    [tournamentsList]
  )
  const { data: registrationStatuses } = trpc.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isLoggedIn && tournamentIds.length > 0 }
  )

  useEffect(() => {
    if (status !== 'unauthenticated') return
    router.replace('/auth/signin?callbackUrl=%2Fmy-events')
  }, [router, status])

  const myEvents = useMemo(() => {
    return tournamentsList.filter((tournament: any) => {
      const registrationStatus = registrationStatuses?.[tournament.id]?.status ?? 'none'
      return Boolean(tournament.isOwner || registrationStatus !== 'none')
    })
  }, [registrationStatuses, tournamentsList])

  const upcomingEvents = useMemo(() => {
    return [...myEvents]
      .filter((event) => getTournamentStatus(event as any) !== 'past')
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }, [myEvents])

  const completedEvents = useMemo(() => {
    return [...myEvents]
      .filter((event) => getTournamentStatus(event as any) === 'past')
      .sort((a: any, b: any) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
  }, [myEvents])

  if (status === 'loading' || (isLoading && isLoggedIn)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading your events...</div>
      </div>
    )
  }

  if (!session) return null

  const renderEventCard = (event: any) => {
    const status = getTournamentStatus(event)
    const registrationStatus = registrationStatuses?.[event.id]?.status ?? 'none'

    return (
      <Card key={event.id} className="border border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg">{event.title}</CardTitle>
            <span
              className={`inline-flex px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getTournamentStatusBadgeClass(status)}`}
            >
              {getTournamentStatusLabel(status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {event.isOwner ? <Badge variant="outline">Organizer</Badge> : null}
            {registrationStatus === 'active' ? <Badge>Registered</Badge> : null}
            {registrationStatus === 'waitlisted' ? <Badge variant="secondary">Waitlist</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            <span>
              {formatUsDateTimeShort(event.startDate, { timeZone: event.timezone })} -{' '}
              {formatUsDateTimeShort(event.endDate, { timeZone: event.timezone })}
            </span>
          </div>
          <div className="flex items-center">
            <ClipboardList className="h-4 w-4 mr-2" />
            <span>
              Registration:{' '}
              {event.registrationStartDate
                ? formatUsDateTimeShort(event.registrationStartDate, { timeZone: event.timezone })
                : '—'}
              {' – '}
              {event.registrationEndDate
                ? formatUsDateTimeShort(event.registrationEndDate, { timeZone: event.timezone })
                : '—'}
            </span>
          </div>
          {event.timezone ? (
            <div className="flex items-center">
              <Clock3 className="h-4 w-4 mr-2" />
              <span>{getTimezoneLabel(event.timezone)}</span>
            </div>
          ) : null}
          {event.venueName ? (
            <div className="flex items-center">
              <MapPin className="h-4 w-4 mr-2" />
              <span>{event.venueName}</span>
            </div>
          ) : null}
          <div className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            <span>
              {(event.divisions ?? []).length} division{(event.divisions ?? []).length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link href={`/tournaments/${event.id}/register`}>
              <Button size="sm">Open event</Button>
            </Link>
            {event.isOwner ? (
              <Link href={`/admin/${event.id}`}>
                <Button size="sm" variant="outline">
                  Manage
                </Button>
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">My Events</h1>
          <p className="mt-2 text-gray-600">
            Your personal event list across the platform, independent of clubs.
          </p>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-900">Upcoming & In Progress</h2>
            <Badge variant="outline">{upcomingEvents.length}</Badge>
          </div>
          {upcomingEvents.length === 0 ? (
            <Card className="border border-dashed border-gray-300">
              <CardContent className="py-10 text-center text-gray-500">
                No upcoming events yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingEvents.map(renderEventCard)}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-900">Completed</h2>
            <Badge variant="outline">{completedEvents.length}</Badge>
          </div>
          {completedEvents.length === 0 ? (
            <Card className="border border-dashed border-gray-300">
              <CardContent className="py-10 text-center text-gray-500">
                No completed events yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {completedEvents.map(renderEventCard)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
