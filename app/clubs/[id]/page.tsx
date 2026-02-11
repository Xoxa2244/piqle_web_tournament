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
import { fromCents, toCents } from '@/lib/payment'
import { generateRecurringStartDates, parseYmdToUtc } from '@/lib/recurrence'
import { ENABLE_RECURRING_DRAFTS } from '@/lib/features'
import { cn } from '@/lib/utils'
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, MapPin, ArrowLeft, Users, Megaphone, Plus, MessageCircle, Send, Trash2, Share2, Copy, Mail, QrCode, Ban, UserMinus, X, Layers, Pencil } from 'lucide-react'
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
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation()
  const createAnnouncement = trpc.club.createAnnouncement.useMutation()
  const updateAnnouncement = trpc.club.updateAnnouncement.useMutation()
  const deleteAnnouncement = trpc.club.deleteAnnouncement.useMutation()

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
  })

  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [editingAnnouncementForm, setEditingAnnouncementForm] = useState({ title: '', body: '' })

  const [inviteOpen, setInviteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [cancelJoinOpen, setCancelJoinOpen] = useState(false)

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
    try {
      await toggleFollow.mutateAsync({ clubId })
      await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
    } catch (err: any) {
      toast({
        title: 'Failed',
        description: err?.message || 'Could not update membership. Try again.',
        variant: 'destructive',
      })
    }
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
      toast({ title: 'Left club', description: 'You left this club.' })
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
    <>
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
                    className="gap-2"
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
                  className="gap-2"
                  onClick={handleToggleFollow}
                  disabled={toggleFollow.isPending}
                  title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
                >
                  <Users className="h-4 w-4" />
                  Join
                </Button>
              )}

              {club.isAdmin ? (
                <Button asChild variant="outline" className="gap-2">
                  <Link href={`/clubs/${clubId}/edit`}>
                    <Pencil className="h-4 w-4" />
                    Edit club
                  </Link>
                </Button>
              ) : null}

              {club.isFollowing || club.isAdmin ? (
                <Button variant="outline" className="gap-2" onClick={() => setInviteOpen((v) => !v)}>
                  <Share2 className="h-4 w-4" />
                  Invite
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {inviteOpen && (club.isFollowing || club.isAdmin) ? (
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
                            {a.updatedAt && new Date(a.updatedAt).getTime() > new Date(a.createdAt).getTime()
                              ? ` • edited ${new Date(a.updatedAt).toLocaleString()}`
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

            {club.isAdmin ? <ClubTournamentTemplatesCard clubId={club.id} /> : null}

            {club.isAdmin || club.isFollowing ? (
              <ClubMembersAdminCard
                clubId={club.id}
                canModerate={club.isAdmin}
                currentUserId={session?.user?.id}
              />
            ) : null}

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

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canBook ? (
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" className="w-full gap-2">
                      <ExternalLink className="h-4 w-4" />
                      {bookingButtonLabel}
                    </Button>
                  </a>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Online booking is not configured for this club yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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

	      <div ref={detailsRef} className="rounded-md border p-3 space-y-3">
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
    },
  })

  const deleteMessage = trpc.clubChat.delete.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit: messageLimit })
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Club chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && canView ? (
          <div className="text-sm text-muted-foreground">Loading chat…</div>
        ) : null}
        {error && canView ? (
          <div className="text-sm text-destructive">{error.message}</div>
        ) : null}

        {canView ? (
          <div ref={listRef} className="max-h-[360px] overflow-y-auto rounded-md border bg-white">
            {!isLoading && (!messages || messages.length === 0) ? (
              <div className="p-3 text-sm text-muted-foreground">No messages yet. Start the conversation.</div>
            ) : (
              <div className="divide-y">
                {(messages ?? []).map((m: any) => {
                  const isMine = currentUserId && m.userId === currentUserId
                  const canDelete = Boolean(isAdmin || isMine)

                  return (
                    <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900 truncate">{m.user?.name || 'User'}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                          </div>
                          {isMine ? <Badge variant="secondary">You</Badge> : null}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-sm whitespace-pre-wrap break-words',
                            m.isDeleted ? 'text-muted-foreground italic' : 'text-gray-700'
                          )}
                        >
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
                <Button type="button" onClick={onJoinToggle} disabled={sendMessage.isPending}>
                  Request
                </Button>
              </div>
            )
          ) : (
            <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
              <div className="min-w-0">Join this club to view and post messages.</div>
              <Button type="button" onClick={onJoinToggle} disabled={sendMessage.isPending}>
                Join
              </Button>
            </div>
          )
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

function ClubTournamentTemplatesCard({ clubId }: { clubId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const utils = trpc.useUtils()

  const { data: templates, isLoading, error } = trpc.clubTemplate.list.useQuery({ clubId }, { enabled: !!clubId })

  const createDraft = trpc.clubTemplate.createDraftFromTemplate.useMutation()
  const deleteTemplate = trpc.clubTemplate.delete.useMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [draftForm, setDraftForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    entryFee: '',
    isRecurring: false,
    recurrenceFrequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
    recurrenceCount: 4,
    recurrenceWeekdays: [] as number[],
  })

  useEffect(() => {
    if (ENABLE_RECURRING_DRAFTS) return
    setDraftForm((prev) => (prev.isRecurring ? { ...prev, isRecurring: false } : prev))
  }, [])

  const openCreate = (t: { id: string; name: string }) => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const wd = parseYmdToUtc(today)?.getUTCDay() ?? 0
    setSelected({ id: t.id, name: t.name })
    setDraftForm({
      title: '',
      startDate: today,
      endDate: today,
      registrationStartDate: '',
      registrationEndDate: '',
      entryFee: '',
      isRecurring: false,
      recurrenceFrequency: 'WEEKLY',
      recurrenceCount: 4,
      recurrenceWeekdays: [wd],
    })
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    if (!selected) return
    if (!draftForm.startDate || !draftForm.endDate) {
      toast({ title: 'Missing dates', description: 'Start and end dates are required.', variant: 'destructive' })
      return
    }

    if (ENABLE_RECURRING_DRAFTS && draftForm.isRecurring) {
      const count = Number(draftForm.recurrenceCount)
      if (!Number.isFinite(count) || count < 1 || count > 12) {
        toast({ title: 'Invalid recurrence', description: 'Occurrences must be between 1 and 12.', variant: 'destructive' })
        return
      }

      if (
        (draftForm.recurrenceFrequency === 'WEEKLY' || draftForm.recurrenceFrequency === 'BIWEEKLY') &&
        (draftForm.recurrenceWeekdays?.length ?? 0) < 1
      ) {
        toast({ title: 'Invalid recurrence', description: 'Pick at least one weekday.', variant: 'destructive' })
        return
      }
    }

    const fee = Number(draftForm.entryFee)
    const entryFeeCents = Number.isFinite(fee) && fee > 0 ? toCents(fee) : undefined

    try {
      const recurrence =
        ENABLE_RECURRING_DRAFTS && draftForm.isRecurring && draftForm.recurrenceCount > 1
          ? {
              frequency: draftForm.recurrenceFrequency,
              count: draftForm.recurrenceCount,
              weekdays:
                draftForm.recurrenceFrequency === 'WEEKLY' || draftForm.recurrenceFrequency === 'BIWEEKLY'
                  ? draftForm.recurrenceWeekdays
                  : undefined,
            }
          : undefined

      const res = await createDraft.mutateAsync({
        templateId: selected.id,
        title: draftForm.title.trim() ? draftForm.title.trim() : undefined,
        startDate: draftForm.startDate,
        endDate: draftForm.endDate,
        registrationStartDate: draftForm.registrationStartDate || undefined,
        registrationEndDate: draftForm.registrationEndDate || undefined,
        entryFeeCents,
        recurrence,
      })

      await utils.clubTemplate.list.invalidate({ clubId })
      setCreateOpen(false)
      const ids = (res as any)?.tournamentIds ?? [res.tournamentId]
      if (Array.isArray(ids) && ids.length > 1) {
        router.push(`/admin?createdDraftIds=${encodeURIComponent(ids.join(','))}`)
      } else {
        router.push(`/admin/${res.tournamentId}`)
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message || 'Could not create draft.', variant: 'destructive' })
    }
  }

  const recurrencePreview = useMemo<
    { items: string[] } | { error: string } | null
  >(() => {
    if (!ENABLE_RECURRING_DRAFTS || !draftForm.isRecurring || draftForm.recurrenceCount <= 1) return null

    const start = parseYmdToUtc(draftForm.startDate)
    const end = parseYmdToUtc(draftForm.endDate)
    if (!start || !end) return null
    const durationMs = end.getTime() - start.getTime()
    if (durationMs < 0) return { error: 'End date must be on or after start date.' }

    const config = {
      frequency: draftForm.recurrenceFrequency,
      count: draftForm.recurrenceCount,
      weekdays:
        draftForm.recurrenceFrequency === 'WEEKLY' || draftForm.recurrenceFrequency === 'BIWEEKLY'
          ? draftForm.recurrenceWeekdays
          : undefined,
    } as const

    const generated = generateRecurringStartDates(start, config)
    if ('error' in generated) return { error: generated.error }

    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    const items = generated.startDates.map((s) => {
      const e = new Date(s.getTime() + durationMs)
      return durationMs === 0 ? fmt.format(s) : `${fmt.format(s)} – ${fmt.format(e)}`
    })

    return { items }
  }, [
    draftForm.isRecurring,
    draftForm.recurrenceCount,
    draftForm.recurrenceFrequency,
    draftForm.recurrenceWeekdays,
    draftForm.startDate,
    draftForm.endDate,
  ])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Tournament templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Templates are visible to all club admins. Creating from a template makes a <span className="font-medium">draft</span> (not public) until you enable Public board.
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading templates…</div>
        ) : error ? (
          <div className="text-sm text-red-700">
            {error.message || 'Failed to load templates.'}
          </div>
        ) : (templates?.length ?? 0) === 0 ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-muted-foreground">
            No templates yet. Open any club tournament and click <span className="font-medium">Save as template</span>.
          </div>
        ) : (
          <div className="space-y-2">
            {(templates ?? []).map((t: any) => (
              <div key={t.id} className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.format ? `${t.format.replace(/_/g, ' ')} • ` : ''}
                    {typeof t.divisionsCount === 'number' ? `${t.divisionsCount} division${t.divisionsCount === 1 ? '' : 's'} • ` : ''}
                    Updated {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''}
                  </div>
                  {t.description ? <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{t.description}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={() => openCreate(t)} disabled={createDraft.isPending}>
                    Create draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-700 border-red-200 hover:bg-red-50"
                    disabled={deleteTemplate.isPending}
                    onClick={async () => {
                      if (!confirm('Delete this template?')) return
                      try {
                        await deleteTemplate.mutateAsync({ templateId: t.id })
                        await utils.clubTemplate.list.invalidate({ clubId })
                        toast({ title: 'Deleted', description: 'Template removed.' })
                      } catch (err: any) {
                        toast({ title: 'Failed', description: err?.message || 'Try again', variant: 'destructive' })
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {createOpen && selected ? (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4"
            onClick={() => setCreateOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900 truncate">Create draft</div>
                  <div className="text-xs text-muted-foreground truncate">From template: {selected.name}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setCreateOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Title (optional)</div>
                  <Input
                    value={draftForm.title}
                    onChange={(e) => setDraftForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Leave empty to use the template's default title"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Start date *</div>
                    <Input
                      type="date"
                      value={draftForm.startDate}
                      onChange={(e) => setDraftForm((p) => ({ ...p, startDate: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">End date *</div>
                    <Input
                      type="date"
                      value={draftForm.endDate}
                      onChange={(e) => setDraftForm((p) => ({ ...p, endDate: e.target.value }))}
                      min={draftForm.startDate || undefined}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Registration start (optional)</div>
                    <Input
                      type="date"
                      value={draftForm.registrationStartDate}
                      onChange={(e) => setDraftForm((p) => ({ ...p, registrationStartDate: e.target.value }))}
                      max={draftForm.startDate || undefined}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Registration end (optional)</div>
                    <Input
                      type="date"
                      value={draftForm.registrationEndDate}
                      onChange={(e) => setDraftForm((p) => ({ ...p, registrationEndDate: e.target.value }))}
                      min={draftForm.registrationStartDate || undefined}
                      max={draftForm.startDate || undefined}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Entry fee (optional, USD)</div>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={draftForm.entryFee}
                    onChange={(e) => setDraftForm((p) => ({ ...p, entryFee: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div
                  className={
                    ENABLE_RECURRING_DRAFTS
                      ? 'rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3'
                      : 'hidden'
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-900">Recurring drafts (optional)</div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={draftForm.isRecurring}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setDraftForm((p) => {
                            const next = { ...p, isRecurring: checked }
                            if (checked && (p.recurrenceWeekdays?.length ?? 0) < 1) {
                              const wd = parseYmdToUtc(p.startDate)?.getUTCDay() ?? 0
                              next.recurrenceWeekdays = [wd]
                            }
                            return next
                          })
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Create series
                    </label>
                  </div>

                  {draftForm.isRecurring ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">Frequency</div>
                        <select
                          value={draftForm.recurrenceFrequency}
                          onChange={(e) => {
                            const value = e.target.value as any
                            setDraftForm((p) => {
                              const next = { ...p, recurrenceFrequency: value }
                              const isWeeklyLike = value === 'WEEKLY' || value === 'BIWEEKLY'
                              if (isWeeklyLike && (p.recurrenceWeekdays?.length ?? 0) < 1) {
                                const wd = parseYmdToUtc(p.startDate)?.getUTCDay() ?? 0
                                next.recurrenceWeekdays = [wd]
                              }
                              return next
                            })
                          }}
                          className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                        >
                          <option value="DAILY">Daily</option>
                          <option value="WEEKLY">Weekly</option>
                          <option value="BIWEEKLY">Every 2 weeks</option>
                          <option value="MONTHLY">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">Occurrences</div>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={draftForm.recurrenceCount}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            const safe = Number.isFinite(n) ? Math.max(1, Math.min(12, Math.trunc(n))) : 1
                            setDraftForm((p) => ({ ...p, recurrenceCount: safe }))
                          }}
                        />
                        <div className="mt-1 text-xs text-muted-foreground">Max 12. Includes the first draft.</div>
                      </div>

                      {(draftForm.recurrenceFrequency === 'WEEKLY' ||
                        draftForm.recurrenceFrequency === 'BIWEEKLY') ? (
                        <div className="sm:col-span-2">
                          <div className="text-sm font-medium text-gray-700 mb-2">Weekdays</div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { v: 0, l: 'Sun' },
                              { v: 1, l: 'Mon' },
                              { v: 2, l: 'Tue' },
                              { v: 3, l: 'Wed' },
                              { v: 4, l: 'Thu' },
                              { v: 5, l: 'Fri' },
                              { v: 6, l: 'Sat' },
                            ].map((d) => {
                              const selected = (draftForm.recurrenceWeekdays ?? []).includes(d.v)
                              return (
                                <button
                                  key={d.v}
                                  type="button"
                                  onClick={() => {
                                    setDraftForm((p) => {
                                      const current = p.recurrenceWeekdays ?? []
                                      const has = current.includes(d.v)
                                      const nextDays = has ? current.filter((x) => x !== d.v) : [...current, d.v]
                                      if (nextDays.length < 1) return p
                                      return { ...p, recurrenceWeekdays: nextDays.sort((a, b) => a - b) }
                                    })
                                  }}
                                  className={`px-3 py-2 rounded-lg border text-sm ${
                                    selected
                                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {d.l}
                                </button>
                              )
                            })}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">Example: select Tue + Fri.</div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Create one draft now. You can always create more later from the same template.
                    </div>
                  )}

                  {draftForm.isRecurring ? (
                    <div className="text-xs text-gray-600">
                      This will create <span className="font-medium">{draftForm.recurrenceCount}</span> draft tournaments (not public).
                    </div>
                  ) : null}

                  {ENABLE_RECURRING_DRAFTS &&
                  draftForm.isRecurring &&
                  draftForm.recurrenceCount > 1 ? (
                    <div className="rounded-md border border-gray-200 bg-white p-3">
                      <div className="text-xs font-medium text-gray-900 mb-2">Preview dates</div>
                      {recurrencePreview && 'error' in recurrencePreview ? (
                        <div className="text-xs text-red-700">{recurrencePreview.error}</div>
                      ) : recurrencePreview && 'items' in recurrencePreview && recurrencePreview.items.length ? (
                        <ul className="max-h-40 overflow-y-auto text-xs text-gray-700 space-y-1">
                          {recurrencePreview.items.map((label, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="w-5 text-gray-400">{idx + 1}.</span>
                              <span className="flex-1">{label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-muted-foreground">Pick dates to see a preview.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={submitCreate} disabled={createDraft.isPending}>
                  {createDraft.isPending
                    ? 'Creating…'
                    : ENABLE_RECURRING_DRAFTS &&
                        draftForm.isRecurring &&
                        draftForm.recurrenceCount > 1
                      ? `Create ${draftForm.recurrenceCount} drafts`
                      : 'Create draft'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
                          {r.requestedAt ? `Requested ${new Date(r.requestedAt).toLocaleString()}` : ''}
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
                          {b.bannedAt ? `Banned ${new Date(b.bannedAt).toLocaleString()}` : ''}
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
