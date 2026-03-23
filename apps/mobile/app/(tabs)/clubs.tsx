import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { ClubCard } from '../../src/components/ClubCard'
import {
  EmptyState,
  LoadingBlock,
  SearchField,
  SegmentedControl,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { palette, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

export default function ClubsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'discover' | 'my-clubs' | 'nearby'>('discover')
  const api = trpc as any
  const utils = (trpc as any).useUtils()

  const clubsQuery = api.club.list.useQuery(
    search.trim() ? { query: search.trim() } : undefined
  )
  const toggleFollow = api.club.toggleFollow.useMutation({
    onSuccess: (_data: unknown, variables: { clubId: string }) => {
      void Promise.all([
        utils.club.list.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
        utils.club.get.invalidate({ id: variables.clubId }),
      ])
    },
  })
  const cancelRequest = api.club.cancelJoinRequest.useMutation({
    onSuccess: () => {
      void utils.club.list.invalidate()
    },
  })

  const myClubs = useMemo(
    () => ((clubsQuery.data ?? []) as any[]).filter((club) => club.isFollowing || club.isAdmin || club.isJoinPending),
    [clubsQuery.data]
  )
  const discoverClubs = useMemo(
    () => ((clubsQuery.data ?? []) as any[]).filter((club) => !club.isFollowing && !club.isAdmin && !club.isJoinPending),
    [clubsQuery.data]
  )

  const visibleMyClubs = useMemo(() => {
    if (!isAuthenticated) return []
    if (mode !== 'my-clubs') return myClubs
    return myClubs
  }, [isAuthenticated, mode, myClubs])

  const visibleDiscoverClubs = useMemo(() => {
    if (mode === 'my-clubs') return []
    // Nearby mode is visual-only until we have geolocation + backend distance support.
    return discoverClubs
  }, [discoverClubs, mode])

  const visibleClubIds = useMemo(
    () =>
      [...new Set([...visibleMyClubs.map((c) => c.id), ...visibleDiscoverClubs.map((c) => c.id)])].slice(0, 200),
    [visibleMyClubs, visibleDiscoverClubs],
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

  const onRefreshClubs = useCallback(async () => {
    await clubsQuery.refetch()
  }, [clubsQuery])

  const pullToRefresh = usePullToRefresh(onRefreshClubs)

  const clubsInitialLoading = clubsQuery.isLoading && clubsQuery.data === undefined

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
          {clubsInitialLoading ? <LoadingBlock label="Loading clubs…" /> : null}

          {clubsQuery.isError ? (
            <EmptyState
              title="Could not load clubs"
              body="Check your connection and API settings (EXPO_PUBLIC_API_URL), then pull to refresh."
            />
          ) : null}

          {!clubsInitialLoading && !clubsQuery.isError && (clubsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No clubs found" body="Try another search term or check back later." />
          ) : null}

          {isAuthenticated && visibleMyClubs.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>My clubs</Text>
              {visibleMyClubs.map((club) => (
                <View key={club.id} style={{ gap: 10 }}>
                  <ClubCard
                    club={{ ...club, feedbackSummary: feedbackWithDevFallback[club.id] ?? null }}
                    onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {visibleDiscoverClubs.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>{isAuthenticated ? 'Discover clubs' : 'All clubs'}</Text>
              {visibleDiscoverClubs.map((club) => (
                <View key={club.id} style={{ gap: 10 }}>
                  <ClubCard
                    club={{ ...club, feedbackSummary: feedbackWithDevFallback[club.id] ?? null }}
                    onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })}
                    onJoin={
                      isAuthenticated
                        ? () => {
                            router.push({ pathname: '/clubs/[id]', params: { id: club.id } })
                            toggleFollow.mutate({ clubId: club.id })
                          }
                        : () => router.push('/sign-in')
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}
        </PickleRefreshScrollView>
      </View>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
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
    color: palette.text,
    fontWeight: '700',
    fontSize: 18,
  },
})
