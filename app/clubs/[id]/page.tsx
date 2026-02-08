'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, MapPin, ArrowLeft, Users, Megaphone, Plus, MessageCircle, Send, Trash2, Share2, Copy, Mail, QrCode } from 'lucide-react'
import Image from 'next/image'
import QRCode from 'react-qr-code'

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
const startOfWeek = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay()) // Sunday-start week
  return d
}
const addDays = (date: Date, delta: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}
const addMonths = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1)
const addWeeks = (date: Date, delta: number) => addDays(date, delta * 7)

const formatMonthYear = (date: Date) => `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`
const formatWeekRange = (weekStart: Date) => {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === end.getMonth() && weekStart.getFullYear() === end.getFullYear()
  const startLabel = weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(
    [],
    sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  )
  return `${startLabel}–${endLabel}`
}

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

  const [inviteOpen, setInviteOpen] = useState(false)

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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {club.followersCount} joined
                    <span className="mx-1">•</span>
                    Join to chat and get updates
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
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setInviteOpen((v) => !v)}
            >
              <Share2 className="h-4 w-4" />
              Invite
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
          {inviteOpen ? (
            <ClubInviteCard
              clubId={club.id}
              clubName={club.name}
              isLoggedIn={isLoggedIn}
              canEmailInvite={club.isAdmin}
              onSignIn={() => router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/clubs/${clubId}`)}`)}
            />
          ) : null}

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

          <ClubChatCard
            clubId={club.id}
            isLoggedIn={isLoggedIn}
            isJoined={club.isFollowing}
            isAdmin={club.isAdmin}
            currentUserId={session?.user?.id}
            onJoinToggle={handleToggleFollow}
          />
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
    format?: string | null
    totals?: { totalSlots: number; filledSlots: number } | null
    genderLabel?: string | null
    duprLabel?: string | null
  }>
  eventsByDay: Map<string, any[]>
}) {
  const now = new Date()
  const initialBase = tournaments[0] ? new Date(tournaments[0].startDate) : now
  const [month, setMonth] = useState(() => startOfMonth(initialBase))
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    tournaments[0] ? toLocalYmd(initialBase) : null
  )
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>(() => 'month')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialBase))

  const grid = useMemo(() => buildMonthGrid(month), [month])

  const isTodayKey = toLocalYmd(now)
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) ?? []) : []

  const parseYmd = (key: string) => {
    const [y, m, d] = key.split('-').map((x) => Number(x))
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }

  const formatTournamentType = (format?: string | null) => {
    switch (format) {
      case 'SINGLE_ELIMINATION':
        return 'Single elim'
      case 'ROUND_ROBIN':
        return 'Round robin'
      case 'MLP':
        return 'MLP'
      case 'INDY_LEAGUE':
        return 'Indy league'
      case 'LEAGUE_ROUND_ROBIN':
        return 'League RR'
      default:
        return 'Tournament'
    }
  }

  const formatTournamentTypeShort = (format?: string | null) => {
    switch (format) {
      case 'SINGLE_ELIMINATION':
        return 'SE'
      case 'ROUND_ROBIN':
        return 'RR'
      case 'MLP':
        return 'MLP'
      case 'INDY_LEAGUE':
        return 'Indy'
      case 'LEAGUE_ROUND_ROBIN':
        return 'LRR'
      default:
        return null
    }
  }

  const formatTime = (startDate: Date | string) => {
    const d = new Date(startDate)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const weekDays: Date[] = []
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(weekStart, i))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border bg-white p-1">
          <button
            type="button"
            onClick={() => setCalendarMode('month')}
            className={cn(
              'px-3 py-1 text-xs rounded-sm transition-colors',
              calendarMode === 'month' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => {
              setCalendarMode('week')
              const base = selectedKey ? parseYmd(selectedKey) : now
              setWeekStart(startOfWeek(base))
            }}
            className={cn(
              'px-3 py-1 text-xs rounded-sm transition-colors',
              calendarMode === 'week' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            Week
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (calendarMode === 'month') {
              setMonth(startOfMonth(now))
            } else {
              setWeekStart(startOfWeek(now))
            }
            setSelectedKey(isTodayKey)
          }}
        >
          Today
        </Button>
      </div>

      {calendarMode === 'month' ? (
        <>
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
              const maxShown = 2

              return (
                <div
                  key={key}
                  onClick={() => {
                    setSelectedKey(key)
                    setWeekStart(startOfWeek(date))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedKey(key)
                      setWeekStart(startOfWeek(date))
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'h-16 sm:h-20 rounded-md border px-2 py-1 text-left transition-colors',
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
                    <div className="mt-1 space-y-1">
                      {events.slice(0, maxShown).map((ev: any) => {
                        const occupancy =
                          ev?.totals && ev.totals.totalSlots ? `${ev.totals.filledSlots}/${ev.totals.totalSlots}` : null
                        const shortType = formatTournamentTypeShort(ev?.format)
                        const meta = [formatTime(ev.startDate), shortType, occupancy].filter(Boolean).join(' · ')
                        const label = meta ? `${meta} · ${ev?.title ?? 'Event'}` : ev?.title ?? 'Event'

                        return ev?.id ? (
                          <Link
                            key={ev.id}
                            href={`/tournaments/${ev.id}/register`}
                            className="block rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-800 truncate hover:bg-blue-100"
                            onClick={(e) => e.stopPropagation()}
                            title="Open registration"
                          >
                            {label}
                          </Link>
                        ) : (
                          <div key={String(ev?.title ?? Math.random())} className="text-[10px] text-blue-800 truncate">
                            {label}
                          </div>
                        )
                      })}
                      {eventCount > maxShown ? (
                        <div className="text-[10px] text-muted-foreground">+{eventCount - maxShown} more</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWeekStart((w) => addWeeks(w, -1))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium text-gray-900">{formatWeekRange(weekStart)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map((date) => {
              const key = toLocalYmd(date)
              const isToday = key === isTodayKey
              const isSelected = selectedKey === key
              const events = eventsByDay.get(key) ?? []

              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-md border p-2 bg-white',
                    isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedKey(key)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-900">
                        {DAY_LABELS[date.getDay()]} {date.getDate()}
                      </div>
                      {isToday ? (
                        <div className="text-[10px] font-semibold text-blue-700 bg-blue-100 rounded px-1">
                          Today
                        </div>
                      ) : null}
                    </div>
                  </button>

                  <div className="mt-2 space-y-2">
                    {events.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No events</div>
                    ) : (
                      events.map((t: any) => {
                        const fee = typeof t.entryFeeCents === 'number' ? t.entryFeeCents : 0
                        const isPaid = fee > 0
                        const occupancy =
                          t?.totals && t.totals.totalSlots ? `${t.totals.filledSlots}/${t.totals.totalSlots}` : null
                        const typeLabel = formatTournamentType(t.format)
                        const timeLabel = formatTime(t.startDate)
                        const showGender = t.genderLabel && t.genderLabel !== 'Any'

                        return (
                          <div key={t.id} className="rounded-md border bg-white p-2">
                            <Link
                              href={`/tournaments/${t.id}/register`}
                              className="text-xs font-semibold text-gray-900 hover:underline block truncate"
                              title="Open registration"
                            >
                              {t.title}
                            </Link>
                            <div className="mt-1 text-[11px] text-muted-foreground">{timeLabel}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {isPaid ? (
                                <Badge variant="secondary">${fromCents(fee).toFixed(2)}</Badge>
                              ) : (
                                <Badge variant="outline">Free</Badge>
                              )}
                              <Badge variant="outline">{typeLabel}</Badge>
                              {occupancy ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Users className="h-3 w-3" />
                                  {occupancy}
                                </Badge>
                              ) : null}
                              {showGender ? <Badge variant="outline">{t.genderLabel}</Badge> : null}
                              {t.duprLabel ? <Badge variant="outline">{t.duprLabel}</Badge> : null}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

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
              const occupancy =
                tournament.totals && tournament.totals.totalSlots
                  ? `${tournament.totals.filledSlots}/${tournament.totals.totalSlots}`
                  : null
              const typeLabel = formatTournamentType(tournament.format)
              const timeLabel = formatTime(tournament.startDate)
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
                      {timeLabel}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {isPaid ? (
                        <Badge variant="secondary">${fromCents(fee).toFixed(2)}</Badge>
                      ) : (
                        <Badge variant="outline">Free</Badge>
                      )}
                      <Badge variant="outline">{typeLabel}</Badge>
                      {occupancy ? (
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3 w-3" />
                          {occupancy}
                        </Badge>
                      ) : null}
                      {tournament.genderLabel ? <Badge variant="outline">{tournament.genderLabel}</Badge> : null}
                      {tournament.duprLabel ? <Badge variant="outline">{tournament.duprLabel}</Badge> : null}
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

function ClubInviteCard({
  clubId,
  clubName,
  isLoggedIn,
  canEmailInvite,
  onSignIn,
}: {
  clubId: string
  clubName: string
  isLoggedIn: boolean
  canEmailInvite: boolean
  onSignIn: () => void
}) {
  const { toast } = useToast()
  const [inviteUrl, setInviteUrl] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [email, setEmail] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const utils = trpc.useUtils()
  const sendInvite = trpc.club.sendInvite.useMutation()

  useEffect(() => {
    if (typeof window === 'undefined') return
    setInviteUrl(`${window.location.origin}/clubs/${clubId}?ref=invite`)
  }, [clubId])

  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  const trimmedUserQuery = userQuery.trim()
  const { data: users = [], isFetching: isSearching } = trpc.user.search.useQuery(
    { query: trimmedUserQuery },
    { enabled: isLoggedIn && canEmailInvite && trimmedUserQuery.length >= 2 }
  )

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Copied', description: 'Invite link copied to clipboard.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy it manually.', variant: 'destructive' })
    }
  }

  const handleShare = async () => {
    if (!inviteUrl) return
    if (!canShare) {
      await copyText(inviteUrl)
      return
    }
    try {
      await (navigator as any).share({
        title: clubName,
        text: `Join ${clubName} on Piqle`,
        url: inviteUrl,
      })
    } catch {
      // User dismissed share; don't show an error toast.
    }
  }

  const handleInviteUser = async (inviteeUserId: string) => {
    try {
      const res = await sendInvite.mutateAsync({ clubId, inviteeUserId })
      toast({
        title: res.reason === 'already_joined' ? 'Already joined' : 'Invite sent',
        description:
          res.reason === 'already_joined'
            ? 'This user already joined the club.'
            : res.delivered
              ? 'Email invite delivered.'
              : res.reason === 'smtp_missing'
                ? 'SMTP is not configured.'
                : 'Invite queued.',
      })
      setUserQuery('')
      await utils.club.get.invalidate({ id: clubId })
    } catch (err: any) {
      toast({ title: 'Failed to invite', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }

  const handleInviteEmail = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    try {
      const res = await sendInvite.mutateAsync({ clubId, inviteeEmail: trimmed })
      toast({
        title: 'Invite sent',
        description: res.delivered
          ? 'Email invite delivered.'
          : res.reason === 'smtp_missing'
            ? 'SMTP is not configured.'
            : 'Invite queued.',
      })
      setEmail('')
      await utils.club.get.invalidate({ id: clubId })
    } catch (err: any) {
      toast({ title: 'Failed to invite', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          Invite to this club
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-900">Invite link</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={inviteUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={() => inviteUrl && copyText(inviteUrl)} disabled={!inviteUrl}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button type="button" className="gap-2" onClick={handleShare} disabled={!inviteUrl}>
                <Share2 className="h-4 w-4" />
                {canShare ? 'Share' : 'Copy & Share'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setShowQr((v) => !v)}
                disabled={!inviteUrl}
                title="Show QR code"
              >
                <QrCode className="h-4 w-4" />
                {showQr ? 'Hide QR' : 'QR'}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Share this link in social media or copy it into a message.
          </div>
          {showQr && inviteUrl ? (
            <div className="rounded-md border bg-white p-3 flex flex-col sm:flex-row items-center gap-3">
              <div className="rounded-md border bg-white p-2">
                <QRCode
                  value={inviteUrl}
                  size={168}
                  style={{ height: 'auto', maxWidth: '100%', width: 168 }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Scan to open the club page.
              </div>
            </div>
          ) : null}
        </div>

        {!isLoggedIn ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <div className="min-w-0">Sign in to send email invites (admins only).</div>
            <Button type="button" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
        ) : !canEmailInvite ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
            Only club admins can send email invites. Use the invite link or QR code.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-gray-900">Email invites (admins)</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setAdvancedOpen((v) => !v)}>
                {advancedOpen ? 'Hide' : 'Show'}
              </Button>
            </div>

            {advancedOpen ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-900">Invite registered users</div>
                  <Input
                    placeholder="Search by name or email (min 2 chars)"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground">
                    Emails are hidden for privacy.
                  </div>
                  {trimmedUserQuery.length < 2 ? (
                    <div className="text-xs text-muted-foreground">Start typing to search users.</div>
                  ) : isSearching ? (
                    <div className="text-xs text-muted-foreground">Searching…</div>
                  ) : users.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No users found.</div>
                  ) : (
                    <div className="rounded-md border divide-y bg-white">
                      {users.map((u: any) => (
                        <div key={u.id} className="p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            {u.image ? (
                              <div className="relative w-7 h-7 rounded-full overflow-hidden border border-gray-200">
                                <Image src={u.image} alt="" fill className="object-cover" />
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200" />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{u.name || 'Piqle user'}</div>
                              {u.emailMasked ? (
                                <div className="text-xs text-muted-foreground truncate">{u.emailMasked}</div>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            disabled={sendInvite.isPending}
                            onClick={() => handleInviteUser(u.id)}
                          >
                            <Mail className="h-4 w-4" />
                            Invite
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-900">Invite by email</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <Button type="button" className="gap-2" onClick={handleInviteEmail} disabled={sendInvite.isPending || !email.trim()}>
                      <Mail className="h-4 w-4" />
                      Send
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Limits apply to prevent spam.
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Limits apply to prevent spam.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClubChatCard({
  clubId,
  isLoggedIn,
  isJoined,
  isAdmin,
  currentUserId,
  onJoinToggle,
}: {
  clubId: string
  isLoggedIn: boolean
  isJoined: boolean
  isAdmin: boolean
  currentUserId?: string
  onJoinToggle: () => void
}) {
  const utils = trpc.useUtils()
  const messageLimit = 100

  const { data: messages, isLoading, error } = trpc.clubChat.list.useQuery(
    { clubId, limit: messageLimit },
    { enabled: !!clubId }
  )

  const sendMessage = trpc.clubChat.send.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit: messageLimit })
    },
  })

  const deleteMessage = trpc.clubChat.delete.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit: messageLimit })
    },
  })

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const canPost = isLoggedIn && (isJoined || isAdmin)

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages?.length, scrollToBottom])

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    if (!canPost || sendMessage.isPending) return

    try {
      await sendMessage.mutateAsync({ clubId, text })
      setDraft('')
      // Scroll after the list refetch lands.
      setTimeout(scrollToBottom, 50)
    } catch {
      // toast is handled by global tRPC error or UI; keep MVP simple.
    }
  }, [draft, canPost, sendMessage, clubId, scrollToBottom])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Club chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading chat…</div>
        ) : null}
        {error ? (
          <div className="text-sm text-destructive">{error.message}</div>
        ) : null}

        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto rounded-md border bg-white"
        >
          {!isLoading && (!messages || messages.length === 0) ? (
            <div className="p-3 text-sm text-muted-foreground">
              No messages yet. Start the conversation.
            </div>
          ) : (
            <div className="divide-y">
              {(messages ?? []).map((m: any) => {
                const isMine = currentUserId && m.userId === currentUserId
                const canDelete = Boolean(isAdmin || isMine)

                return (
                  <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {m.user?.name || m.user?.email || 'User'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                        </div>
                        {isMine ? <Badge variant="secondary">You</Badge> : null}
                      </div>
                      <div className={cn('mt-1 text-sm whitespace-pre-wrap break-words', m.isDeleted ? 'text-muted-foreground italic' : 'text-gray-700')}>
                        {m.isDeleted ? 'Message removed' : m.text}
                      </div>
                    </div>

                    {canDelete && !m.isDeleted ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={deleteMessage.isPending}
                        onClick={async () => {
                          if (!confirm('Delete this message?')) return
                          await deleteMessage.mutateAsync({ messageId: m.id })
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!isLoggedIn ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
            Sign in to join and chat with this club.
          </div>
        ) : !canPost ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <div className="min-w-0">Join this club to post messages.</div>
            <Button type="button" onClick={onJoinToggle} disabled={sendMessage.isPending}>
              Join
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message…"
              rows={2}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              type="button"
              className="gap-2"
              disabled={!draft.trim() || sendMessage.isPending}
              onClick={handleSend}
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
