'use client'

import { useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
  registrationStartDate: Date | string | null
  registrationEndDate: Date | string | null
  startDate: Date | string
}) => {
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

  const { data: seatMap, isLoading } = trpc.registration.getSeatMap.useQuery(
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
  const utils = trpc.useUtils()

  useEffect(() => {
    if (authStatus === 'unauthenticated' && tournamentId) {
      const callbackUrl = `/tournaments/${tournamentId}/register`
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }
  }, [authStatus, router, tournamentId])

  const registrationOpen = seatMap ? isRegistrationOpen(seatMap) : false

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

  if (isLoading || !seatMap) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading registration...</div>
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
              Registration window:{' '}
              <span className="font-medium text-gray-900">
                {seatMap.registrationStartDate
                  ? new Date(seatMap.registrationStartDate).toLocaleString()
                  : new Date(seatMap.startDate).toLocaleString()}
                {' — '}
                {seatMap.registrationEndDate
                  ? new Date(seatMap.registrationEndDate).toLocaleString()
                  : new Date(seatMap.startDate).toLocaleString()}
              </span>
            </div>
            <Badge variant={registrationOpen ? 'default' : 'secondary'}>
              {registrationOpen ? 'Registration Open' : 'Registration Closed'}
            </Badge>
            {myStatus?.status === 'active' && (
              <div className="pt-2">
                <Button onClick={handleCancel} variant="destructive" disabled={!registrationOpen}>
                  Cancel Registration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {seatMap.divisions.map((division) => (
            <DivisionSeatMap
              key={division.id}
              division={division}
              isRegistrationOpen={registrationOpen}
              myStatus={myStatus}
              onClaimSlot={handleClaimSlot}
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
  isRegistrationOpen,
  myStatus,
  onClaimSlot,
  onJoinWaitlist,
  onLeaveWaitlist,
  currentUserId,
}: {
  division: any
  isRegistrationOpen: boolean
  myStatus: any
  onClaimSlot: (teamId: string, slotIndex: number) => void
  onJoinWaitlist: () => void
  onLeaveWaitlist: () => void
  currentUserId?: string
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
                    currentUserId={currentUserId}
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
                currentUserId={currentUserId}
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
                  currentUserId={currentUserId}
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
            <div className="text-sm text-gray-600 mb-2">No available slots in this division.</div>
            <Button onClick={onJoinWaitlist} disabled={!isRegistrationOpen}>
              Join Waitlist
            </Button>
          </div>
        )}

        {hasAvailableSlots && !isActiveInDivision && (
          <div className="text-sm text-gray-500">
            Select a slot to join this division.
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
  currentUserId,
}: {
  team: any
  slots: any[]
  isRegistrationOpen: boolean
  onClaimSlot: (teamId: string, slotIndex: number) => void
  currentUserId?: string
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

          return (
            <button
              key={index}
              className="w-full text-left text-sm text-gray-600 border border-dashed rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50"
              disabled={!isRegistrationOpen}
              onClick={() => onClaimSlot(team.id, index)}
            >
              Empty slot #{index + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
