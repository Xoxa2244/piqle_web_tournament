'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { MessageCircle, Send, CalendarDays, Building2, ChevronRight } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { formatUsDateTimeShort, formatUsDateShort, getTimezoneLabel } from '@/lib/dateFormat'
import { normalizeLocationText } from '@/lib/locationText'
import type { ChatMessage } from '@/lib/chatMessages'
import { groupMessagesByDate } from '@/lib/chatMessages'
import { ChatMessageRows } from '@/components/chat/ChatMessageRows'
import { chatScrollAreaStyle } from '@/components/chat/chatBackground'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import ConfirmModal from '@/components/ConfirmModal'

export const dynamic = 'force-dynamic'

type ChatPermission = {
  canView: boolean
  canPost: boolean
  canModerate: boolean
  isOwner: boolean
  isTournamentAdmin: boolean
  isClubAdmin: boolean
  isParticipant: boolean
  reason?: string
}

type ClubChatListItem = {
  id: string
  name: string
  kind: 'VENUE' | 'COMMUNITY'
  joinPolicy: 'OPEN' | 'APPROVAL'
  logoUrl: string | null
  city: string | null
  state: string | null
  isVerified: boolean
  isFollowing: boolean
  isAdmin: boolean
  unreadCount: number
}

function ClubAvatar({ club }: { club: ClubChatListItem }) {
  if (club.logoUrl) {
    return (
      <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <Image src={club.logoUrl} alt="" fill className="object-cover" />
      </div>
    )
  }

  const initials = club.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600">
      {initials || 'CL'}
    </div>
  )
}

