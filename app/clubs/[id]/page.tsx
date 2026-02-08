'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { fromCents } from '@/lib/payment'
import { cn } from '@/lib/utils'
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, MapPin, ArrowLeft, Users, Megaphone, Plus } from 'lucide-react'
import Image from 'next/image'

export const dynamic = 'force-dynamic'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

const toLocalYmd = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const addDays = (date: Date, delta: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}
const addMonths = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1)

const formatMonthYear = (date: Date) => `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`

const buildMonthGrid = (month: Date) => {
  const first = startOfMonth(month)
  const startOffset = first.getDay() // 0=Sun
  const gridStart = addDays(first, -startOffset)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export default function ClubDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'
  const { toast } = useToast()

  const { data: club, isLoading, error } = trpc.club.get.useQuery({ id: clubId }, { enabled: !!clubId })
  const utils = trpc.useUtils()

  const toggleFollow = trpc.club.toggleFollow.useMutation()
  const createBookingRequest = trpc.club.createBookingRequest.useMutation()
  const createAnnouncement = trpc.club.createAnnouncement.useMutation()

  const [bookingForm, setBookingForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    desiredStart: '',
    durationMinutes: 60,
    playersCount: 8,
    message: '',
  })

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
  })

  const canBook = Boolean(club?.courtReserveUrl)

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
    return initials || 'CL'
  }

  const ClubLogo = ({ name, logoUrl }: { name: string; logoUrl?: string | null }) => {
    if (logoUrl) {
      return (
        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
          <Image src={logoUrl} alt="" fill className="object-cover" />
        </div>
      )
    }
    return (
      <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-semibold text-gray-600">{getInitials(name)}</span>
      </div>
    )
  }

  const followLabel = useMemo(() => {
    if (!club) return 'Join'
    return club.isFollowing ? 'Joined' : 'Join'
  }, [club])

  const tournaments = useMemo(() => club?.tournaments ?? [], [club])
  const eventsByDay = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const t of tournaments) {
      const d = new Date(t.startDate)
      const key = toLocalYmd(d)
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    map.forEach((list, key) => {
      list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      map.set(key, list)
    })
    return map
  }, [tournaments])

  const handleToggleFollow = async () => {
    if (!isLoggedIn) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/clubs/${clubId}`)}`)
      return
    }
    await toggleFollow.mutateAsync({ clubId })
    await Promise.all([
      utils.club.get.invalidate({ id: clubId }),
      utils.club.list.invalidate(),
    ])
  }

  const handleBookingRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createBookingRequest.mutateAsync({
        clubId,
        requesterName: bookingForm.requesterName,
        requesterEmail: bookingForm.requesterEmail,
        requesterPhone: bookingForm.requesterPhone || undefined,
        desiredStart: bookingForm.desiredStart ? new Date(bookingForm.desiredStart).toISOString() : undefined,
        durationMinutes: bookingForm.durationMinutes || undefined,
        playersCount: bookingForm.playersCount || undefined,
        message: bookingForm.message || undefined,
      })
      toast({ title: 'Request sent', description: 'The club will respond soon.' })
      setBookingForm({
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        desiredStart: '',
        durationMinutes: 60,
        playersCount: 8,
        message: '',
      })
    } catch (err: any) {
      toast({ title: 'Failed to send request', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }

  const handleAnnouncementPost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return
    try {
      await createAnnouncement.mutateAsync({
        clubId,
        title: announcementForm.title || undefined,
        body: announcementForm.body,
      })
      toast({ title: 'Posted', description: 'Announcement published.' })
      setAnnouncementForm({ title: '', body: '' })
      await utils.club.get.invalidate({ id: clubId })
    } catch (err: any) {
      toast({ title: 'Failed to post', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 px-6 py-8">
        <div className="text-sm text-muted-foreground">Loading club…</div>
      </div>
    )
  }

  if (error || !club) {
    return (
      <div className="space-y-6 px-6 py-8">
        <Link href="/clubs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to clubs
        </Link>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {error?.message || 'Club not found.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="space-y-3">
        <Link href="/clubs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to clubs
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-start gap-3">
              <ClubLogo name={club.name} logoUrl={club.logoUrl} />
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold truncate">{club.name}</h1>
                  {club.isVerified ? <Badge>Verified</Badge> : null}
                  <Badge variant="outline">{club.kind === 'VENUE' ? 'Venue' : 'Community'}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="truncate">
                    {club.address || club.city || club.state
                      ? `${club.address ? club.address : ''}${club.address && (club.city || club.state) ? ' • ' : ''}${club.city ?? ''}${club.city && club.state ? ', ' : ''}${club.state ?? ''}`
                      : 'Location not set'}
                  </span>
                </div>
                {club.description ? (
                  <p className="text-sm text-gray-700 max-w-2xl whitespace-pre-wrap">{club.description}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant={club.isFollowing ? 'secondary' : 'default'}
              className="gap-2"
              onClick={handleToggleFollow}
              disabled={toggleFollow.isPending}
              title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
            >
              <Users className="h-4 w-4" />
              {followLabel}
            </Button>
            {canBook ? (
              <a href={club.courtReserveUrl!} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open CourtReserve
                </Button>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Upcoming events
              </CardTitle>
              {club.isAdmin ? (
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link href={`/admin/new?clubId=${encodeURIComponent(club.id)}`}>
                    <Plus className="h-4 w-4" />
                    Create tournament
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs defaultValue="list">
                <div className="flex items-center justify-between gap-2">
                  <TabsList className="h-9">
                    <TabsTrigger value="list" className="px-3 py-1 text-xs">
                      List
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="px-3 py-1 text-xs">
                      Calendar
                    </TabsTrigger>
                  </TabsList>
                  <div className="text-xs text-muted-foreground">
                    Showing next {tournaments.length} event{tournaments.length === 1 ? '' : 's'}
                  </div>
                </div>

                <TabsContent value="list" className="space-y-3">
                  {tournaments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No upcoming events for this club yet.
                    </div>
                  ) : (
                    tournaments.map((tournament) => (
                      <div
                        key={tournament.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{tournament.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(tournament.startDate).toLocaleString()}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {typeof tournament.entryFeeCents === 'number' && tournament.entryFeeCents > 0 ? (
                              <Badge variant="secondary">Paid</Badge>
                            ) : (
                              <Badge variant="outline">Free</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/tournaments/${tournament.id}/register`}>
                            <Button>
                              {typeof tournament.entryFeeCents === 'number' && tournament.entryFeeCents > 0
                                ? `Pay & Join${typeof tournament.entryFeeCents === 'number' ? ` — $${fromCents(tournament.entryFeeCents).toFixed(2)}` : ''}`
                                : 'Join'}
                            </Button>
                          </Link>
                          {tournament.publicSlug ? (
                            <Link href={`/t/${tournament.publicSlug}`}>
                              <Button variant="outline">Public board</Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="calendar">
                  <ClubEventsCalendar
                    tournaments={tournaments}
                    eventsByDay={eventsByDay}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {club.isAdmin ? (
                <form onSubmit={handleAnnouncementPost} className="space-y-3 rounded-md border p-3">
                  <div className="text-sm font-medium text-gray-900">Post announcement (admins)</div>
                  <Input
                    placeholder="Title (optional)"
                    value={announcementForm.title}
                    onChange={(e) => setAnnouncementForm((p) => ({ ...p, title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Write an update for followers…"
                    value={announcementForm.body}
                    onChange={(e) => setAnnouncementForm((p) => ({ ...p, body: e.target.value }))}
                    rows={3}
                  />
                  <div className="flex items-center justify-end">
                    <Button type="submit" disabled={createAnnouncement.isPending || !announcementForm.body.trim()}>
                      {createAnnouncement.isPending ? 'Posting…' : 'Post'}
                    </Button>
                  </div>
                </form>
              ) : null}

              {club.announcements.length === 0 ? (
                <div className="text-sm text-muted-foreground">No announcements yet.</div>
              ) : (
                club.announcements.map((a) => (
                  <div key={a.id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{a.title || 'Update'}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString()}
                          {a.createdByUser?.name ? ` • ${a.createdByUser.name}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{a.body}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canBook ? (
                <a href={club.courtReserveUrl!} target="_blank" rel="noreferrer" className="block">
                  <Button variant="outline" className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Fast booking on CourtReserve
                  </Button>
                </a>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Online booking is not configured for this club yet.
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium text-gray-900">Send a booking request</div>
                <div className="text-xs text-muted-foreground">
                  This is a request, not a confirmed reservation.
                </div>
                <form onSubmit={handleBookingRequest} className="space-y-3">
                  <Input
                    placeholder="Your name"
                    value={bookingForm.requesterName}
                    onChange={(e) => setBookingForm((p) => ({ ...p, requesterName: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={bookingForm.requesterEmail}
                    onChange={(e) => setBookingForm((p) => ({ ...p, requesterEmail: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={bookingForm.requesterPhone}
                    onChange={(e) => setBookingForm((p) => ({ ...p, requesterPhone: e.target.value }))}
                  />
                  <Input
                    type="datetime-local"
                    value={bookingForm.desiredStart}
                    onChange={(e) => setBookingForm((p) => ({ ...p, desiredStart: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={bookingForm.durationMinutes}
                      onChange={(e) => setBookingForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))}
                      placeholder="Duration (min)"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={64}
                      value={bookingForm.playersCount}
                      onChange={(e) => setBookingForm((p) => ({ ...p, playersCount: Number(e.target.value) }))}
                      placeholder="# players"
                    />
                  </div>
                  <Textarea
                    placeholder="Message (optional)"
                    value={bookingForm.message}
                    onChange={(e) => setBookingForm((p) => ({ ...p, message: e.target.value }))}
                    rows={4}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createBookingRequest.isPending}
                  >
                    {createBookingRequest.isPending ? 'Sending…' : 'Send request'}
                  </Button>
                </form>
              </div>

              {club.isAdmin ? (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-sm font-medium text-gray-900">Recent requests (admins)</div>
                  {(club as any).bookingRequests?.length ? (
                    <div className="space-y-2">
                      {(club as any).bookingRequests.map((req: any) => (
                        <div key={req.id} className="rounded-md bg-gray-50 p-2 text-sm">
                          <div className="font-medium text-gray-900">
                            {req.requesterName}{' '}
                            <span className="font-normal text-muted-foreground">
                              ({req.requesterEmail})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {req.desiredStart ? `Desired: ${new Date(req.desiredStart).toLocaleString()}` : 'Desired: —'}
                            {req.durationMinutes ? ` • ${req.durationMinutes} min` : ''}
                            {req.playersCount ? ` • ${req.playersCount} players` : ''}
                          </div>
                          {req.message ? (
                            <div className="mt-1 whitespace-pre-wrap text-gray-700">{req.message}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No booking requests yet.</div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ClubEventsCalendar({
  tournaments,
  eventsByDay,
}: {
  tournaments: Array<{
    id: string
    title: string
    startDate: Date | string
    endDate?: Date | string
    entryFeeCents?: number | null
    publicSlug?: string | null
  }>
  eventsByDay: Map<string, any[]>
}) {
  const now = new Date()
  const initialBase = tournaments[0] ? new Date(tournaments[0].startDate) : now
  const [month, setMonth] = useState(() => startOfMonth(initialBase))
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    tournaments[0] ? toLocalYmd(initialBase) : null
  )

  const grid = useMemo(() => buildMonthGrid(month), [month])

  const isTodayKey = toLocalYmd(now)
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) ?? []) : []

  const parseYmd = (key: string) => {
    const [y, m, d] = key.split('-').map((x) => Number(x))
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-gray-900">{formatMonthYear(month)}</div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMonth(startOfMonth(now))
            setSelectedKey(isTodayKey)
          }}
        >
          Today
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground">
        {DAY_LABELS.map((label) => (
          <div key={label} className="px-1 py-1 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const key = toLocalYmd(date)
          const inMonth = date.getMonth() === month.getMonth()
          const isToday = key === isTodayKey
          const isSelected = selectedKey === key
          const events = eventsByDay.get(key) ?? []
          const eventCount = events.length

          return (
            <div
              key={key}
              onClick={() => setSelectedKey(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedKey(key)
                }
              }}
              role="button"
              tabIndex={0}
              className={cn(
                'h-12 sm:h-14 rounded-md border px-2 py-1 text-left transition-colors',
                inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400',
                eventCount > 0 ? 'hover:bg-gray-50' : 'hover:bg-gray-50/50',
                isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200',
                isToday && !isSelected ? 'ring-2 ring-blue-200' : ''
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cn('text-xs font-medium', inMonth ? 'text-gray-900' : 'text-gray-400')}>
                  {date.getDate()}
                </div>
                {eventCount > 0 ? (
                  <div className="text-[10px] font-semibold text-blue-700 bg-blue-100 rounded px-1">
                    {eventCount}
                  </div>
                ) : null}
              </div>
              {eventCount > 0 ? (
                <div className="mt-1 flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  {events[0]?.id ? (
                    <Link
                      href={`/tournaments/${events[0].id}/register`}
                      className="text-[10px] text-blue-700 truncate hover:underline"
                      onClick={(e) => e.stopPropagation()}
                      title="Open registration"
                    >
                      {events[0]?.title ?? 'Event'}
                    </Link>
                  ) : (
                    <div className="text-[10px] text-blue-700 truncate">
                      {events[0]?.title ?? 'Event'}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-medium text-gray-900">
          {selectedKey ? `Events on ${parseYmd(selectedKey).toLocaleDateString()}` : 'Select a day'}
        </div>
        {!selectedKey ? (
          <div className="text-sm text-muted-foreground">
            Pick a date to see what is happening at this club.
          </div>
        ) : selectedEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground">No events on this day.</div>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((tournament: any) => {
              const fee = typeof tournament.entryFeeCents === 'number' ? tournament.entryFeeCents : 0
              const isPaid = fee > 0
              return (
                <div key={tournament.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-gray-50 p-2">
                  <div className="min-w-0">
                    <Link
                      href={`/tournaments/${tournament.id}/register`}
                      className="text-sm font-medium text-gray-900 truncate hover:underline block"
                      title="Open registration"
                    >
                      {tournament.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tournament.startDate).toLocaleString()}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {isPaid ? (
                        <Badge variant="secondary">${fromCents(fee).toFixed(2)}</Badge>
                      ) : (
                        <Badge variant="outline">Free</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/tournaments/${tournament.id}/register`}>
                      <Button size="sm">
                        {isPaid ? 'Pay & Join' : 'Join'}
                      </Button>
                    </Link>
                    {tournament.publicSlug ? (
                      <Link href={`/t/${tournament.publicSlug}`}>
                        <Button size="sm" variant="outline">
                          Public board
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
