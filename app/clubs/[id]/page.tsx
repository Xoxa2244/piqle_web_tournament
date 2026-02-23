'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { fromCents, toCents } from '@/lib/payment'
import { formatUsDateShort, formatUsDateTimeShort, formatUsTimeShort } from '@/lib/dateFormat'
import { generateRecurringStartDates, parseYmdToUtc } from '@/lib/recurrence'
import { ENABLE_RECURRING_DRAFTS } from '@/lib/features'
import { toUtcIsoFromLocalInput } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, MapPin, Users, Megaphone, Plus, MessageCircle, Send, Trash2, Share2, Copy, Mail, QrCode, Ban, UserMinus, X, Layers, Pencil } from 'lucide-react'
import Image from 'next/image'
import QRCode from 'react-qr-code'
import TournamentModal from '@/components/TournamentModal'
import CreateClubModal from '@/components/CreateClubModal'

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

const getRegistrationMaxDateTime = (startDate: string) => {
  const day = String(startDate || '').split('T')[0]
  return day ? `${day}T23:59` : undefined
}

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
  const startLabel = formatUsDateShort(weekStart)
  const endLabel = formatUsDateShort(end)
  return `${startLabel}–${endLabel}`
}

const formatEventDateTimeRange = (
  startDate: Date | string,
  endDate?: Date | string,
  timeZone?: string | null
) => {
  const end = endDate ?? startDate
  return `${formatUsDateTimeShort(startDate, { timeZone })} - ${formatUsDateTimeShort(end, {
    timeZone,
  })}`
}

