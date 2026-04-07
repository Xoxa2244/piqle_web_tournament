import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'

import { AppBottomSheet } from '../../src/components/AppBottomSheet'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { ClubCard } from '../../src/components/ClubCard'
import { StaggeredReveal } from '../../src/components/StaggeredReveal'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SegmentedContentFade,
  SegmentedControl,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { buildWebUrl, FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

const normalizeLocationValue = (value: string | null | undefined) =>
  String(value ?? '').trim().toLowerCase()

const ClubListItem = memo(function ClubListItem({
  club,
  mode,
  isAuthenticated,
  toggleFollow,
}: {
  club: any
  mode: 'discover' | 'my-clubs' | 'nearby'
  isAuthenticated: boolean
  toggleFollow: { mutate: (vars: { clubId: string }) => void }
}) {
  const handlePress = useCallback(() => {
    router.push({ pathname: '/clubs/[id]', params: { id: club.id } })
  }, [club.id])

  const handleJoin = useCallback(() => {
    if (mode === 'my-clubs') return
    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }
    router.push({ pathname: '/clubs/[id]', params: { id: club.id } })
    toggleFollow.mutate({ clubId: club.id })
  }, [club.id, isAuthenticated, mode, toggleFollow])

  return (
    <View style={{ gap: 10 }}>
      <ClubCard
        club={club}
        onPress={handlePress}
        onJoin={mode !== 'my-clubs' ? handleJoin : undefined}
      />
    </View>
  )
})

