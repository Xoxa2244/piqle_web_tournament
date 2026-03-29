import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ScrollView as RNScrollViewType,
  useWindowDimensions,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'

import { ActionButton, EmptyState, LoadingBlock, Pill, Screen, SectionTitle, SurfaceCard } from '../../../src/components/ui'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import { EntityImage } from '../../../src/components/EntityImage'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { formatDateRange, formatMoney, formatPlayerName } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
import { useTournamentAccessInfo } from '../../../src/hooks/useTournamentAccessInfo'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'
import { useToastWhenEntityMissing } from '../../../src/hooks/useToastWhenEntityMissing'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { useToast } from '../../../src/providers/ToastProvider'

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
  const { width: screenWidth } = useWindowDimensions()
  const params = useLocalSearchParams<{ id: string; payment?: string }>()
  const tournamentId = params.id
  const paymentState = typeof params.payment === 'string' ? params.payment : null
  const { token } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [teamAnchors, setTeamAnchors] = useState<Record<string, number>>({})
  const divisionsRef = useRef<RNScrollViewType>(null)
  const [heroRegisteredState, setHeroRegisteredState] = useState<boolean | null>(null)
  const [heroAnimating, setHeroAnimating] = useState(false)
  const heroTranslateX = useRef(new Animated.Value(0)).current
  const heroOpacity = useRef(new Animated.Value(1)).current

  const seatMapQuery = trpc.registration.getSeatMap.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  useToastWhenEntityMissing({
    enabled: Boolean(tournamentId) && isAuthenticated,
    entityKey: String(tournamentId ?? ''),
    toastMessage: 'This tournament no longer exists or the link is invalid.',
    isLoading: seatMapQuery.isLoading,
    hasData: Boolean(seatMapQuery.data),
    isError: seatMapQuery.isError,
    errorMessage: seatMapQuery.error?.message,
  })
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
      toast.success("You're registered!")
    },
    onError: (e) => toast.error(e.message || 'Failed to claim slot'),
  })
  const joinWaitlist = trpc.registration.joinWaitlist.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
      toast.success("You're on the waitlist.")
    },
    onError: (e) => toast.error(e.message || 'Failed to join waitlist'),
  })
  const leaveWaitlist = trpc.registration.leaveWaitlist.useMutation({
    onSuccess: async () => {
      await Promise.all([
        seatMapQuery.refetch(),
        myStatusQuery.refetch(),
      ])
      toast.success('You left the waitlist.')
    },
    onError: (e) => toast.error(e.message || 'Failed to leave waitlist'),
  })
  const createCheckout = trpc.payment.createCheckoutSession.useMutation({
    onError: (e) => toast.error(e.message || 'Failed to start payment'),
  })

  const onRefreshRegistration = async () => {
    await Promise.all([
      seatMapQuery.refetch(),
      myStatusQuery.refetch(),
      accessQuery.refetch(),
    ])
  }
  const pullToRefresh = usePullToRefresh(onRefreshRegistration)

  useFocusEffect(
    useCallback(() => {
      if (!tournamentId || !isAuthenticated) return
      void Promise.all([seatMapQuery.refetch(), myStatusQuery.refetch(), accessQuery.refetch()])
    }, [tournamentId, isAuthenticated, seatMapQuery, myStatusQuery, accessQuery])
  )

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

  const isRegisteredByStatus = myStatusQuery.data?.status === 'active'
  const isRegisteredReflectedInSeatMap =
    isRegisteredByStatus &&
    Boolean(
      seatMapQuery.data?.divisions?.some((division: any) =>
        (division?.teams ?? []).some(
          (team: any) =>
            team?.id === myStatusQuery.data?.teamId &&
            (team?.teamPlayers ?? []).some((tp: any) => tp?.playerId === myStatusQuery.data?.playerId)
        )
      )
    )
  const registeredNow = Boolean(isRegisteredReflectedInSeatMap)
  const myTeamId = registeredNow ? myStatusQuery.data?.teamId : null
  const showRegisteredHero = heroRegisteredState ?? registeredNow
  const scrollToMyTeam = () => {
    if (!myTeamId) return
    const y = teamAnchors[myTeamId]
    if (typeof y !== 'number') return
    divisionsRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true })
  }

  useEffect(() => {
    if (heroRegisteredState === null) {
      setHeroRegisteredState(registeredNow)
      return
    }
    if (heroRegisteredState === registeredNow || heroAnimating) return

    setHeroAnimating(true)
    Animated.parallel([
      Animated.timing(heroTranslateX, {
        toValue: -screenWidth * 1.05,
        duration: 260,
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(heroOpacity, {
        toValue: 0.62,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setHeroRegisteredState(registeredNow)
      heroTranslateX.setValue(screenWidth * 0.62)
      heroOpacity.setValue(0.75)
      Animated.parallel([
        Animated.spring(heroTranslateX, {
          toValue: 0,
          damping: 15,
          stiffness: 170,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setHeroAnimating(false)
      })
    })
  }, [heroAnimating, heroOpacity, heroRegisteredState, heroTranslateX, registeredNow, screenWidth])

  if (!isAuthenticated) {
    return (
      <Screen title="Register" subtitle="Sign in to claim a slot or join a waitlist.">
        <EmptyState title="Authentication required" body="Tournament registration uses your existing player account from the web app." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  const seatMapInitialLoading = seatMapQuery.isLoading && !seatMapQuery.data
  const myStatusInitialLoading = protectedQueriesEnabled && myStatusQuery.isLoading && !myStatusQuery.data

  if (seatMapInitialLoading || myStatusInitialLoading) {
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
  const feeLabel = isPaidTournament ? formatMoney(seatMap.entryFeeCents) : '$ Free'

  return (
    <Screen title="" subtitle="" scroll={false} contentStyle={styles.screenContent}>
      <View style={styles.fixedTop}>
        <View style={styles.headerRow}>
          <BackCircleButton onPress={() => router.back()} iconSize={18} style={styles.eventMiniBarButton} />
          <EntityImage
            uri={seatMap.image}
            style={styles.headerAvatar}
            resizeMode="cover"
            placeholderResizeMode="contain"
          />
          <View style={styles.headerMain}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {seatMap.title}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {formatDateRange(seatMap.registrationStartDate || seatMap.startDate, seatMap.registrationEndDate || seatMap.startDate)}
            </Text>
          </View>
        </View>

        <Animated.View
          style={{
            transform: [{ translateX: heroTranslateX }],
            opacity: heroOpacity,
          }}
        >
        <Pressable
          disabled={!showRegisteredHero}
          onPress={scrollToMyTeam}
          style={({ pressed }) => [pressed && showRegisteredHero && styles.heroRegisteredPressed]}
        >
          <SurfaceCard tone="hero" style={showRegisteredHero ? styles.heroRegisteredCard : undefined}>
            {showRegisteredHero ? (
              <Text style={styles.heroRegisteredTitle}>You're registered 🎉</Text>
            ) : (
              <SectionTitle
                title="Registration overview"
                subtitle={registrationOpen ? 'Registration window is open' : 'Registration is closed'}
              />
            )}
            {!showRegisteredHero ? (
              <View style={styles.badges}>
                <OptionalLinearGradient
                  colors={['#FFF3C4', '#F6D77B', '#E8B64B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.priceChip}
                  fallbackColor="#F6D77B"
                >
                  <Text style={styles.priceChipText}>{feeLabel}</Text>
                </OptionalLinearGradient>
                {isPaidTournament ? (
                  <View style={styles.paymentTimingChipLight}>
                    <Text style={styles.paymentTimingChipLightText}>
                      {seatMap.paymentTiming === 'PAY_BY_DEADLINE' ? 'Pay by deadline' : 'Pay in 15 minutes'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {showRegisteredHero ? (
              <View style={styles.statusCard}>
                <Text style={styles.registeredIntro}>
                  You are registered in this division and team.
                </Text>
                <View style={styles.registeredChipsRow}>
                  <Pressable
                    onPress={scrollToMyTeam}
                    style={({ pressed }) => [styles.registeredInfoChip, pressed && styles.registeredInfoChipPressed]}
                  >
                    <Text style={styles.registeredInfoChipValue} numberOfLines={1}>
                      {myStatus?.divisionName ?? 'Unknown division'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={scrollToMyTeam}
                    style={({ pressed }) => [styles.registeredInfoChip, pressed && styles.registeredInfoChipPressed]}
                  >
                    <Text style={styles.registeredInfoChipValue} numberOfLines={1}>
                      {myStatus?.teamName ?? 'Unknown team'}
                    </Text>
                  </Pressable>
                </View>
                {hasPrivilegedAccess ? (
                  <Text style={styles.statusBody}>You also have admin access.</Text>
                ) : null}
                {isPaidTournament && !myStatus.isPaid ? (
                  <ActionButton
                    label={`Pay now ${formatMoney(seatMap.entryFeeCents)}`}
                  variant="secondary"
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
              </View>
            ) : myStatus?.status === 'waitlisted' ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>You are on the waitlist</Text>
                <Text style={styles.statusBody}>We will keep your spot in line for the selected division.</Text>
                <ActionButton label="Leave waitlist" variant="secondary" loading={leaveWaitlist.isPending} onPress={() => leaveWaitlist.mutate({ divisionId: myStatus.divisionId })} />
              </View>
            ) : hasPrivilegedAccess ? (
          <View style={[styles.statusCard, styles.statusCardAdmin]}>
                <Text style={styles.statusTitle}>You have admin access</Text>
                <Text style={styles.statusBody}>
                  You can still join a slot or waitlist from this screen if you want to participate.
                </Text>
              </View>
            ) : null}
          </SurfaceCard>
        </Pressable>
        </Animated.View>
      </View>

      <PickleRefreshScrollView
        ref={divisionsRef as any}
        style={styles.divisionsScroll}
        contentContainerStyle={styles.divisionsContent}
        showsVerticalScrollIndicator={false}
        refreshing={pullToRefresh.refreshing}
        onRefresh={pullToRefresh.onRefresh}
        bounces
      >
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
                  <View
                    key={team.id}
                    style={styles.teamCard}
                    onLayout={(e) => {
                      const y = e.nativeEvent.layout.y
                      setTeamAnchors((prev) => (prev[team.id] === y ? prev : { ...prev, [team.id]: y }))
                    }}
                  >
                    <Text style={styles.teamName}>{team.name}</Text>
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {slots.map((slot: any, index: number) => {
                        if (slot?.player) {
                          const isMySlot = Boolean(
                            myStatus?.status === 'active' &&
                              myStatus?.teamId === team.id &&
                              (slot.playerId === myStatus?.playerId || myStatus?.slotIndex === index)
                          )
                          const slotPlayerName = formatPlayerName(slot.player)
                          return (
                            <View key={index} style={[styles.playerSlot, isMySlot && styles.playerSlotActive]}>
                              <RemoteUserAvatar
                                uri={null}
                                size={28}
                                fallback="initials"
                                initialsLabel={slotPlayerName}
                              />
                              <Text style={[styles.playerSlotText, isMySlot && styles.playerSlotTextActive]}>
                                {slotPlayerName}
                              </Text>
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
      </PickleRefreshScrollView>

    </Screen>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screenContent: {
    paddingBottom: 0,
    gap: 0,
  },
  heroRegisteredCard: {
    backgroundColor: colors.primary,
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  heroRegisteredPressed: {
    opacity: 0.96,
  },
  fixedTop: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  eventMiniBarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    marginTop: spacing.xs,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divisionsScroll: {
    flex: 1,
  },
  divisionsContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  headerMain: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  badges: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceChip: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
    justifyContent: 'center',
  },
  priceChipText: {
    color: colors.black,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  paymentTimingChipLight: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: '#F1F3F5',
    borderWidth: 1,
    borderColor: '#E3E7EB',
  },
  paymentTimingChipLightText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  statusCard: {
    marginTop: spacing.xs,
    gap: 10,
  },
  statusCardAdmin: {
    marginTop: spacing.md,
    gap: 4,
  },
  registeredIntro: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  heroRegisteredTitle: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  registeredChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'nowrap',
  },
  registeredInfoChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  registeredInfoChipPressed: {
    opacity: 0.88,
  },
  registeredInfoChipValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    flexShrink: 1,
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
    justifyContent: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerSlotActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(40, 205, 65, 0.10)',
  },
  playerSlotText: {
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
  },
  playerSlotTextActive: {
    color: colors.primary,
  },
  })



