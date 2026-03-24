import { memo, useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { ClubCard } from '../../src/components/ClubCard'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SegmentedControl,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
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
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'discover' | 'my-clubs' | 'nearby'>('discover')
  const api = trpc as any
  const utils = (trpc as any).useUtils()

  const clubsQuery = api.club.list.useQuery(
    search.trim() ? { query: search.trim() } : undefined
  )
  const profileQuery = api.user.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
  })
  const toggleFollow = api.club.toggleFollow.useMutation({
    onSuccess: (_data: unknown, variables: { clubId: string }) => {
      void Promise.all([
        utils.club.list.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
        utils.club.get.invalidate({ id: variables.clubId }),
      ])
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
        body: 'Update your profile city to make the Nearby filter show clubs around you.',
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
          <SearchField value={search} onChangeText={setSearch} placeholder="Search clubs..." />

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
              {decoratedActiveClubs.map((club) => (
                <ClubListItem
                  key={club.id}
                  club={club}
                  mode={mode}
                  isAuthenticated={isAuthenticated}
                  toggleFollow={toggleFollow}
                />
              ))}
            </View>
          ) : null}

          {!modeInitialLoading && !clubsQuery.isError && (nearbyBlockedByAuth || nearbyBlockedByProfile || decoratedActiveClubs.length === 0) ? (
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
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
  },
  emptyStateWrap: {
    gap: spacing.md,
  },
})
