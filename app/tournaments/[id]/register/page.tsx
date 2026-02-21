'use client'

import { useMemo, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatUsDateTimeShort, getTimezoneLabel } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fromCents } from '@/lib/payment'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'

type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

const getSlotCount = (teamKind: TeamKind, tournamentFormat?: string | null) => {
  if (tournamentFormat === 'INDY_LEAGUE' && teamKind === 'SQUAD_4v4') {
    return 32
  }

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
  const [inviteAcceptHandled, setInviteAcceptHandled] = useState(false)
  const [saveCardLoading, setSaveCardLoading] = useState(false)
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

  useEffect(() => {
    if (!ENABLE_DEFERRED_PAYMENTS) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('card') === 'saved') {
      alert('Card saved. If still unpaid, we will auto-charge it at the payment deadline.')
      params.delete('card')
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}`
      window.history.replaceState({}, '', nextUrl)
      void Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getSeatMap.invalidate({ tournamentId }),
      ])
    }
  }, [tournamentId, utils])

  const registrationOpen = seatMap ? isRegistrationOpen(seatMap) : false
  const divisions = (seatMap?.divisions ?? []) as any[]
  const entryFeeCents = seatMap?.entryFeeCents ?? 0
  const isPaidTournament = entryFeeCents > 0
  const payoutsActive = Boolean(seatMap?.payoutsActive)
  const isLadderFormat =
    (seatMap as any)?.format === 'ONE_DAY_LADDER' || (seatMap as any)?.format === 'LADDER_LEAGUE'

  const handleClaimSlot = async (teamId: string, slotIndex: number) => {
    try {
      const result = await claimSlotMutation.mutateAsync({ teamId, slotIndex })
      await Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getSeatMap.invalidate({ tournamentId }),
      ])
      if (isPaidTournament) {
        if (!ENABLE_DEFERRED_PAYMENTS) {
          if (!payoutsActive) {
            alert('You are registered. Payments are not enabled yet; contact the organizer.')
            return
          }
          await handlePayNow({ teamId, slotIndex })
          return
        }
        const dueText =
          result?.paymentDueAt
            ? formatUsDateTimeShort(result.paymentDueAt, { timeZone: seatMap?.timezone })
            : null
        alert(
          dueText
            ? `You are registered. Complete payment by ${dueText}.`
            : 'You are registered. Complete payment to keep your spot.'
        )
      } else {
        alert('You are registered!')
      }
    } catch (error: any) {
      alert(error.message || 'Failed to claim slot')
    }
  }

  const handlePayNow = async (spot?: { teamId: string; slotIndex: number }) => {
    try {
      const teamId =
        spot?.teamId ??
        (myStatus?.status === 'active' && myStatus.teamId ? myStatus.teamId : undefined)
      const slotIndex =
        typeof spot?.slotIndex === 'number'
          ? spot.slotIndex
          : myStatus?.status === 'active' && typeof myStatus.slotIndex === 'number'
          ? myStatus.slotIndex
          : undefined
      if (!teamId || typeof slotIndex !== 'number') {
        throw new Error('Join a slot first')
      }
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

  const handleSaveCardForAutoPay = async () => {
    try {
      setSaveCardLoading(true)
      const response = await fetch('/api/stripe/create-save-card-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tournamentId }),
      })
      const raw = await response.text()
      const payload = raw ? JSON.parse(raw) : null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start card setup')
      }
      if (!payload?.url) {
        throw new Error('Setup session URL missing')
      }
      window.location.href = payload.url
    } catch (error: any) {
      alert(error.message || 'Failed to save card')
    } finally {
      setSaveCardLoading(false)
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
                {isPaidTournament ? (
                  myStatus.isPaid ? (
                    <Badge variant="secondary" className="w-fit">Payment complete</Badge>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 space-y-2">
                      <div className="text-sm font-medium">Payment pending</div>
                      {ENABLE_DEFERRED_PAYMENTS ? (
                        <>
                          <div className="text-xs">
                            {seatMap.paymentTiming === 'PAY_IN_15_MIN'
                              ? 'Pay within 15 minutes after joining.'
                              : 'Pay before registration deadline.'}
                            {myStatus.paymentDueAt ? (
                              <span className="block">
                                Due: {formatUsDateTimeShort(myStatus.paymentDueAt, { timeZone: seatMap.timezone })}
                              </span>
                            ) : null}
                          </div>
                          {seatMap.paymentTiming === 'PAY_BY_DEADLINE' && (
                            <div className="rounded-md border border-amber-300 bg-white/70 p-2 text-xs text-amber-900 space-y-2">
                              <div className="font-medium">Auto-pay at deadline</div>
                              {myStatus.hasSavedCard ? (
                                <div>
                                  Saved card:{' '}
                                  <span className="font-medium">
                                    {(myStatus.savedCardBrand || 'Card').toUpperCase()}
                                    {myStatus.savedCardLast4 ? ` •••• ${myStatus.savedCardLast4}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <div>No saved card yet.</div>
                              )}
                              <Button
                                variant="outline"
                                onClick={handleSaveCardForAutoPay}
                                disabled={saveCardLoading}
                              >
                                {saveCardLoading
                                  ? 'Redirecting...'
                                  : myStatus.hasSavedCard
                                  ? 'Update saved card'
                                  : 'Save card for auto-pay'}
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs">
                          Complete payment now to keep your spot.
                          {myStatus.paymentDueAt ? (
                            <span className="block">
                              Spot release: {formatUsDateTimeShort(myStatus.paymentDueAt, { timeZone: seatMap.timezone })}
                            </span>
                          ) : null}
                        </div>
                      )}
                      <Button onClick={() => void handlePayNow()} disabled={!payoutsActive}>
                        Pay now — ${fromCents(entryFeeCents).toFixed(2)}
                      </Button>
                    </div>
                  )
                ) : null}
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

        <div className="space-y-6">
          {divisions.map((division) => (
            <DivisionSeatMap
              key={division.id}
              division={division}
              tournamentFormat={(seatMap as any)?.format}
              isRegistrationOpen={registrationOpen}
              myStatus={myStatus}
              onClaimSlot={handleClaimSlot}
              entryFeeCents={entryFeeCents}
              isPaidTournament={isPaidTournament}
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
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DivisionSeatMap({
  division,
  tournamentFormat,
  isRegistrationOpen,
  myStatus,
  onClaimSlot,
  entryFeeCents,
  isPaidTournament,
  onJoinWaitlist,
  onLeaveWaitlist,
  currentUserId,
}: {
  division: any
  tournamentFormat?: string | null
  isRegistrationOpen: boolean
  myStatus: any
  onClaimSlot: (teamId: string, slotIndex: number) => void
  entryFeeCents: number
  isPaidTournament: boolean
  onJoinWaitlist: () => void
  onLeaveWaitlist: () => void
  currentUserId?: string
}) {
  const { data: waitlistEntries } = trpc.registration.getWaitlist.useQuery(
    { divisionId: division.id },
    { enabled: !!division.id }
  )

  const slotCount = getSlotCount(division.teamKind, tournamentFormat)
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
                    entryFeeCents={entryFeeCents}
                    isPaidTournament={isPaidTournament}
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
                entryFeeCents={entryFeeCents}
                isPaidTournament={isPaidTournament}
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
                  entryFeeCents={entryFeeCents}
                  isPaidTournament={isPaidTournament}
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
            {isPaidTournament
              ? ENABLE_DEFERRED_PAYMENTS
                ? 'Select a slot to join. Payment is completed after joining.'
                : 'Select a slot to join and continue to payment.'
              : 'Select a slot to join this division.'}
          </div>
        )}

      </CardContent>
    </Card>
  )
}

function TeamCard({
  team,
  slots,
  isRegistrationOpen,
  onClaimSlot,
  entryFeeCents,
  isPaidTournament,
  currentUserId,
  isAlreadyActive,
}: {
  team: any
  slots: any[]
  isRegistrationOpen: boolean
  onClaimSlot: (teamId: string, slotIndex: number) => void
  entryFeeCents: number
  isPaidTournament: boolean
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
              onClick={() => onClaimSlot(team.id, index)}
            >
              {isPaidTournament
                ? ENABLE_DEFERRED_PAYMENTS
                  ? `Join — then pay $${fromCents(entryFeeCents).toFixed(2)}`
                  : `Join & pay — $${fromCents(entryFeeCents).toFixed(2)}`
                : `Join — slot #${index + 1}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
