'use client'

import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatUsDateTimeShort, getTimezoneLabel } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { fromCents } from '@/lib/payment'
import { MessageCircle, Send, Trash2, ShieldCheck } from 'lucide-react'

type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

const getSlotCount = (teamKind: TeamKind) => {
  switch (teamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'DOUBLES_2v2':
      return 2
    case 'SQUAD_4v4':
      return 4
    default:
      return 2
  }
}

const isRegistrationOpen = (tournament: {
  registrationStartDate?: Date | string | null
  registrationEndDate?: Date | string | null
  startDate?: Date | string
}) => {
  if (!tournament.startDate) return false
  const start = tournament.registrationStartDate
    ? new Date(tournament.registrationStartDate)
    : new Date(tournament.startDate)
  const end = tournament.registrationEndDate
    ? new Date(tournament.registrationEndDate)
    : new Date(tournament.startDate)
  const now = new Date()
  return now >= start && now <= end
}

export default function TournamentRegistrationPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string
  const { data: session, status: authStatus } = useSession()

  const { data: seatMap, isLoading, error } = trpc.registration.getSeatMap.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )
  const { data: myStatus } = trpc.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: !!tournamentId }
  )

  const claimSlotMutation = trpc.registration.claimSlot.useMutation()
  const cancelRegistrationMutation = trpc.registration.cancelRegistration.useMutation()
  const joinWaitlistMutation = trpc.registration.joinWaitlist.useMutation()
  const leaveWaitlistMutation = trpc.registration.leaveWaitlist.useMutation()
  const acceptInvitationMutation = trpc.tournamentInvitation.accept.useMutation()
  const divisionIds = useMemo(
    () => ((seatMap?.divisions ?? []) as any[]).map((d) => String(d.id)),
    [seatMap?.divisions]
  )
  const { data: chatPermissions } = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId, divisionIds },
    { enabled: !!tournamentId && authStatus === 'authenticated' }
  )
  const [inviteAcceptHandled, setInviteAcceptHandled] = useState(false)
  const utils = trpc.useUtils()

  useEffect(() => {
    if (authStatus === 'unauthenticated' && tournamentId) {
      const queryString = typeof window !== 'undefined' ? window.location.search : ''
      const callbackUrl = `/tournaments/${tournamentId}/register${queryString}`
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }
  }, [authStatus, router, tournamentId])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !tournamentId || inviteAcceptHandled) return
    const params = new URLSearchParams(window.location.search)
    const inviteAction = params.get('inviteAction')
    const invitationId = params.get('invitationId')
    if (inviteAction !== 'accept' || !invitationId) return

    setInviteAcceptHandled(true)
    const processInviteAccept = async () => {
      try {
        await acceptInvitationMutation.mutateAsync({ invitationId })
      } catch (error: any) {
        alert(error.message || 'Failed to process invitation')
      } finally {
        router.replace(`/tournaments/${tournamentId}/register`)
      }
    }

    processInviteAccept()
  }, [authStatus, tournamentId, inviteAcceptHandled, acceptInvitationMutation, router])

  const registrationOpen = seatMap ? isRegistrationOpen(seatMap) : false
  const divisions = (seatMap?.divisions ?? []) as any[]
  const divisionChatPermissionById = useMemo(() => {
    const map: Record<string, any> = {}
    for (const item of chatPermissions?.divisions ?? []) {
      map[item.divisionId] = item
    }
    return map
  }, [chatPermissions?.divisions])
  const entryFeeCents = seatMap?.entryFeeCents ?? 0
  const isPaidTournament = entryFeeCents > 0
  const payoutsActive = Boolean(seatMap?.payoutsActive)
  const isLadderFormat =
    (seatMap as any)?.format === 'ONE_DAY_LADDER' || (seatMap as any)?.format === 'LADDER_LEAGUE'

  const handleClaimSlot = async (teamId: string, slotIndex: number) => {
    try {
      await claimSlotMutation.mutateAsync({ teamId, slotIndex })
      await Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getSeatMap.invalidate({ tournamentId }),
      ])
      alert('You are registered!')
    } catch (error: any) {
      alert(error.message || 'Failed to claim slot')
    }
  }

  const handlePayJoin = async (teamId: string, slotIndex: number) => {
    try {
      const spotId = `${teamId}:${slotIndex}`
      const response = await fetch(
        `/api/tournaments/${tournamentId}/spots/${spotId}/create-checkout-session`,
        { method: 'POST' }
      )
      const raw = await response.text()
      const payload = raw ? JSON.parse(raw) : null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start payment')
      }
      if (payload?.url) {
        window.location.href = payload.url
        return
      }
      throw new Error('Checkout session URL missing')
    } catch (error: any) {
      alert(error.message || 'Failed to start payment')
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel registration?')) return
    try {
      await cancelRegistrationMutation.mutateAsync({ tournamentId })
      await Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getSeatMap.invalidate({ tournamentId }),
      ])
    } catch (error: any) {
      alert(error.message || 'Failed to cancel registration')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading registration...</div>
      </div>
    )
  }

  if (error || !seatMap) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">
          {error?.message || 'Registration data is unavailable. Please try again later.'}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{seatMap.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <div>
              {isPaidTournament ? (
                <span>
                  Entry fee:{' '}
                  <span className="font-medium text-gray-900">
                    ${fromCents(entryFeeCents).toFixed(2)}
                  </span>
                </span>
              ) : (
                <span className="font-medium text-gray-900">Free tournament</span>
              )}
            </div>
            <div>
              Tournament starts:{' '}
              <span className="font-medium text-gray-900">
                {formatUsDateTimeShort(seatMap.startDate, { timeZone: seatMap.timezone })}
              </span>
            </div>
            <div>
              Registration window:{' '}
              <span className="font-medium text-gray-900">
                {seatMap.registrationStartDate
                  ? formatUsDateTimeShort(seatMap.registrationStartDate, { timeZone: seatMap.timezone })
                  : formatUsDateTimeShort(seatMap.startDate, { timeZone: seatMap.timezone })}
                {' — '}
                {seatMap.registrationEndDate
                  ? formatUsDateTimeShort(seatMap.registrationEndDate, { timeZone: seatMap.timezone })
                  : formatUsDateTimeShort(seatMap.startDate, { timeZone: seatMap.timezone })}
              </span>
            </div>
            <Badge variant="outline">Time zone: {getTimezoneLabel(seatMap.timezone)}</Badge>
            <Badge variant={registrationOpen ? 'default' : 'secondary'}>
              {registrationOpen ? 'Registration Open' : 'Registration Closed'}
            </Badge>
            {isPaidTournament && !payoutsActive && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 text-yellow-800">
                Payments are not enabled yet; contact the organizer if checkout fails.
              </div>
            )}
            {myStatus?.status === 'active' && (
              <div className="pt-2 space-y-2">
                <p className="text-sm font-medium text-green-700">
                  You are already registered in this tournament.
                  {myStatus.divisionName && myStatus.teamName && (
                    <span className="block font-normal text-gray-600 mt-1">
                      {myStatus.divisionName} · {myStatus.teamName}
                    </span>
                  )}
                </p>
                <Button onClick={handleCancel} variant="destructive" disabled={!registrationOpen}>
                  Cancel Registration
                </Button>
              </div>
            )}
            {isLadderFormat && (
              <div className="pt-2">
                <Button variant="outline" onClick={() => router.push(`/tournaments/${tournamentId}/ladder`)}>
                  View Ladder
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <TournamentChatCard
          tournamentId={tournamentId}
          currentUserId={session?.user?.id}
          permission={chatPermissions?.tournament}
        />

        <div className="space-y-6">
          {divisions.map((division) => (
            <DivisionSeatMap
              key={division.id}
              division={division}
              isRegistrationOpen={registrationOpen}
              myStatus={myStatus}
              onClaimSlot={handleClaimSlot}
              onPayJoin={handlePayJoin}
              entryFeeCents={entryFeeCents}
              isPaidTournament={isPaidTournament}
              payoutsActive={payoutsActive}
              onJoinWaitlist={async () => {
                try {
                  await joinWaitlistMutation.mutateAsync({ divisionId: division.id })
                  await Promise.all([
                    utils.registration.getMyStatus.invalidate({ tournamentId }),
                    utils.registration.getWaitlist.invalidate({ divisionId: division.id }),
                  ])
                } catch (error: any) {
                  alert(error.message || 'Failed to join waitlist')
                }
              }}
              onLeaveWaitlist={async () => {
                if (!confirm('Leave waitlist?')) return
                try {
                  await leaveWaitlistMutation.mutateAsync({ divisionId: division.id })
                  await Promise.all([
                    utils.registration.getMyStatus.invalidate({ tournamentId }),
                    utils.registration.getWaitlist.invalidate({ divisionId: division.id }),
                  ])
                } catch (error: any) {
                  alert(error.message || 'Failed to leave waitlist')
                }
              }}
              currentUserId={session?.user?.id}
              chatPermission={divisionChatPermissionById[division.id]}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DivisionSeatMap({
  division,
  isRegistrationOpen,
  myStatus,
  onClaimSlot,
  onPayJoin,
  entryFeeCents,
  isPaidTournament,
  payoutsActive,
  onJoinWaitlist,
  onLeaveWaitlist,
  currentUserId,
  chatPermission,
}: {
  division: any
  isRegistrationOpen: boolean
  myStatus: any
  onClaimSlot: (teamId: string, slotIndex: number) => void
  onPayJoin: (teamId: string, slotIndex: number) => void
  entryFeeCents: number
  isPaidTournament: boolean
  payoutsActive: boolean
  onJoinWaitlist: () => void
  onLeaveWaitlist: () => void
  currentUserId?: string
  chatPermission?: any
}) {
  const { data: waitlistEntries } = trpc.registration.getWaitlist.useQuery(
    { divisionId: division.id },
    { enabled: !!division.id }
  )

  const slotCount = getSlotCount(division.teamKind)
  const teams = division.teams as any[]
  const pools = division.pools as any[]

  const slotsByTeam = useMemo(() => {
    return teams.reduce<Record<string, any[]>>((acc, team) => {
      const slots = new Array(slotCount).fill(null)
      const sortedPlayers = [...team.teamPlayers].sort((a: any, b: any) => {
        if (a.slotIndex !== null && a.slotIndex !== undefined && b.slotIndex !== null && b.slotIndex !== undefined) {
          return a.slotIndex - b.slotIndex
        }
        if (a.slotIndex !== null && a.slotIndex !== undefined) return -1
        if (b.slotIndex !== null && b.slotIndex !== undefined) return 1
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      sortedPlayers.forEach((teamPlayer: any, index: number) => {
        const targetIndex = teamPlayer.slotIndex ?? index
        if (targetIndex < slotCount) {
          slots[targetIndex] = teamPlayer
        }
      })

      acc[team.id] = slots
      return acc
    }, {})
  }, [teams, slotCount])

  const hasAvailableSlots = useMemo(() => {
    return teams.some(team => slotsByTeam[team.id].some(slot => !slot))
  }, [teams, slotsByTeam])

  const isActiveInDivision = myStatus?.status === 'active' && myStatus?.divisionId === division.id
  const isWaitlistedInDivision = myStatus?.status === 'waitlisted' && myStatus?.divisionId === division.id
  const isAlreadyActive = myStatus?.status === 'active'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{division.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pools.length > 0 ? (
          pools.map((pool) => (
            <div key={pool.id} className="space-y-2">
              <div className="text-sm font-medium text-gray-700">{pool.name}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {teams.filter(team => team.poolId === pool.id).map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    slots={slotsByTeam[team.id]}
                    isRegistrationOpen={isRegistrationOpen}
                    onClaimSlot={onClaimSlot}
                    onPayJoin={onPayJoin}
                    entryFeeCents={entryFeeCents}
                    isPaidTournament={isPaidTournament}
                    payoutsActive={payoutsActive}
                    currentUserId={currentUserId}
                    isAlreadyActive={isAlreadyActive}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                slots={slotsByTeam[team.id]}
                isRegistrationOpen={isRegistrationOpen}
                onClaimSlot={onClaimSlot}
                onPayJoin={onPayJoin}
                entryFeeCents={entryFeeCents}
                isPaidTournament={isPaidTournament}
                payoutsActive={payoutsActive}
                currentUserId={currentUserId}
                isAlreadyActive={isAlreadyActive}
              />
            ))}
          </div>
        )}

        {pools.length > 0 && teams.some(team => !team.poolId) && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Unassigned Teams</div>
            <div className="grid gap-3 md:grid-cols-2">
              {teams.filter(team => !team.poolId).map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  slots={slotsByTeam[team.id]}
                  isRegistrationOpen={isRegistrationOpen}
                  onClaimSlot={onClaimSlot}
                  onPayJoin={onPayJoin}
                  entryFeeCents={entryFeeCents}
                  isPaidTournament={isPaidTournament}
                  payoutsActive={payoutsActive}
                  currentUserId={currentUserId}
                  isAlreadyActive={isAlreadyActive}
                />
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Waitlist</div>
          {waitlistEntries && waitlistEntries.length > 0 ? (
            <div className="space-y-1 text-sm text-gray-700">
              {waitlistEntries.map((entry: any, index: number) => (
                <div key={entry.id}>
                  {index + 1}. {entry.player.firstName} {entry.player.lastName}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No one on the waitlist.</div>
          )}
          {isWaitlistedInDivision && (
            <div className="mt-3">
              <Button onClick={onLeaveWaitlist} variant="outline">
                Leave Waitlist
              </Button>
            </div>
          )}
        </div>

        {!hasAvailableSlots && !isWaitlistedInDivision && (
          <div className="border-t pt-4">
            <div className="text-sm text-gray-600 mb-2">There are no available spots at the moment.</div>
            <Button onClick={onJoinWaitlist} disabled={!isRegistrationOpen}>
              Join Waitlist
            </Button>
          </div>
        )}

        {hasAvailableSlots && !isActiveInDivision && (
          <div className="text-sm text-gray-500">
            {isPaidTournament ? 'Select a slot to pay and join this division.' : 'Select a slot to join this division.'}
          </div>
        )}

        <div className="border-t pt-4">
            <DivisionChatCard
            divisionId={division.id}
            divisionName={division.name}
            currentUserId={currentUserId}
            permission={chatPermission}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TeamCard({
  team,
  slots,
  isRegistrationOpen,
  onClaimSlot,
  onPayJoin,
  entryFeeCents,
  isPaidTournament,
  payoutsActive,
  currentUserId,
  isAlreadyActive,
}: {
  team: any
  slots: any[]
  isRegistrationOpen: boolean
  onClaimSlot: (teamId: string, slotIndex: number) => void
  onPayJoin: (teamId: string, slotIndex: number) => void
  entryFeeCents: number
  isPaidTournament: boolean
  payoutsActive: boolean
  currentUserId?: string
  isAlreadyActive: boolean
}) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="text-sm font-medium text-gray-900 mb-2">{team.name}</div>
      <div className="space-y-2">
        {slots.map((slot, index) => {
          if (slot) {
            const isMe = slot.player?.userId && slot.player.userId === currentUserId
            return (
              <div key={index} className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 rounded px-2 py-1">
                <span>
                  {slot.player.firstName} {slot.player.lastName}
                </span>
                {isMe && <Badge variant="secondary">You</Badge>}
              </div>
            )
          }

          const disableJoin = !isRegistrationOpen || isAlreadyActive
          if (isAlreadyActive) {
            return (
              <div
                key={index}
                className="w-full min-h-[32px] border border-dashed rounded px-2 py-1 text-sm text-gray-400 opacity-50"
              />
            )
          }

          return (
            <button
              key={index}
              className="w-full text-left text-sm text-gray-600 border border-dashed rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50"
              disabled={disableJoin}
              onClick={() =>
                isPaidTournament
                  ? onPayJoin(team.id, index)
                  : onClaimSlot(team.id, index)
              }
            >
              {isPaidTournament
                ? `Pay & Join — $${fromCents(entryFeeCents).toFixed(2)}`
                : `Join — slot #${index + 1}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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

type ChatMessage = {
  id: string
  userId: string
  text: string | null
  isDeleted: boolean
  createdAt: string | Date
  user?: {
    id: string
    name: string | null
    image: string | null
  }
}

function TournamentChatCard({
  tournamentId,
  currentUserId,
  permission,
}: {
  tournamentId: string
  currentUserId?: string
  permission?: ChatPermission
}) {
  const limit = 100
  const utils = trpc.useUtils()
  const canView = Boolean(permission?.canView)
  const canPost = Boolean(permission?.canPost)
  const canModerate = Boolean(permission?.canModerate)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const { data: messages, isLoading, error } = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit },
    { enabled: canView }
  )

  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onSuccess: async (res) => {
      setDraft('')
      if (res?.wasFiltered) {
        alert('Some words were filtered.')
      }
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

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages?.length, scrollToBottom])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !canPost || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ tournamentId, text })
    } catch (err: any) {
      alert(err?.message || 'Failed to send message')
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Tournament chat
          </CardTitle>
          <Badge variant="outline">{(messages?.length ?? 0)} message{(messages?.length ?? 0) === 1 ? '' : 's'}</Badge>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          Visible to organizer, admins, and tournament participants.
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!permission ? (
          <div className="text-sm text-gray-500">Checking chat access…</div>
        ) : !canView ? (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
            {permission.reason || 'You do not have access to this chat.'}
          </div>
        ) : (
          <>
            <div ref={listRef} className="max-h-[340px] overflow-y-auto rounded-md border bg-white">
              {isLoading ? (
                <div className="p-3 text-sm text-gray-500">Loading chat…</div>
              ) : error ? (
                <div className="p-3 text-sm text-red-700">{error.message}</div>
              ) : !messages || messages.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No messages yet. Start the conversation.</div>
              ) : (
                <div className="divide-y">
                  {(messages as ChatMessage[]).map((m) => {
                    const isMine = Boolean(currentUserId && m.userId === currentUserId)
                    const canDelete = Boolean(isMine || canModerate)
                    return (
                      <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900 truncate">{m.user?.name || 'User'}</div>
                            <div className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</div>
                            {isMine ? <Badge variant="secondary">You</Badge> : null}
                            {canModerate ? (
                              <Badge variant="outline" className="gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Admin
                              </Badge>
                            ) : null}
                          </div>
                          <div className={`mt-1 rounded-md border px-2 py-1 text-sm whitespace-pre-wrap break-words ${m.isDeleted ? 'border-gray-200 bg-gray-50 text-gray-400 italic' : isMine ? 'border-blue-200 bg-blue-50 text-gray-800' : 'border-gray-200 bg-white text-gray-700'}`}>
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
                            title="Delete message"
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

            {canPost ? (
              <>
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message to everyone in this tournament…"
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
                <div className="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line.</div>
              </>
            ) : (
              <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
                You can view this chat but cannot post.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DivisionChatCard({
  divisionId,
  divisionName,
  currentUserId,
  permission,
}: {
  divisionId: string
  divisionName: string
  currentUserId?: string
  permission?: ChatPermission
}) {
  const limit = 100
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const canView = Boolean(permission?.canView)
  const canPost = Boolean(permission?.canPost)
  const canModerate = Boolean(permission?.canModerate)

  const { data: messages, isLoading, error } = trpc.tournamentChat.listDivision.useQuery(
    { divisionId, limit },
    { enabled: canView && open }
  )

  const sendMessage = trpc.tournamentChat.sendDivision.useMutation({
    onSuccess: async (res) => {
      setDraft('')
      if (res?.wasFiltered) {
        alert('Some words were filtered.')
      }
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

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [])

  useEffect(() => {
    if (!open) return
    scrollToBottom()
  }, [messages?.length, open, scrollToBottom])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !canPost || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ divisionId, text })
    } catch (err: any) {
      alert(err?.message || 'Failed to send message')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Division chat
          <Badge variant="outline">{(messages?.length ?? 0)} msg</Badge>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide chat' : 'Open chat'}
        </Button>
      </div>

      {!open ? null : !permission ? (
        <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">Checking chat access…</div>
      ) : !canView ? (
        <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
          {permission.reason || `You do not have access to ${divisionName} chat.`}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
            {divisionName}: organizer/admins + participants of this division only.
          </div>

          <div ref={listRef} className="max-h-[300px] overflow-y-auto rounded-md border bg-white">
            {isLoading ? (
              <div className="p-3 text-sm text-gray-500">Loading chat…</div>
            ) : error ? (
              <div className="p-3 text-sm text-red-700">{error.message}</div>
            ) : !messages || messages.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No messages yet.</div>
            ) : (
              <div className="divide-y">
                {(messages as ChatMessage[]).map((m) => {
                  const isMine = Boolean(currentUserId && m.userId === currentUserId)
                  const canDelete = Boolean(isMine || canModerate)
                  return (
                    <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900 truncate">{m.user?.name || 'User'}</div>
                          <div className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</div>
                          {isMine ? <Badge variant="secondary">You</Badge> : null}
                        </div>
                        <div className={`mt-1 rounded-md border px-2 py-1 text-sm whitespace-pre-wrap break-words ${m.isDeleted ? 'border-gray-200 bg-gray-50 text-gray-400 italic' : isMine ? 'border-blue-200 bg-blue-50 text-gray-800' : 'border-gray-200 bg-white text-gray-700'}`}>
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
                          title="Delete message"
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

          {canPost ? (
            <>
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Write to ${divisionName} participants…`}
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
              <div className="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line.</div>
            </>
          ) : (
            <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
              You can view this chat but cannot post.
            </div>
          )}

        </div>
      )}
    </div>
  )
}
