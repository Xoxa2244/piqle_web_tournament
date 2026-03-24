import { useEffect, useMemo } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { ActionButton, EmptyState, LoadingBlock, Pill, Screen, SectionTitle, SurfaceCard } from '../../../src/components/ui'
import { formatDateRange, formatMoney, formatPlayerName } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { spacing, type ThemePalette } from '../../../src/lib/theme'
import { useTournamentAccessInfo } from '../../../src/hooks/useTournamentAccessInfo'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'

type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

const getSlotCount = (teamKind: TeamKind, tournamentFormat?: string | null) => {
  if (tournamentFormat === 'INDY_LEAGUE' && teamKind === 'SQUAD_4v4') {
    return 32
  }

  if (teamKind === 'SINGLES_1v1') return 1
  if (teamKind === 'SQUAD_4v4') return 4
  return 2
}

const getTeamSlots = (team: any, slotCount: number) => {
  const slots = new Array(slotCount).fill(null)
  const sortedPlayers = [...(team.teamPlayers ?? [])].sort((left: any, right: any) => {
    if (
      left.slotIndex !== null &&
      left.slotIndex !== undefined &&
      right.slotIndex !== null &&
      right.slotIndex !== undefined
    ) {
      return left.slotIndex - right.slotIndex
    }
    if (left.slotIndex !== null && left.slotIndex !== undefined) return -1
    if (right.slotIndex !== null && right.slotIndex !== undefined) return 1
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })

  sortedPlayers.forEach((teamPlayer: any, index: number) => {
    const targetIndex = teamPlayer.slotIndex ?? index
    if (targetIndex < slotCount) {
      slots[targetIndex] = teamPlayer
    }
  })

  return slots
}

const isRegistrationOpen = (tournament: {
  registrationStartDate?: string | Date | null
  registrationEndDate?: string | Date | null
  startDate: string | Date
}) => {
  const start = tournament.registrationStartDate ? new Date(tournament.registrationStartDate) : new Date(tournament.startDate)
  const end = tournament.registrationEndDate ? new Date(tournament.registrationEndDate) : new Date(tournament.startDate)
  const now = new Date()
  return now >= start && now <= end
}

