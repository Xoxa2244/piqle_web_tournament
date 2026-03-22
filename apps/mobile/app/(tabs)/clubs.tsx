import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ClubCard } from '../../src/components/ClubCard'
import {
  EmptyState,
  LoadingBlock,
  SearchField,
  SegmentedControl,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
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

  const onRefreshClubs = useCallback(async () => {
    await clubsQuery.refetch()
  }, [clubsQuery])

  const pullToRefresh = usePullToRefresh(onRefreshClubs)

  const clubsInitialLoading = clubsQuery.isLoading && clubsQuery.data === undefined

  return (
    <PageLayout pullToRefresh={pullToRefresh}>
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
              <ClubCard club={club} onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })} />
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
                club={club}
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
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  headerCard: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 18,
  },
})