export default function ChatsPage() {
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const { data: clubs, isLoading: clubsLoading } = trpc.club.listMyChatClubs.useQuery(undefined, {
    enabled: isLoggedIn,
  })
  const { data: events, isLoading: eventsLoading } = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: isLoggedIn,
  })

  const [topTab, setTopTab] = useState<'clubs' | 'events'>('clubs')
  const [activeClubId, setActiveClubId] = useState<string | null>(null)
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [expandedArchiveEventIds, setExpandedArchiveEventIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!clubs || clubs.length === 0) {
      setActiveClubId(null)
      return
    }
    if (!activeClubId || !clubs.some((club) => club.id === activeClubId)) {
      setActiveClubId(clubs[0]!.id)
    }
  }, [clubs, activeClubId])

  useEffect(() => {
    if (!events || events.length === 0) {
      setActiveEventId(null)
      setActiveDivisionId(null)
      return
    }

    const activeEvents = events.filter((event) => {
      const endMs = new Date(event.endDate).getTime()
      return Number.isFinite(endMs) && endMs >= Date.now()
    })
    const archivedEvents = events
      .filter((event) => {
        const endMs = new Date(event.endDate).getTime()
        return Number.isFinite(endMs) && endMs < Date.now()
      })
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
    const preferredFirstEvent = activeEvents[0] ?? archivedEvents[0] ?? events[0]

    if (!activeEventId || !events.some((event) => event.id === activeEventId)) {
      setActiveEventId(preferredFirstEvent!.id)
      setActiveDivisionId(null)
      return
    }

    if (activeDivisionId) {
      const event = events.find((item) => item.id === activeEventId)
      const divisionExists = Boolean(event?.divisions.some((division) => division.id === activeDivisionId))
      if (!divisionExists) {
        setActiveDivisionId(null)
      }
    }
  }, [events, activeEventId, activeDivisionId])

  const selectedClub = useMemo(
    () => (clubs ?? []).find((club) => club.id === activeClubId) ?? null,
    [clubs, activeClubId]
  )

  const activeEventChats = useMemo(
    () =>
      (events ?? []).filter((event) => {
        const endMs = new Date(event.endDate).getTime()
        return Number.isFinite(endMs) && endMs >= Date.now()
      }),
    [events]
  )
  const archivedEventChats = useMemo(
    () =>
      (events ?? [])
        .filter((event) => {
          const endMs = new Date(event.endDate).getTime()
          return Number.isFinite(endMs) && endMs < Date.now()
        })
        .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()),
    [events]
  )

  const selectedEvent = useMemo(
    () => (events ?? []).find((event) => event.id === activeEventId) ?? null,
    [events, activeEventId]
  )

  const selectedDivision = useMemo(
    () => selectedEvent?.divisions.find((division) => division.id === activeDivisionId) ?? null,
    [selectedEvent, activeDivisionId]
  )
  const isArchivedEventSelected = useMemo(
    () => archivedEventChats.some((event) => event.id === activeEventId),
    [archivedEventChats, activeEventId]
  )

  useEffect(() => {
    if (isArchivedEventSelected) {
      setArchiveOpen(true)
      if (activeEventId) setExpandedArchiveEventIds((prev) => new Set(prev).add(activeEventId))
    }
  }, [isArchivedEventSelected, activeEventId])

  const toggleArchiveEventExpanded = (eventId: string) => {
    setExpandedArchiveEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  const renderEventListItem = (event: any) => {
    const eventActive = event.id === activeEventId && !activeDivisionId
    const hasDivisions = event.divisions.length > 0

    return (
      <div key={event.id} className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={() => {
            setActiveEventId(event.id)
            setActiveDivisionId(null)
          }}
          className={cn(
            'w-full rounded-md p-2 text-left transition-colors',
            eventActive ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'
          )}
        >
          <div className="truncate text-sm font-medium">{event.title}</div>
          {event.unreadCount > 0 ? (
            <div className="mt-1">
              <Badge className="bg-red-600 hover:bg-red-600">
                {event.unreadCount > 99 ? '99+' : event.unreadCount} unread
              </Badge>
            </div>
          ) : null}
          <div className="mt-1 text-xs text-muted-foreground">
            {formatUsDateTimeShort(event.startDate, { timeZone: event.timezone })} ·{' '}
            {getTimezoneLabel(event.timezone)}
          </div>
          {event.club?.name ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{event.club.name}</span>
            </div>
          ) : null}
        </button>

        {hasDivisions ? (
          <div className="ml-2 mt-1 space-y-1 border-l border-gray-200 pl-2">
            {event.divisions.map((division: any) => {
              const divisionActive = event.id === activeEventId && division.id === activeDivisionId
              return (
                <button
                  key={division.id}
                  type="button"
                  onClick={() => {
                    setActiveEventId(event.id)
                    setActiveDivisionId(division.id)
                  }}
                  className={cn(
                    'w-full rounded-md px-2 py-1 text-left text-xs transition-colors',
                    divisionActive ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{division.name}</span>
                    {division.unreadCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {division.unreadCount > 99 ? '99+' : division.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  const renderArchivedEventItem = (event: any) => {
    const eventActive = event.id === activeEventId && !activeDivisionId
    const hasDivisions = event.divisions.length > 0
    const isExpanded = expandedArchiveEventIds.has(event.id)

    return (
      <div key={event.id} className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={() => {
            setActiveEventId(event.id)
            setActiveDivisionId(null)
            if (hasDivisions) toggleArchiveEventExpanded(event.id)
          }}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md p-2 text-left transition-colors',
            eventActive ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{event.title}</div>
            {event.unreadCount > 0 ? (
              <div className="mt-1">
                <Badge className="bg-red-600 hover:bg-red-600">
                  {event.unreadCount > 99 ? '99+' : event.unreadCount} unread
                </Badge>
              </div>
            ) : null}
            <div className="mt-1 text-xs text-muted-foreground">
              {formatUsDateTimeShort(event.startDate, { timeZone: event.timezone })} ·{' '}
              {getTimezoneLabel(event.timezone)}
            </div>
            {event.club?.name ? (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.club.name}</span>
              </div>
            ) : null}
          </div>
          {hasDivisions ? (
            <ChevronRight
              className={cn('h-4 w-4 shrink-0 transition-transform text-muted-foreground', isExpanded ? 'rotate-90' : 'rotate-0')}
              aria-hidden
            />
          ) : null}
        </button>

        {hasDivisions && isExpanded ? (
          <div className="ml-2 mt-1 space-y-1 border-l border-gray-200 pl-2">
            {event.divisions.map((division: any) => {
              const divisionActive = event.id === activeEventId && division.id === activeDivisionId
              return (
                <button
                  key={division.id}
                  type="button"
                  onClick={() => {
                    setActiveEventId(event.id)
                    setActiveDivisionId(division.id)
                  }}
                  className={cn(
                    'w-full rounded-md px-2 py-1 text-left text-xs transition-colors',
                    divisionActive ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{division.name}</span>
                    {division.unreadCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {division.unreadCount > 99 ? '99+' : division.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-sm text-muted-foreground">Loading chats…</div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Chats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Sign in to access club chats and event chats.
            </div>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent('/chats')}`}>
              <Button>Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      className="mx-auto flex max-w-7xl flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <div className="shrink-0 space-y-1">
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="text-sm text-muted-foreground">
          One place for club chats and event chats.
        </p>
      </div>

      <Tabs value={topTab} onValueChange={(value) => setTopTab(value as 'clubs' | 'events')} className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full shrink-0 grid-cols-2 md:w-[420px]">
          <TabsTrigger value="clubs">
            Club chats {(clubs?.length ?? 0) > 0 ? `(${clubs?.length ?? 0})` : ''}
          </TabsTrigger>
          <TabsTrigger value="events">
            Event chats {(events?.length ?? 0) > 0 ? `(${events?.length ?? 0})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clubs" className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-3">
            <Card className="flex min-h-0 flex-col overflow-hidden lg:col-span-1">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Your club chats</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 overflow-y-auto space-y-2">
                {clubsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading clubs…</div>
                ) : !clubs || clubs.length === 0 ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      You are not in any clubs yet.
                    </div>
                    <Link href="/clubs">
                      <Button variant="outline">Browse clubs</Button>
                    </Link>
                  </div>
                ) : (
                  clubs.map((club) => {
                    const active = club.id === activeClubId
                    return (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => setActiveClubId(club.id)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition-colors',
                          active
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <ClubAvatar club={club as ClubChatListItem} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-gray-900">{club.name}</div>
                              {club.unreadCount > 0 ? (
                                <Badge className="bg-red-600 hover:bg-red-600">
                                  {club.unreadCount > 99 ? '99+' : club.unreadCount}
                                </Badge>
                              ) : null}
                            </div>
                              <div className="text-xs text-muted-foreground">
                              {club.cityEn || club.city || club.stateEn || club.state
                                ? `${normalizeLocationText(club.cityEn ?? club.city)}${(club.cityEn ?? club.city) && (club.stateEn ?? club.state) ? ', ' : ''}${normalizeLocationText(club.stateEn ?? club.state)}`
                                : 'No location'}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              {club.isAdmin ? <Badge variant="outline">Admin</Badge> : null}
                              {club.isVerified ? <Badge>Verified</Badge> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-2">
              {selectedClub ? (
                <ClubChatPanel
                  clubId={selectedClub.id}
                  clubName={selectedClub.name}
                  isAdmin={selectedClub.isAdmin}
                  currentUserId={session?.user?.id}
                />
              ) : (
                <Card>
                  <CardContent className="py-10 text-sm text-muted-foreground">
                    Select a club to open chat.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="events" className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-3">
            <Card className="flex min-h-0 flex-col overflow-hidden lg:col-span-1">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Event chats</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 overflow-y-auto space-y-2">
                {eventsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading events…</div>
                ) : !events || events.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    You do not have access to event chats yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Active
                      </div>
                      {activeEventChats.length > 0 ? (
                        activeEventChats.map((event) => renderEventListItem(event))
                      ) : (
                        <div className="rounded-md border border-dashed border-gray-200 p-2 text-xs text-muted-foreground">
                          No active events.
                        </div>
                      )}
                    </div>

                    {archivedEventChats.length > 0 ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setArchiveOpen((prev) => !prev)}
                          className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-gray-50"
                          aria-expanded={archiveOpen}
                        >
                          <span>Archive ({archivedEventChats.length})</span>
                          <ChevronRight
                            className={cn('h-4 w-4 transition-transform', archiveOpen ? 'rotate-90' : 'rotate-0')}
                          />
                        </button>
                        {archiveOpen ? archivedEventChats.map((event) => renderArchivedEventItem(event)) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-2">
              {!selectedEvent ? (
                <Card>
                  <CardContent className="py-10 text-sm text-muted-foreground">
                    Select an event to open chat.
                  </CardContent>
                </Card>
              ) : selectedDivision ? (
                <DivisionChatPanel
                  divisionId={selectedDivision.id}
                  divisionName={selectedDivision.name}
                  eventName={selectedEvent.title}
                  currentUserId={session?.user?.id}
                  permission={selectedDivision.permission}
                />
              ) : (
                <TournamentChatPanel
                  tournamentId={selectedEvent.id}
                  tournamentName={selectedEvent.title}
                  currentUserId={session?.user?.id}
                  permission={selectedEvent.permission}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ClubChatPanel({
  clubId,
  clubName,
  isAdmin,
  currentUserId,
}: {
  clubId: string
  clubName: string
  isAdmin: boolean
  currentUserId?: string
}) {
  const limit = 100
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const { data: messages, isLoading, error } = trpc.clubChat.list.useQuery({ clubId, limit })
  const sendMessage = trpc.clubChat.send.useMutation({
    onSuccess: async (res) => {
      setDraft('')
      if (res?.wasFiltered) toast({ description: 'Some words were filtered.', variant: 'success' })
      await utils.clubChat.list.invalidate({ clubId, limit })
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, 30)
    },
  })
  const deleteMessage = trpc.clubChat.delete.useMutation({
    onSuccess: async () => {
      await utils.clubChat.list.invalidate({ clubId, limit })
    },
  })
  const markRead = trpc.clubChat.markRead.useMutation({
    onSuccess: async () => {
      await utils.club.listMyChatClubs.invalidate()
    },
  })

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages?.length])

  useEffect(() => {
    if (!clubId) return
    markRead.mutate({ clubId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, messages?.length])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ clubId, text })
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send message', variant: 'destructive' })
    }
  }

  return (
    <>
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          {clubName} · Club chat
        </CardTitle>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          Club members and admins can participate here.
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 space-y-3">
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-lg"
          style={chatScrollAreaStyle()}
        >
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading chat…</div>
          ) : error ? (
            <div className="p-3 text-sm text-red-700">{error.message}</div>
          ) : !messages || messages.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</div>
          ) : (
            <ChatMessageRows
              groups={groupMessagesByDate(messages as ChatMessage[])}
              currentUserId={currentUserId}
              canDelete={(m) => Boolean((currentUserId && m.userId === currentUserId) || isAdmin) && !m.isDeleted}
              onRequestDelete={(id) => setMessageToDelete(id)}
            />
          )}
        </div>

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
          <Button type="button" size="icon" className="shrink-0" disabled={!draft.trim() || sendMessage.isPending} onClick={handleSend} title="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
    <ConfirmModal
      open={!!messageToDelete}
      onClose={() => setMessageToDelete(null)}
      onConfirm={async () => {
        if (!messageToDelete) return
        await deleteMessage.mutateAsync({ messageId: messageToDelete })
        setMessageToDelete(null)
      }}
      isPending={deleteMessage.isPending}
      destructive
      title="Delete this message?"
      description="This message will be permanently removed."
      confirmText={deleteMessage.isPending ? 'Deleting…' : 'Delete'}
    />
    </>
  )
}

function TournamentChatPanel({
  tournamentId,
  tournamentName,
  currentUserId,
  permission,
}: {
  tournamentId: string
  tournamentName: string
  currentUserId?: string
  permission?: ChatPermission
}) {
  const limit = 100
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const canView = Boolean(permission?.canView)
  const canPost = Boolean(permission?.canPost)
  const canModerate = Boolean(permission?.canModerate)

  const { data: messages, isLoading, error } = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit },
    { enabled: canView }
  )
  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onSuccess: async (res) => {
      setDraft('')
      if (res?.wasFiltered) toast({ description: 'Some words were filtered.', variant: 'success' })
      await utils.tournamentChat.listTournament.invalidate({ tournamentId, limit })
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, 30)
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteTournament.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listTournament.invalidate({ tournamentId, limit })
    },
  })
  const markRead = trpc.tournamentChat.markTournamentRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages?.length])

  useEffect(() => {
    if (!canView) return
    markRead.mutate({ tournamentId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, canView, messages?.length])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !canPost || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ tournamentId, text })
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send message', variant: 'destructive' })
    }
  }

  return (
    <>
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          {tournamentName} · Event chat
        </CardTitle>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          Organizer, admins, and tournament participants.
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 space-y-3">
        {!permission ? (
          <div className="text-sm text-muted-foreground">Checking chat access…</div>
        ) : !canView ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
            {permission.reason || 'You do not have access to this chat.'}
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-lg"
              style={chatScrollAreaStyle()}
            >
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Loading chat…</div>
              ) : error ? (
                <div className="p-3 text-sm text-red-700">{error.message}</div>
              ) : !messages || messages.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No messages yet.</div>
              ) : (
                <ChatMessageRows
                  groups={groupMessagesByDate(messages as ChatMessage[])}
                  currentUserId={currentUserId}
                  canDelete={(m) => Boolean((currentUserId && m.userId === currentUserId) || canModerate)}
                  onRequestDelete={(id) => setMessageToDelete(id)}
                />
              )}
            </div>

            {canPost ? (
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
                <Button type="button" size="icon" className="shrink-0" disabled={!draft.trim() || sendMessage.isPending} onClick={handleSend} title="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
                You can view this chat but cannot post.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <ConfirmModal
      open={!!messageToDelete}
      onClose={() => setMessageToDelete(null)}
      onConfirm={async () => {
        if (!messageToDelete) return
        await deleteMessage.mutateAsync({ messageId: messageToDelete })
        setMessageToDelete(null)
      }}
      isPending={deleteMessage.isPending}
      destructive
      title="Delete this message?"
      description="This message will be permanently removed."
      confirmText={deleteMessage.isPending ? 'Deleting…' : 'Delete'}
    />
    </>
  )
}

function DivisionChatPanel({
  divisionId,
  divisionName,
  eventName,
  currentUserId,
  permission,
}: {
  divisionId: string
  divisionName: string
  eventName: string
  currentUserId?: string
  permission?: ChatPermission
}) {
  const limit = 100
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const canView = Boolean(permission?.canView)
  const canPost = Boolean(permission?.canPost)
  const canModerate = Boolean(permission?.canModerate)

  const { data: messages, isLoading, error } = trpc.tournamentChat.listDivision.useQuery(
    { divisionId, limit },
    { enabled: canView }
  )
  const sendMessage = trpc.tournamentChat.sendDivision.useMutation({
    onSuccess: async (res) => {
      setDraft('')
      if (res?.wasFiltered) toast({ description: 'Some words were filtered.', variant: 'success' })
      await utils.tournamentChat.listDivision.invalidate({ divisionId, limit })
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, 30)
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteDivision.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listDivision.invalidate({ divisionId, limit })
    },
  })
  const markRead = trpc.tournamentChat.markDivisionRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages?.length])

  useEffect(() => {
    if (!canView) return
    markRead.mutate({ divisionId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, canView, messages?.length])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !canPost || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ divisionId, text })
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send message', variant: 'destructive' })
    }
  }

  return (
    <>
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          {eventName} · {divisionName} chat
        </CardTitle>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          Organizer/admins and participants of this division only.
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 space-y-3">
        {!permission ? (
          <div className="text-sm text-muted-foreground">Checking chat access…</div>
        ) : !canView ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
            {permission.reason || 'You do not have access to this chat.'}
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-lg"
              style={chatScrollAreaStyle()}
            >
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Loading chat…</div>
              ) : error ? (
                <div className="p-3 text-sm text-red-700">{error.message}</div>
              ) : !messages || messages.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No messages yet.</div>
              ) : (
                <ChatMessageRows
                  groups={groupMessagesByDate(messages as ChatMessage[])}
                  currentUserId={currentUserId}
                  canDelete={(m) => Boolean((currentUserId && m.userId === currentUserId) || canModerate)}
                  onRequestDelete={(id) => setMessageToDelete(id)}
                />
              )}
            </div>

            {canPost ? (
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
                <Button type="button" size="icon" className="shrink-0" disabled={!draft.trim() || sendMessage.isPending} onClick={handleSend} title="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
                You can view this chat but cannot post.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <ConfirmModal
      open={!!messageToDelete}
      onClose={() => setMessageToDelete(null)}
      onConfirm={async () => {
        if (!messageToDelete) return
        await deleteMessage.mutateAsync({ messageId: messageToDelete })
        setMessageToDelete(null)
      }}
      isPending={deleteMessage.isPending}
      destructive
      title="Delete this message?"
      description="This message will be permanently removed."
      confirmText={deleteMessage.isPending ? 'Deleting…' : 'Delete'}
    />
    </>
  )
}