export default function TournamentRegistrationScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ id: string; payment?: string }>()
  const tournamentId = params.id
  const paymentState = typeof params.payment === 'string' ? params.payment : null
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()

  const seatMapQuery = trpc.registration.getSeatMap.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const protectedQueriesEnabled =
    Boolean(tournamentId) && isAuthenticated && Boolean(seatMapQuery.data)
  const myStatusQuery = trpc.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: protectedQueriesEnabled }
  )
  const accessQuery = useTournamentAccessInfo(String(tournamentId ?? ''), protectedQueriesEnabled)

  const claimSlot = trpc.registration.claimSlot.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
    },
  })
  const cancelRegistration = trpc.registration.cancelRegistration.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
    },
  })
  const joinWaitlist = trpc.registration.joinWaitlist.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
    },
  })
  const leaveWaitlist = trpc.registration.leaveWaitlist.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
    },
  })
  const createCheckout = trpc.payment.createCheckoutSession.useMutation()

  useEffect(() => {
    if (!tournamentId || !paymentState) return

    router.replace(`/tournaments/${tournamentId}/register`)
    void utils.registration.getMyStatuses.invalidate()
    void Promise.all([
      seatMapQuery.refetch(),
      myStatusQuery.refetch(),
    ])

    if (paymentState === 'success') {
      const timeoutId = setTimeout(() => {
        void Promise.all([
          seatMapQuery.refetch(),
          myStatusQuery.refetch(),
        ])
      }, 1500)

      return () => clearTimeout(timeoutId)
    }
  }, [myStatusQuery, paymentState, router, seatMapQuery, tournamentId, utils.registration.getMyStatuses])

  if (!isAuthenticated) {
    return (
      <Screen title="Register" subtitle="Sign in to claim a slot or join a waitlist.">
        <EmptyState title="Authentication required" body="Tournament registration uses your existing player account from the web app." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  if (seatMapQuery.isLoading || myStatusQuery.isLoading) {
    return <Screen title="Register"><LoadingBlock label="Loading registration…" /></Screen>
  }

  if (!seatMapQuery.data) {
    return <Screen title="Register"><EmptyState title="Registration unavailable" body="The event could not be loaded." /></Screen>
  }

  const seatMap = seatMapQuery.data
  const myStatus = myStatusQuery.data
  const accessInfo = accessQuery.data?.userAccessInfo
  const hasPrivilegedAccess = Boolean(accessInfo?.isOwner || accessInfo?.accessLevel === 'ADMIN')
  const canLeaveTournament = myStatus?.status === 'active'
  const registrationOpen = isRegistrationOpen(seatMap)
  const isPaidTournament = (seatMap.entryFeeCents ?? 0) > 0

  return (
    <Screen title={seatMap.title} subtitle={formatDateRange(seatMap.registrationStartDate || seatMap.startDate, seatMap.registrationEndDate || seatMap.startDate)}>
      <SurfaceCard tone="hero">
        <SectionTitle title="Registration overview" subtitle={registrationOpen ? 'Registration window is open' : 'Registration is closed'} />
        <View style={styles.badges}>
          <Pill label={isPaidTournament ? formatMoney(seatMap.entryFeeCents) : 'Free'} tone={isPaidTournament ? 'muted' : 'success'} />
          <Pill label={seatMap.paymentTiming === 'PAY_BY_DEADLINE' ? 'Pay by deadline' : 'Pay in 15 minutes'} />
        </View>

        {canLeaveTournament ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>
              {hasPrivilegedAccess ? 'You are registered and have admin access' : 'You are registered'}
            </Text>
            <Text style={styles.statusBody}>
              {`${myStatus?.divisionName} · ${myStatus?.teamName}`}
            </Text>
            {isPaidTournament && !myStatus.isPaid ? (
              <ActionButton
                label={`Pay now ${formatMoney(seatMap.entryFeeCents)}`}
                loading={createCheckout.isPending}
                onPress={async () => {
                  const result = await createCheckout.mutateAsync({
                    tournamentId,
                    returnPath: `/tournaments/${tournamentId}/register`,
                  })
                  if (result.url) {
                    await Linking.openURL(result.url)
                  }
                }}
              />
            ) : null}
            <ActionButton
              label="Leave Tournament"
              variant="danger"
              loading={cancelRegistration.isPending}
              onPress={() => cancelRegistration.mutate({ tournamentId })}
            />
          </View>
        ) : myStatus?.status === 'waitlisted' ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>You are on the waitlist</Text>
            <Text style={styles.statusBody}>We will keep your spot in line for the selected division.</Text>
            <ActionButton label="Leave waitlist" variant="secondary" loading={leaveWaitlist.isPending} onPress={() => leaveWaitlist.mutate({ divisionId: myStatus.divisionId })} />
          </View>
        ) : hasPrivilegedAccess ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>You have admin access</Text>
            <Text style={styles.statusBody}>
              You can still join a slot or waitlist from this screen if you want to participate.
            </Text>
          </View>
        ) : null}
      </SurfaceCard>

      {seatMap.divisions.map((division: any) => {
        const slotCount = getSlotCount(division.teamKind, seatMap.format)
        const teamsWithSlots = (division.teams ?? []).map((team: any) => ({
          team,
          slots: getTeamSlots(team, slotCount),
        }))
        const hasAvailableSlots = teamsWithSlots.some(({ slots }: { slots: any[] }) => slots.some((slot) => !slot))

        return (
          <SurfaceCard key={division.id} tone="soft">
            <SectionTitle title={division.name} subtitle={`${division.teams.length} teams`} />
            <View style={{ marginTop: spacing.md, gap: 12 }}>
              {teamsWithSlots.map(({ team, slots }: { team: any; slots: any[] }) => {
                return (
                  <View key={team.id} style={styles.teamCard}>
                    <Text style={styles.teamName}>{team.name}</Text>
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {slots.map((slot: any, index: number) => {
                        if (slot?.player) {
                          return (
                            <View key={index} style={styles.playerSlot}>
                              <Text style={styles.playerSlotText}>{formatPlayerName(slot.player)}</Text>
                            </View>
                          )
                        }

                        return (
                          <ActionButton
                            key={index}
                            label={`Join slot ${index + 1}${isPaidTournament ? ` · ${formatMoney(seatMap.entryFeeCents)}` : ''}`}
                            variant="secondary"
                            loading={claimSlot.isPending}
                            disabled={!registrationOpen || myStatus?.status === 'active'}
                            onPress={() => claimSlot.mutate({ teamId: team.id, slotIndex: index })}
                          />
                        )
                      })}
                    </View>
                  </View>
                )
              })}
            </View>

            {!hasAvailableSlots && myStatus?.status !== 'waitlisted' && myStatus?.status !== 'active' ? (
              <View style={{ marginTop: spacing.md }}>
                <ActionButton
                  label="Join waitlist"
                  variant="secondary"
                  loading={joinWaitlist.isPending}
                  disabled={!registrationOpen}
                  onPress={() => joinWaitlist.mutate({ divisionId: division.id })}
                />
              </View>
            ) : null}
          </SurfaceCard>
        )
      })}
    </Screen>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  badges: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusCard: {
    marginTop: spacing.md,
    gap: 10,
  },
  statusTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  statusBody: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  teamCard: {
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  teamName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  playerSlot: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerSlotText: {
    color: colors.text,
    fontWeight: '600',
  },
  })