export default function ClubsTab() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'discover' | 'my-clubs' | 'nearby'>('discover')
  const [showCreateInfo, setShowCreateInfo] = useState(false)
  const [revealEpoch, setRevealEpoch] = useState(0)
  const createPlusSpin = useRef(new Animated.Value(0)).current
  const createSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const createLongPressTriggeredRef = useRef(false)
  const api = trpc as any
  const utils = (trpc as any).useUtils()

  const clubsQuery = api.club.list.useQuery(
    search.trim() ? { query: search.trim() } : undefined
  )
  const profileQuery = api.user.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
  })
  const toggleFollow = api.club.toggleFollow.useMutation({
    onSuccess: (
      data: { status: string; isFollowing: boolean; isJoinPending: boolean },
      variables: { clubId: string },
    ) => {
      void Promise.all([
        utils.club.list.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
        utils.club.get.invalidate({ id: variables.clubId }),
      ])
      if (data.status === 'pending') toast.success('Request sent.')
      else if (data.status === 'joined') toast.success('You joined the club.')
      else if (data.status === 'left') toast.success('You left the club.')
      else if (data.status === 'admin') {
        toast.show({ message: 'You manage this club as an admin.', variant: 'default' })
      }
    },
    onError: (e: { message?: string }) => {
      toast.error(e?.message || 'Something went wrong')
    },
  })

  const clubs = useMemo(() => ((clubsQuery.data ?? []) as any[]), [clubsQuery.data])
  const profileCity = String(profileQuery.data?.city ?? '').trim()
  const normalizedProfileCity = normalizeLocationValue(profileCity)

  const myClubs = useMemo(
    () => clubs.filter((club) => club.isFollowing || club.isAdmin || club.isJoinPending),
    [clubs]
  )
  const discoverClubs = useMemo(
    () => clubs.filter((club) => !club.isFollowing && !club.isAdmin && !club.isJoinPending),
    [clubs]
  )
  const nearbyClubs = useMemo(() => {
    if (!normalizedProfileCity) return []

    return clubs.filter((club) => {
      const normalizedCity = normalizeLocationValue(club.city)
      const normalizedAddress = normalizeLocationValue(
        [club.address, club.city, club.state].filter(Boolean).join(' ')
      )

      if (!normalizedCity && !normalizedAddress) return false

      return (
        (normalizedCity && (normalizedCity.includes(normalizedProfileCity) || normalizedProfileCity.includes(normalizedCity))) ||
        normalizedAddress.includes(normalizedProfileCity)
      )
    })
  }, [clubs, normalizedProfileCity])

  const activeClubs = useMemo(() => {
    if (mode === 'my-clubs') {
      return isAuthenticated ? myClubs : []
    }
    if (mode === 'nearby') {
      return nearbyClubs
    }
    return discoverClubs
  }, [discoverClubs, isAuthenticated, mode, myClubs, nearbyClubs])

  const listHeading = useMemo(() => {
    if (mode === 'my-clubs') return 'My clubs'
    if (mode === 'nearby') {
      return profileCity ? `Nearby clubs in ${profileCity}` : 'Nearby clubs'
    }
    return isAuthenticated ? 'Discover clubs' : 'All clubs'
  }, [isAuthenticated, mode, profileCity])

  const visibleClubIds = useMemo(
    () => [...new Set(activeClubs.map((club) => club.id))].slice(0, 200),
    [activeClubs],
  )

  const clubFeedbackSummariesQuery = api.feedback.getBatchSummaries.useQuery(
    { entityType: 'CLUB', entityIds: visibleClubIds },
    { enabled: FEEDBACK_API_ENABLED && visibleClubIds.length > 0 && isAuthenticated },
  )

  const feedbackByClubId = (clubFeedbackSummariesQuery.data?.map ?? {}) as Record<
    string,
    { total: number; averageRating: number | null; canPublish: boolean }
  >

  const feedbackWithDevFallback = useMemo(() => {
    const map = { ...feedbackByClubId }
    if (!__DEV__) return map
    for (const clubId of visibleClubIds) {
      if (map[clubId]) continue
      const seed = clubId
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      const total = 5 + (seed % 21) // 5..25
      const avg = 3.8 + ((seed % 13) / 20) // 3.8..4.4
      map[clubId] = {
        total,
        averageRating: Number(avg.toFixed(1)),
        canPublish: true,
      }
    }
    return map
  }, [feedbackByClubId, visibleClubIds])

  const decoratedActiveClubs = useMemo(
    () => {
      const decorated = activeClubs.map((club) => ({
        ...club,
        feedbackSummary: feedbackWithDevFallback?.[club.id] ?? null,
      }))

      if (mode !== 'my-clubs') return decorated

      return [...decorated].sort((left, right) => {
        const leftRank = left.isAdmin ? 0 : left.isFollowing ? 1 : left.isJoinPending ? 2 : 3
        const rightRank = right.isAdmin ? 0 : right.isFollowing ? 1 : right.isJoinPending ? 2 : 3
        if (leftRank !== rightRank) return leftRank - rightRank
        return String(left.name ?? '').localeCompare(String(right.name ?? ''))
      })
    },
    [activeClubs, feedbackWithDevFallback, mode]
  )

  const onRefreshClubs = useCallback(async () => {
    await clubsQuery.refetch()
  }, [clubsQuery])

  const pullToRefresh = usePullToRefresh(onRefreshClubs)
  const triggerCreateHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {})
  }, [])
  const createPlusRotate = createPlusSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })
  const startCreateHoldAnimation = useCallback(() => {
    if (!createSpinLoopRef.current) {
      createPlusSpin.setValue(0)
      createSpinLoopRef.current = Animated.loop(
        Animated.timing(createPlusSpin, {
          toValue: 1,
          duration: 680,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      createSpinLoopRef.current.start()
    }
  }, [createPlusSpin])
  const stopCreateHoldAnimation = useCallback(() => {
    createSpinLoopRef.current?.stop()
    createSpinLoopRef.current = null
    Animated.timing(createPlusSpin, { toValue: 0, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [createPlusSpin])
  const openCreateInfoModal = useCallback(() => {
    setShowCreateInfo(true)
  }, [])
  useEffect(() => {
    return () => {
      createSpinLoopRef.current?.stop()
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setRevealEpoch((v) => v + 1)
    }, [])
  )

  const clubsInitialLoading = clubsQuery.isLoading && clubsQuery.data === undefined
  const profileInitialLoading =
    isAuthenticated && profileQuery.isLoading && profileQuery.data === undefined
  const nearbyNeedsProfile = mode === 'nearby'
  const nearbyBlockedByAuth = nearbyNeedsProfile && !isAuthenticated
  const nearbyBlockedByProfile = nearbyNeedsProfile && isAuthenticated && !profileInitialLoading && !normalizedProfileCity
  const modeInitialLoading = clubsInitialLoading || (nearbyNeedsProfile && profileInitialLoading)

  const emptyStateCopy = useMemo(() => {
    if (nearbyBlockedByAuth) {
      return {
        title: 'Sign in required',
        body: 'Sign in and add your city to your profile to discover nearby clubs.',
      }
    }

    if (nearbyBlockedByProfile) {
      return {
        title: 'Add your city first',
        body: 'Update the city in your profile to make the Nearby filter show clubs around you.',
      }
    }

    if (mode === 'my-clubs') {
      return search.trim()
        ? {
            title: 'No matching clubs',
            body: 'None of your clubs match this search yet.',
          }
        : {
            title: 'No clubs yet',
            body: 'Clubs you join or request access to will appear here.',
          }
    }

    if (mode === 'nearby') {
      return search.trim()
        ? {
            title: 'No nearby matches',
            body: `No clubs around ${profileCity} match this search.`,
          }
        : {
            title: 'No nearby clubs found',
            body: `We couldn’t find clubs around ${profileCity} yet.`,
          }
    }

    return search.trim()
      ? {
          title: 'No clubs found',
          body: 'Try another search term or check back later.',
        }
      : {
          title: 'Nothing to discover',
          body: 'Check back later for new clubs in the directory.',
        }
  }, [mode, nearbyBlockedByAuth, nearbyBlockedByProfile, profileCity, search])

  return (
    <PageLayout scroll={false} contentStyle={styles.layoutContent}>
      <View style={styles.page}>
        <View style={styles.headerCard}>
          <View style={styles.searchRow}>
            <View style={styles.searchFieldWrap}>
              <SearchField value={search} onChangeText={setSearch} placeholder="Search clubs..." />
            </View>
            <Pressable
              onPress={() => {
                if (createLongPressTriggeredRef.current) {
                  createLongPressTriggeredRef.current = false
                  return
                }
                openCreateInfoModal()
              }}
              onPressIn={() => {
                triggerCreateHaptic()
                startCreateHoldAnimation()
              }}
              onPressOut={() => {
                stopCreateHoldAnimation()
                if (createLongPressTriggeredRef.current) {
                  createLongPressTriggeredRef.current = false
                  openCreateInfoModal()
                }
              }}
              onLongPress={() => {
                createLongPressTriggeredRef.current = true
                startCreateHoldAnimation()
              }}
              style={({ pressed, hovered }) => [
                styles.createButton,
                hovered && styles.createButtonHovered,
                pressed && styles.createButtonPressed,
              ]}
            >
              <Animated.View style={[styles.createIconCircle, { transform: [{ rotate: createPlusRotate }] }]}>
                <Feather name="plus" size={14} color={colors.primary} />
              </Animated.View>
              <Text style={styles.createButtonText}>Create</Text>
            </Pressable>
          </View>

          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'discover', label: 'Discover' },
              { value: 'my-clubs', label: 'My Clubs' },
              { value: 'nearby', label: 'Nearby' },
            ]}
          />
        </View>

        <SegmentedContentFade activeKey={mode} segmentOrder={['discover', 'my-clubs', 'nearby']} opacityOnly style={styles.listScroll}>
          <PickleRefreshScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listScrollContent}
            showsVerticalScrollIndicator={false}
            refreshing={pullToRefresh.refreshing}
            onRefresh={pullToRefresh.onRefresh}
            bounces
          >
          {modeInitialLoading ? (
            <LoadingBlock label={nearbyNeedsProfile ? 'Finding nearby clubs…' : 'Loading clubs…'} />
          ) : null}

          {clubsQuery.isError ? (
            <EmptyState
              title="Could not load clubs"
              body="Check your connection and API settings (EXPO_PUBLIC_API_URL), then pull to refresh."
            />
          ) : null}

          {!modeInitialLoading && !clubsQuery.isError && !nearbyBlockedByAuth && !nearbyBlockedByProfile && decoratedActiveClubs.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>{listHeading}</Text>
              {decoratedActiveClubs.map((club, index) => (
                <StaggeredReveal key={club.id} index={index} triggerKey={`${revealEpoch}-${mode}-${search.trim()}`}>
                  <ClubListItem
                    club={club}
                    mode={mode}
                    isAuthenticated={isAuthenticated}
                    toggleFollow={toggleFollow}
                  />
                </StaggeredReveal>
              ))}
            </View>
          ) : null}

          {!modeInitialLoading && !clubsQuery.isError && nearbyBlockedByAuth ? (
            <View style={styles.emptyStateWrap}>
              <AuthRequiredCard
                title="Sign in required"
                body="Sign in and add your city to your profile to discover nearby clubs."
              />
            </View>
          ) : null}

          {!modeInitialLoading && !clubsQuery.isError && !nearbyBlockedByAuth && (nearbyBlockedByProfile || decoratedActiveClubs.length === 0) ? (
            <View style={styles.emptyStateWrap}>
              <EmptyState title={emptyStateCopy.title} body={emptyStateCopy.body} />
              {nearbyBlockedByProfile ? (
                <ActionButton
                  label="Add city"
                  variant="outline"
                  onPress={() => router.push({ pathname: '/profile/edit', params: { anchor: 'city' } })}
                />
              ) : null}
            </View>
          ) : null}
          </PickleRefreshScrollView>
        </SegmentedContentFade>

        <AppBottomSheet
          open={showCreateInfo}
          onClose={() => setShowCreateInfo(false)}
          title="Create Club"
          titleBelow={
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>
              Club creation is currently available only in the web version of Piqle.
            </Text>
          }
          footer={
            <ActionButton
              label="Open Piqle Web"
              onPress={async () => {
                const url = buildWebUrl('/clubs/new')
                await Linking.openURL(url)
                setShowCreateInfo(false)
              }}
            />
          }
        >
          <Text style={{ color: colors.textMuted, lineHeight: 20 }}>
            Open web to create a new club, configure details, and manage membership settings.
          </Text>
        </AppBottomSheet>
      </View>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  layoutContent: {
    paddingBottom: 0,
  },
  page: {
    flex: 1,
    gap: spacing.md,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    gap: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchFieldWrap: {
    flex: 1,
    minWidth: 0,
  },
  createButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimaryTint,
  },
  createButtonPressed: {
    opacity: 0.9,
  },
  createButtonHovered: {
    backgroundColor: colors.brandPrimaryTint,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
  },
  emptyStateWrap: {
    gap: spacing.md,
  },
})
