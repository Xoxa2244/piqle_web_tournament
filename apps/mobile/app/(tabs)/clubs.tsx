import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ClubCard } from '../../src/components/ClubCard'
import {
  EmptyState,
  LoadingBlock,
  SearchField,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ClubsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'discover' | 'my-clubs' | 'nearby'>('discover')
  const api = trpc as any
  const utils = trpc.useUtils() as any

  const clubsQuery = api.club.list.useQuery(
    search.trim() ? { query: search.trim() } : undefined
  )
  const toggleFollow = api.club.toggleFollow.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.list.invalidate(), utils.club.listMyChatClubs.invalidate()])
    },
  })
  const cancelRequest = api.club.cancelJoinRequest.useMutation({
    onSuccess: async () => {
      await utils.club.list.invalidate()
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

  return (
    <PageLayout>
      <View style={styles.headerCard}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search clubs..." />

        <View style={styles.segment}>
          {([
            { key: 'discover', label: 'Discover' },
            { key: 'my-clubs', label: 'My Clubs' },
            { key: 'nearby', label: 'Nearby' },
          ] as const).map((item) => {
            const active = mode === item.key
            return (
              <Pressable
                key={item.key}
                onPress={() => setMode(item.key)}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {clubsQuery.isLoading ? <LoadingBlock label="Loading clubs…" /> : null}

      {!clubsQuery.isLoading && (clubsQuery.data?.length ?? 0) === 0 ? (
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
                onPress={() => router.push(`/clubs/${club.id}`)}
                onJoin={
                  isAuthenticated
                    ? () => toggleFollow.mutate({ clubId: club.id })
                    : () => router.push('/sign-in')
                }
                joinLoading={toggleFollow.isPending}
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
  segment: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  segmentItemActive: {
    backgroundColor: palette.surface,
    shadowColor: palette.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
  },
  segmentLabelActive: {
    color: palette.text,
  },
  sectionTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 18,
  },
})