const formatEventTimeRange = (
  startDate: Date | string,
  endDate?: Date | string,
  timeZone?: string | null
) => {
  const start = new Date(startDate)
  const end = new Date(endDate ?? startDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: String(timeZone || '').trim() || undefined,
    })
    return `${formatter.format(start)} - ${formatter.format(end)}`
  } catch {
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
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
  const searchParams = useSearchParams()
  const clubId = params.id as string
  const tabFromUrl = searchParams.get('tab')
  const [clubTab, setClubTab] = useState<'upcoming' | 'announcements' | 'members'>(() =>
    tabFromUrl === 'members' || tabFromUrl === 'announcements' ? tabFromUrl : 'upcoming'
  )

  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'
  const { toast } = useToast()

  const { data: club, isLoading, error } = trpc.club.get.useQuery({ id: clubId }, { enabled: !!clubId })
  const utils = trpc.useUtils()

  const toggleFollow = trpc.club.toggleFollow.useMutation({
    onSuccess: (data) => {
      if (data.status === 'pending') {
        toast({ description: 'Request sent.', variant: 'success' })
      } else if (data.status === 'joined') {
        toast({ description: 'You joined the club.', variant: 'success' })
      } else if (data.status === 'left') {
        toast({ description: 'You left the club.', variant: 'success' })
      }
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })
  const deleteClub = trpc.club.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Club deleted', description: 'The club has been permanently deleted.', variant: 'success' })
      setDeleteClubOpen(false)
      setDeleteClubConfirmText('')
      router.push('/clubs')
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: () => {
      toast({ description: 'Join request cancelled.', variant: 'success' })
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })
  const markClubJoinRequestSeen = trpc.notification.markClubJoinRequestSeen.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  })
  const createAnnouncement = trpc.club.createAnnouncement.useMutation()
  const updateAnnouncement = trpc.club.updateAnnouncement.useMutation()
  const deleteAnnouncement = trpc.club.deleteAnnouncement.useMutation()

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'members' || t === 'announcements') setClubTab(t)
    else if (t !== 'upcoming') setClubTab('upcoming')
  }, [searchParams])

  useEffect(() => {
    if (clubTab === 'members' && club?.isAdmin && clubId) {
      markClubJoinRequestSeen.mutate({ clubId })
    }
  }, [clubTab, club?.isAdmin, clubId])

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
  })

  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [editingAnnouncementForm, setEditingAnnouncementForm] = useState({ title: '', body: '' })

  const [inviteOpen, setInviteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [cancelJoinOpen, setCancelJoinOpen] = useState(false)
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false)
  const [modalTournamentId, setModalTournamentId] = useState<string | null>(null)
  const [editClubModalOpen, setEditClubModalOpen] = useState(false)
  const [deleteClubOpen, setDeleteClubOpen] = useState(false)
  const [deleteClubConfirmText, setDeleteClubConfirmText] = useState('')

  const bookingUrl = (club?.courtReserveUrl ?? '').trim()
  const canBook = Boolean(bookingUrl)
  const bookingButtonLabel = 'Booking courts'

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
    await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
  }

  const handleConfirmLeave = async () => {
    if (!isLoggedIn) {
      setLeaveOpen(false)
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/clubs/${clubId}`)}`)
      return
    }

    try {
      await toggleFollow.mutateAsync({ clubId })
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.list.invalidate(),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      setLeaveOpen(false)
    } catch (err: any) {
      toast({
        title: 'Failed to leave',
        description: err?.message || 'Try again',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmCancelJoin = async () => {
    if (!isLoggedIn) {
      setCancelJoinOpen(false)
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/clubs/${clubId}`)}`)
      return
    }

    try {
      await cancelJoinRequest.mutateAsync({ clubId })
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.list.invalidate(),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      setCancelJoinOpen(false)
      toast({ title: 'Request canceled', description: 'Your join request was canceled.' })
    } catch (err: any) {
      toast({
        title: 'Failed',
        description: err?.message || 'Try again',
        variant: 'destructive',
      })
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

  const startEditAnnouncement = (a: any) => {
    setEditingAnnouncementId(a.id)
    setEditingAnnouncementForm({ title: a.title || '', body: a.body || '' })
  }

  const cancelEditAnnouncement = () => {
    setEditingAnnouncementId(null)
    setEditingAnnouncementForm({ title: '', body: '' })
  }

  const handleSaveAnnouncement = async () => {
    if (!isLoggedIn) return
    if (!editingAnnouncementId) return
    try {
      await updateAnnouncement.mutateAsync({
        clubId,
        announcementId: editingAnnouncementId,
        title: editingAnnouncementForm.title || undefined,
        body: editingAnnouncementForm.body,
      })
      toast({ title: 'Updated', description: 'Announcement updated.' })
      cancelEditAnnouncement()
      await utils.club.get.invalidate({ id: clubId })
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!isLoggedIn) return
    if (!confirm('Delete this announcement?')) return
    try {
      await deleteAnnouncement.mutateAsync({ clubId, announcementId })
      toast({ title: 'Deleted', description: 'Announcement removed.' })
      if (editingAnnouncementId === announcementId) {
        cancelEditAnnouncement()
      }
      await utils.club.get.invalidate({ id: clubId })
    } catch (err: any) {
      toast({ title: 'Failed to delete', description: err?.message || 'Try again', variant: 'destructive' })
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
      <div className="space-y-6 px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {error?.message || 'Club not found.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="space-y-3">
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
                    <div className="max-w-2xl">
                      <p className="text-sm text-gray-700 truncate">{club.description}</p>
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline mt-0.5"
                        onClick={() => setDescriptionModalOpen(true)}
                      >
                        Show full description
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
              {(club as any).isBanned ? (
                <Button variant="secondary" className="gap-2" disabled title="You are banned from this club">
                  <Ban className="h-4 w-4" />
                  Banned
                </Button>
              ) : club.isAdmin ? (
                <Button variant="secondary" className="gap-2" disabled title="You are an admin of this club">
                  <Users className="h-4 w-4" />
                  Admin
                </Button>
              ) : club.isFollowing ? (
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => setLeaveOpen(true)}
                  disabled={toggleFollow.isPending}
                >
                  <UserMinus className="h-4 w-4" />
                  Leave
                </Button>
              ) : (club as any).joinPolicy === 'APPROVAL' ? (
                (club as any).isJoinPending ? (
                  <>
                    <Button variant="secondary" className="gap-2" disabled title="Pending admin approval">
                      <Users className="h-4 w-4" />
                      Pending
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setCancelJoinOpen(true)}
                      disabled={cancelJoinRequest.isPending}
                    >
                      <X className="h-4 w-4" />
                      Cancel request
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="default"
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleToggleFollow}
                    disabled={toggleFollow.isPending}
                    title={!isLoggedIn ? 'Sign in to request access' : undefined}
                  >
                    <Users className="h-4 w-4" />
                    Request to join
                  </Button>
                )
              ) : (
                <Button
                  variant="default"
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleToggleFollow}
                  disabled={toggleFollow.isPending}
                  title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
                >
                  <Users className="h-4 w-4" />
                  Join
                </Button>
              )}

              {club.isAdmin ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Edit club"
                    onClick={() => setEditClubModalOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Invite"
                    onClick={() => setInviteOpen((v) => !v)}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Delete club"
                    onClick={() => setDeleteClubOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}

              {club.isFollowing && !club.isAdmin ? (
                <Button variant="outline" size="icon" title="Invite" onClick={() => setInviteOpen((v) => !v)}>
                  <Share2 className="h-4 w-4" />
                </Button>
              ) : null}

              {canBook ? (
                <a href={bookingUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    {bookingButtonLabel}
                  </Button>
                </a>
              ) : null}
              </div>
              {club.isAdmin ? (
                <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">
                  <Link href={`/admin/new?clubId=${encodeURIComponent(club.id)}`}>
                    <Plus className="h-4 w-4" />
                    Create Tournament
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_480px] lg:items-start">
          <div className="space-y-4 min-w-0">
            <Tabs
              value={clubTab}
              onValueChange={(v) => {
                const tab = v as 'upcoming' | 'announcements' | 'members'
                setClubTab(tab)
                const url = new URL(window.location.href)
                url.searchParams.set('tab', tab)
                router.replace(url.pathname + url.search)
                if (tab === 'members' && club?.isAdmin && clubId) {
                  markClubJoinRequestSeen.mutate({ clubId })
                }
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="upcoming" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Upcoming events
                </TabsTrigger>
                <TabsTrigger value="announcements" className="gap-2">
                  <Megaphone className="h-4 w-4" />
                  Announcements
                </TabsTrigger>
                <TabsTrigger value="members" className="gap-2">
                  <Users className="h-4 w-4" />
                  Members
                  {(club as { pendingJoinRequestCount?: number } | null)?.pendingJoinRequestCount ? (
                    <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                      {(club as { pendingJoinRequestCount: number }).pendingJoinRequestCount > 99
                        ? '99+'
                        : (club as { pendingJoinRequestCount: number }).pendingJoinRequestCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Upcoming events
                </CardTitle>
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
                          role="button"
                          tabIndex={0}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                          onClick={() => setModalTournamentId(tournament.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setModalTournamentId(tournament.id)
                            }
                          }}
                        >
                          <div className="min-w-0 text-left">
                            <div className="font-medium text-gray-900 truncate">{tournament.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatEventDateTimeRange(
                                tournament.startDate,
                                tournament.endDate,
                                tournament.timezone
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {typeof tournament.entryFeeCents === 'number' && tournament.entryFeeCents > 0 ? (
                                <Badge variant="secondary">Paid</Badge>
                              ) : (
                                <Badge variant="outline">Free</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Link href={`/tournaments/${tournament.id}/register`}>
                              <Button>
                                {typeof tournament.entryFeeCents === 'number' && tournament.entryFeeCents > 0
                                  ? `Join & Pay${typeof tournament.entryFeeCents === 'number' ? ` — $${fromCents(tournament.entryFeeCents).toFixed(2)}` : ''}`
                                  : 'Join'}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="calendar">
                    <ClubEventsCalendar
                      tournaments={tournaments}
                      eventsByDay={eventsByDay}
                      onTournamentClick={setModalTournamentId}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="announcements" className="mt-0">
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
                            {formatUsDateTimeShort(a.createdAt)}
                            {a.updatedAt && new Date(a.updatedAt).getTime() > new Date(a.createdAt).getTime()
                              ? ` • edited ${formatUsDateTimeShort(a.updatedAt)}`
                              : ''}
                            {a.createdByUser?.name ? ` • ${a.createdByUser.name}` : ''}
                          </div>
                        </div>
                        {club.isAdmin ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => startEditAnnouncement(a)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              disabled={deleteAnnouncement.isPending}
                              onClick={() => handleDeleteAnnouncement(a.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {editingAnnouncementId === a.id && club.isAdmin ? (
                        <div className="space-y-2 rounded-md border bg-gray-50 p-3">
                          <Input
                            placeholder="Title (optional)"
                            value={editingAnnouncementForm.title}
                            onChange={(e) =>
                              setEditingAnnouncementForm((p) => ({ ...p, title: e.target.value }))
                            }
                          />
                          <Textarea
                            value={editingAnnouncementForm.body}
                            onChange={(e) =>
                              setEditingAnnouncementForm((p) => ({ ...p, body: e.target.value }))
                            }
                            rows={4}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={cancelEditAnnouncement}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={handleSaveAnnouncement}
                              disabled={updateAnnouncement.isPending || !editingAnnouncementForm.body.trim()}
                            >
                              {updateAnnouncement.isPending ? 'Saving…' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{a.body}</div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="members" className="mt-0">
            {club.isAdmin || club.isFollowing ? (
              <ClubMembersAdminCard
                clubId={club.id}
                canModerate={club.isAdmin}
                currentUserId={session?.user?.id}
              />
            ) : (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Join the club to see members.
                </CardContent>
              </Card>
            )}
              </TabsContent>
            </Tabs>
          </div>

          <div
            className="sticky top-16 flex min-h-0 w-full min-w-0 flex-col overflow-hidden lg:w-[480px]"
            style={{ height: 'calc(100vh - 18rem)', maxHeight: 'calc(100vh - 18rem)', boxSizing: 'border-box' }}
          >
            <ClubChatCard
              clubId={club.id}
              isLoggedIn={isLoggedIn}
              isJoined={club.isFollowing}
              isBanned={(club as any).isBanned}
              joinPolicy={(club as any).joinPolicy}
              isJoinPending={(club as any).isJoinPending}
              isAdmin={club.isAdmin}
              currentUserId={session?.user?.id}
              onJoinToggle={handleToggleFollow}
            />
          </div>
        </div>
      </div>

      <TournamentModal
        tournamentId={modalTournamentId}
        onClose={() => setModalTournamentId(null)}
      />

      <CreateClubModal
        isOpen={editClubModalOpen}
        onClose={() => setEditClubModalOpen(false)}
        onSuccess={() => {
          utils.club.get.invalidate({ id: clubId })
          setEditClubModalOpen(false)
        }}
        clubId={editClubModalOpen ? clubId : null}
      />

      {/* Full description modal */}
      {descriptionModalOpen && club.description ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDescriptionModalOpen(false)}
        >
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 rounded-full"
              onClick={() => setDescriptionModalOpen(false)}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
            <h3 className="text-lg font-semibold text-gray-900 pr-10">{club.name}</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-3">{club.description}</p>
          </div>
        </div>
      ) : null}

      {/* Invite Modal */}
      {inviteOpen && (club.isFollowing || club.isAdmin) && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 pt-12"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 rounded-full"
              onClick={() => setInviteOpen(false)}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
            <ClubInviteCard
              clubId={club.id}
              clubName={club.name}
              isLoggedIn={isLoggedIn}
              canEmailInvite={club.isAdmin}
              onSignIn={() => router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/clubs/${clubId}`)}`)}
            />
          </div>
        </div>
      )}

      {/* Delete Club Modal */}
      {deleteClubOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDeleteClubOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete club</h3>
            <p className="text-gray-600 text-sm mb-4">
              This will permanently delete the club <span className="font-medium">{club.name}</span>, all its data (members, announcements, chat), and unlink any tournaments created for this club. This action cannot be undone.
            </p>
            <p className="text-sm text-gray-700 mb-2">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteClubConfirmText}
              onChange={(e) => setDeleteClubConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono mb-6"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setDeleteClubOpen(false); setDeleteClubConfirmText('') }} disabled={deleteClub.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteClub.mutate({ clubId })}
                disabled={deleteClubConfirmText !== 'DELETE' || deleteClub.isPending}
              >
                {deleteClub.isPending ? 'Deleting…' : 'Delete club'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Club Confirmation Modal */}
      {leaveOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setLeaveOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Leave club?</h3>
            <p className="text-gray-600 text-sm mb-6">
              Are you sure you want to leave <span className="font-medium">{club.name}</span>? You will stop receiving updates and won&apos;t be able to post in chat.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={toggleFollow.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmLeave} disabled={toggleFollow.isPending}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Join Request Modal */}
      {cancelJoinOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setCancelJoinOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel join request?</h3>
            <p className="text-gray-600 text-sm mb-6">
              You will remove your pending request to join <span className="font-medium">{club.name}</span>.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setCancelJoinOpen(false)} disabled={cancelJoinRequest.isPending}>
                No
              </Button>
              <Button variant="destructive" onClick={handleConfirmCancelJoin} disabled={cancelJoinRequest.isPending}>
                Yes, cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ClubEventsCalendar({
  tournaments,
  eventsByDay,
  onTournamentClick,
}: {
  tournaments: Array<{
    id: string
    title: string
    startDate: Date | string
    endDate?: Date | string
    timezone?: string | null
    entryFeeCents?: number | null
    publicSlug?: string | null
    format?: string | null
    totals?: { totalSlots: number; filledSlots: number } | null
    genderLabel?: string | null
    duprLabel?: string | null
  }>
  eventsByDay: Map<string, any[]>
  onTournamentClick?: (tournamentId: string) => void
}) {
  const now = new Date()
  const initialBase = tournaments[0] ? new Date(tournaments[0].startDate) : now
  const [month, setMonth] = useState(() => startOfMonth(initialBase))
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    tournaments[0] ? toLocalYmd(initialBase) : null
  )
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>(() => 'month')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialBase))
  const detailsRef = useRef<HTMLDivElement | null>(null)

  const grid = useMemo(() => buildMonthGrid(month), [month])

  const isTodayKey = toLocalYmd(now)
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) ?? []) : []

  const openDay = useCallback(
    (key: string, date: Date, opts?: { scrollToDetails?: boolean }) => {
      setSelectedKey(key)
      setWeekStart(startOfWeek(date))
      if (opts?.scrollToDetails) {
        // Let the details section render before scrolling.
        setTimeout(() => {
          detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 30)
      }
    },
    []
  )

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
      case 'ONE_DAY_LADDER':
        return 'One-day ladder'
      case 'LADDER_LEAGUE':
        return 'Ladder league'
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
      case 'ONE_DAY_LADDER':
        return 'LAD'
      case 'LADDER_LEAGUE':
        return 'LL'
      default:
        return null
    }
  }

  const formatTime = (startDate: Date | string, endDate?: Date | string, timeZone?: string | null) =>
    formatEventTimeRange(startDate, endDate, timeZone)

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
	              const maxShown = 1

	              return (
	                <div
	                  key={key}
	                  onClick={() => {
	                    openDay(key, date, { scrollToDetails: eventCount > 0 })
	                  }}
	                  onKeyDown={(e) => {
	                    if (e.key === 'Enter' || e.key === ' ') {
	                      e.preventDefault()
	                      openDay(key, date, { scrollToDetails: eventCount > 0 })
	                    }
	                  }}
	                  role="button"
	                  tabIndex={0}
	                  className={cn(
	                    'h-16 sm:h-20 rounded-md border px-2 py-1 text-left transition-colors overflow-hidden',
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
                        const meta = [
                          formatTime(ev.startDate, ev.endDate, ev.timezone),
                          shortType,
                          occupancy,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                        const label = meta ? `${meta} · ${ev?.title ?? 'Event'}` : ev?.title ?? 'Event'

                        return ev?.id ? (
                          <button
                            key={ev.id}
                            type="button"
                            className="block w-full rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-800 truncate hover:bg-blue-100 text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              onTournamentClick?.(ev.id)
                            }}
                            title="View tournament"
                          >
                            {label}
                          </button>
                        ) : (
                          <div key={String(ev?.title ?? Math.random())} className="text-[10px] text-blue-800 truncate">
                            {label}
                          </div>
                        )
	                      })}
	                      {eventCount > maxShown ? (
	                        <button
	                          type="button"
	                          className="text-[10px] text-muted-foreground hover:underline"
	                          onClick={(e) => {
	                            e.stopPropagation()
	                            openDay(key, date, { scrollToDetails: true })
	                          }}
	                        >
	                          +{eventCount - maxShown} more
	                        </button>
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
	                    onClick={() => openDay(key, date, { scrollToDetails: events.length > 0 })}
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
                        const timeLabel = formatTime(t.startDate, t.endDate, t.timezone)
                        const showGender = t.genderLabel && t.genderLabel !== 'Any'

                        return (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            className="rounded-md border bg-white p-2 cursor-pointer transition-colors hover:bg-gray-50"
                            onClick={() => onTournamentClick?.(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onTournamentClick?.(t.id)
                              }
                            }}
                          >
                            <div className="text-xs font-semibold text-gray-900 truncate">{t.title}</div>
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

	      <div ref={detailsRef} className="rounded-md border p-3 space-y-3">
	        <div className="text-sm font-medium text-gray-900">
          {selectedKey ? `Events on ${formatUsDateShort(parseYmd(selectedKey))}` : 'Select a day'}
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
              const timeLabel = formatTime(
                tournament.startDate,
                tournament.endDate,
                tournament.timezone
              )
              return (
                <div
                  key={tournament.id}
                  role="button"
                  tabIndex={0}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => onTournamentClick?.(tournament.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onTournamentClick?.(tournament.id)
                    }
                  }}
                >
                  <div className="min-w-0 text-left">
                    <div className="font-medium text-gray-900 truncate">{tournament.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {timeLabel}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {isPaid ? (
                        <Badge variant="secondary">${fromCents(fee).toFixed(2)}</Badge>
                      ) : (
                        <Badge variant="outline">Free</Badge>
                      )}
                      {typeLabel ? <Badge variant="outline">{typeLabel}</Badge> : null}
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
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/tournaments/${tournament.id}/register`}>
                      <Button size="sm">
                        {isPaid ? `Join & Pay — $${fromCents(fee).toFixed(2)}` : 'Join'}
                      </Button>
                    </Link>
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
  const clientBaseUrl = typeof window !== 'undefined' ? window.location.origin : null

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
      const res = await sendInvite.mutateAsync({ clubId, inviteeUserId, baseUrl: clientBaseUrl })
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
      const res = await sendInvite.mutateAsync({ clubId, inviteeEmail: trimmed, baseUrl: clientBaseUrl })
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
  isBanned,
  joinPolicy,
  isJoinPending,
  isAdmin,
  currentUserId,
  onJoinToggle,
}: {
  clubId: string
  isLoggedIn: boolean
  isJoined: boolean
  isBanned: boolean
  joinPolicy?: 'OPEN' | 'APPROVAL' | null
  isJoinPending?: boolean
  isAdmin: boolean
  currentUserId?: string
  onJoinToggle: () => void
}) {
  const utils = trpc.useUtils()
  const { toast } = useToast()
  const messageLimit = 100

  const canView = isLoggedIn && !isBanned && (isJoined || isAdmin)
  const { data: messages, isLoading, error } = trpc.clubChat.list.useQuery(
    { clubId, limit: messageLimit },
    { enabled: !!clubId && canView }
  )

  const sendMessage = trpc.clubChat.send.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit: messageLimit })
      await utils.club.listMyChatClubs.invalidate()
    },
  })

  const deleteMessage = trpc.clubChat.delete.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit: messageLimit })
      await utils.club.listMyChatClubs.invalidate()
    },
  })

  const markRead = trpc.clubChat.markRead.useMutation({
    onSuccess: async () => {
      await utils.club.listMyChatClubs.invalidate()
    },
  })

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const canPost = canView

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages?.length, scrollToBottom])

  useEffect(() => {
    if (!canView) return
    markRead.mutate({ clubId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, canView, messages?.length])

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    if (!canPost || sendMessage.isPending) return

    try {
      const res: any = await sendMessage.mutateAsync({ clubId, text })
      setDraft('')
      if (res?.wasFiltered) {
        toast({ title: 'Filtered', description: 'Some words were filtered.' })
      }
      // Scroll after the list refetch lands.
      setTimeout(scrollToBottom, 50)
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err?.message || 'Try again', variant: 'destructive' })
    }
  }, [draft, canPost, sendMessage, clubId, scrollToBottom, toast])

  return (
    <Card className="flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Club chat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 pt-0">
        {isLoading && canView ? (
          <div className="text-sm text-muted-foreground">Loading chat…</div>
        ) : null}
        {error && canView ? (
          <div className="text-sm text-destructive">{error.message}</div>
        ) : null}

        {canView ? (
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto bg-gray-50/50 px-2 py-1.5 space-y-1">
            {!isLoading && (!messages || messages.length === 0) ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</div>
            ) : (() => {
              const todayKey = toLocalYmd(new Date())
              const yesterday = new Date()
              yesterday.setDate(yesterday.getDate() - 1)
              const yesterdayKey = toLocalYmd(yesterday)
              const groups: { dateKey: string; dateLabel: string; list: any[] }[] = []
              let currentKey = ''
              for (const m of messages ?? []) {
                const d = m.createdAt ? new Date(m.createdAt) : new Date()
                const key = toLocalYmd(d)
                if (key !== currentKey) {
                  currentKey = key
                  groups.push({
                    dateKey: key,
                    dateLabel: key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatUsDateShort(d),
                    list: [],
                  })
                }
                groups[groups.length - 1]!.list.push(m)
              }
              return (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div key={g.dateKey} className="space-y-1">
                      <div className="text-center">
                        <span className="text-[11px] text-muted-foreground bg-gray-200/80 rounded-full px-2 py-0.5">
                          {g.dateLabel}
                        </span>
                      </div>
                      {g.list.map((m: any) => {
                        const isMine = currentUserId && m.userId === currentUserId
                        const canDelete = Boolean(isAdmin || isMine)
                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'flex items-end gap-1.5',
                              isMine ? 'flex-row-reverse justify-start group' : 'flex-row group'
                            )}
                          >
                            {!isMine ? (
                              <div className="relative w-6 h-6 flex-shrink-0 rounded-full overflow-hidden border border-gray-200 bg-gray-200">
                                {m.user?.image ? (
                                  <Image src={m.user.image} alt="" fill className="object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] font-medium text-gray-500">
                                    {(m.user?.name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                'group relative max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                                isMine
                                  ? 'rounded-br-md bg-blue-600 text-white'
                                  : 'rounded-bl-md bg-gray-200/90 text-gray-900'
                              )}
                            >
                              {!isMine ? (
                                <div className="text-xs font-medium text-gray-700 mb-0.5 truncate">
                                  {m.user?.name || 'User'}
                                </div>
                              ) : null}
                              <div className={cn(m.isDeleted && 'italic text-inherit opacity-80')}>
                                {m.isDeleted ? 'Message removed' : m.text}
                              </div>
                              <div className={cn(
                                'text-[10px] mt-1',
                                isMine ? 'text-blue-100' : 'text-gray-500'
                              )}>
                                {m.createdAt ? formatUsTimeShort(m.createdAt) : ''}
                              </div>
                            </div>
                            {canDelete && !m.isDeleted ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-500 hover:text-red-600"
                                disabled={deleteMessage.isPending}
                                onClick={async () => {
                                  if (!confirm('Delete this message?')) return
                                  await deleteMessage.mutateAsync({ messageId: m.id })
                                }}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
            Join this club to view chat history and post messages.
          </div>
        )}

        {!isLoggedIn ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
            Sign in to join and chat with this club.
          </div>
        ) : isBanned ? (
          <div className="rounded-md border bg-red-50 p-3 text-sm text-red-800">
            You are banned from this club.
          </div>
        ) : !canPost ? (
          joinPolicy === 'APPROVAL' ? (
            isJoinPending ? (
              <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
                Your join request is pending admin approval. Chat will open after approval.
              </div>
            ) : (
              <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
                <div className="min-w-0">Request to join this club to view and post messages.</div>
                <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onJoinToggle} disabled={sendMessage.isPending}>
                  Request
                </Button>
              </div>
            )
          ) : (
            <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
              <div className="min-w-0">Join this club to view and post messages.</div>
              <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onJoinToggle} disabled={sendMessage.isPending}>
                Join
              </Button>
            </div>
          )
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              className="flex-1 min-w-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              disabled={!draft.trim() || sendMessage.isPending}
              onClick={handleSend}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClubMembersAdminCard({
  clubId,
  canModerate,
  currentUserId,
}: {
  clubId: string
  canModerate: boolean
  currentUserId?: string
}) {
  const { toast } = useToast()
  const utils = trpc.useUtils()

  const { data, isLoading, error } = trpc.club.listMembers.useQuery({ clubId }, { enabled: !!clubId })
  const canManage = Boolean(canModerate || (data as any)?.canModerate)

  const approveJoinRequest = trpc.club.approveJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.listMembers.invalidate({ clubId }), utils.club.get.invalidate({ id: clubId })])
    },
  })

  const rejectJoinRequest = trpc.club.rejectJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.listMembers.invalidate({ clubId })])
    },
  })

  const kickMember = trpc.club.kickMember.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.listMembers.invalidate({ clubId }), utils.club.get.invalidate({ id: clubId })])
    },
  })

  const banUser = trpc.club.banUser.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.listMembers.invalidate({ clubId }), utils.club.get.invalidate({ id: clubId })])
    },
  })

  const unbanUser = trpc.club.unbanUser.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.listMembers.invalidate({ clubId })])
    },
  })

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const joinRequests = useMemo(() => {
    const all = (data?.joinRequests ?? []) as any[]
    if (!q) return all
    return all.filter((r) => {
      const name = String(r?.user?.name ?? '').toLowerCase()
      const email = String(r?.user?.emailMasked ?? '').toLowerCase()
      const id = String(r?.userId ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || id.includes(q)
    })
  }, [data?.joinRequests, q])

  const members = useMemo(() => {
    const all = (data?.members ?? []) as any[]
    if (!q) return all
    return all.filter((m) => {
      const name = String(m?.user?.name ?? '').toLowerCase()
      const email = String(m?.user?.emailMasked ?? '').toLowerCase()
      const id = String(m?.userId ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || id.includes(q)
    })
  }, [data?.members, q])

  const bans = useMemo(() => {
    const all = (data?.bans ?? []) as any[]
    if (!q) return all
    return all.filter((b) => {
      const name = String(b?.user?.name ?? '').toLowerCase()
      const email = String(b?.user?.emailMasked ?? '').toLowerCase()
      const id = String(b?.userId ?? '').toLowerCase()
      const reason = String(b?.reason ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || id.includes(q) || reason.includes(q)
    })
  }, [data?.bans, q])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          {canManage ? 'Members & bans (admins)' : 'Members'}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          {members.length} member{members.length === 1 ? '' : 's'}
          {canManage ? (
            <>
              <span className="mx-1">•</span>
              {joinRequests.length} request{joinRequests.length === 1 ? '' : 's'}
              <span className="mx-1">•</span>
              {bans.length} ban{bans.length === 1 ? '' : 's'}
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder={canManage ? 'Search requests / members / bans…' : 'Search members…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
        {error ? <div className="text-sm text-destructive">{error.message}</div> : null}

        {canManage ? (
          <div className="rounded-md border bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-gray-900">Join requests</div>
              <div className="text-xs text-muted-foreground">{joinRequests.length}</div>
            </div>

            {joinRequests.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pending requests.</div>
            ) : (
              <div className="divide-y rounded-md border">
                {joinRequests.slice(0, 200).map((r: any) => (
                  <div key={r.userId} className="p-2 flex items-center justify-between gap-2 bg-white">
                    <div className="min-w-0 flex items-center gap-2">
                      {r.user?.image ? (
                        <div className="relative w-7 h-7 rounded-full overflow-hidden border border-gray-200">
                          <Image src={r.user.image} alt="" fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.user?.name || 'User'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.user?.emailMasked ? `${r.user.emailMasked} • ` : ''}
                          {r.requestedAt ? `Requested ${formatUsDateTimeShort(r.requestedAt)}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={approveJoinRequest.isPending || rejectJoinRequest.isPending}
                        onClick={async () => {
                          if (!confirm('Approve this join request?')) return
                          try {
                            await approveJoinRequest.mutateAsync({ clubId, userId: r.userId })
                            toast({ title: 'Approved', description: 'User joined the club.' })
                          } catch (err: any) {
                            toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                          }
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={approveJoinRequest.isPending || rejectJoinRequest.isPending}
                        onClick={async () => {
                          if (!confirm('Reject this join request?')) return
                          try {
                            await rejectJoinRequest.mutateAsync({ clubId, userId: r.userId })
                            toast({ title: 'Rejected', description: 'Request rejected.' })
                          } catch (err: any) {
                            toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                          }
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {joinRequests.length > 200 ? (
              <div className="text-xs text-muted-foreground">Showing first 200 requests.</div>
            ) : null}
          </div>
        ) : null}

        <div className={`grid grid-cols-1 ${canManage ? 'md:grid-cols-2' : ''} gap-3`}>
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-900">Members</div>
            {members.length === 0 ? (
              <div className="text-sm text-muted-foreground">No members.</div>
            ) : (
              <div className="rounded-md border divide-y bg-white">
                {members.slice(0, 200).map((m: any) => {
                  const isSelf = Boolean(currentUserId && m.userId === currentUserId)
                  return (
                  <div key={m.userId} className="p-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      {m.user?.image ? (
                        <div className="relative w-7 h-7 rounded-full overflow-hidden border border-gray-200">
                          <Image src={m.user.image} alt="" fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900 truncate">{m.user?.name || 'User'}</div>
                          {isSelf ? <Badge variant="secondary">You</Badge> : null}
                          {m.role ? <Badge variant="outline">{m.role}</Badge> : null}
                        </div>
                        {m.user?.emailMasked ? (
                          <div className="text-xs text-muted-foreground truncate">{m.user.emailMasked}</div>
                        ) : null}
                      </div>
                    </div>
                    {canManage && !isSelf ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          disabled={kickMember.isPending || banUser.isPending}
                          onClick={async () => {
                            if (!confirm('Remove this member from the club?')) return
                            try {
                              await kickMember.mutateAsync({ clubId, userId: m.userId })
                              toast({ title: 'Removed', description: 'Member removed from the club.' })
                            } catch (err: any) {
                              toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                            }
                          }}
                        >
                          <UserMinus className="h-4 w-4" />
                          Kick
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          disabled={kickMember.isPending || banUser.isPending}
                          onClick={async () => {
                            const reason = prompt('Ban reason (optional):') || ''
                            if (!confirm('Ban this user? They will not be able to re-join.')) return
                            try {
                              await banUser.mutateAsync({ clubId, userId: m.userId, reason: reason || undefined })
                              toast({ title: 'Banned', description: 'User banned.' })
                            } catch (err: any) {
                              toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                            }
                          }}
                        >
                          <Ban className="h-4 w-4" />
                          Ban
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  )
                })}
              </div>
            )}
            {members.length > 200 ? (
              <div className="text-xs text-muted-foreground">Showing first 200 members.</div>
            ) : null}
          </div>

          {canManage ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">Bans</div>
              {bans.length === 0 ? (
                <div className="text-sm text-muted-foreground">No bans.</div>
              ) : (
                <div className="rounded-md border divide-y bg-white">
                  {bans.slice(0, 200).map((b: any) => (
                    <div key={b.userId} className="p-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{b.user?.name || 'User'}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.user?.emailMasked ? `${b.user.emailMasked} • ` : ''}
                          {b.bannedAt ? `Banned ${formatUsDateTimeShort(b.bannedAt)}` : ''}
                          {b.bannedBy?.name ? ` • by ${b.bannedBy.name}` : ''}
                        </div>
                        {b.reason ? <div className="mt-1 text-xs text-gray-700 truncate">Reason: {b.reason}</div> : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={unbanUser.isPending}
                        onClick={async () => {
                          if (!confirm('Unban this user?')) return
                          try {
                            await unbanUser.mutateAsync({ clubId, userId: b.userId })
                            toast({ title: 'Unbanned', description: 'User can join again.' })
                          } catch (err: any) {
                            toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                          }
                        }}
                      >
                        Unban
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {bans.length > 200 ? <div className="text-xs text-muted-foreground">Showing first 200 bans.</div> : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
