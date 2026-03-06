import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ClubCard } from '../../src/components/ClubCard'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SurfaceCard,
} from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ClubsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
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

  return (
    <PageLayout>
      <SurfaceCard tone="soft">
        <SearchField value={search} onChangeText={setSearch} placeholder="Search clubs" />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
          <ActionButton label="Near Me" variant="secondary" />
          <View style={{ flex: 1 }} />
          <ActionButton label="Create Club" onPress={() => router.push('/sign-in')} />
        </View>
        <View style={styles.modeSwitch}>
          {(['discover', 'my-clubs', 'nearby'] as const).map((value) => {
            const active = value === 'discover'
            return (
              <View key={value} style={[styles.modeButton, active && styles.modeButtonActive]}>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                  {value === 'discover' ? 'Discover' : value === 'my-clubs' ? 'My Clubs' : 'Nearby'}
                </Text>
              </View>
            )
          })}
        </View>
      </SurfaceCard>

      {clubsQuery.isLoading ? <LoadingBlock label="Loading clubs…" /> : null}

      {!clubsQuery.isLoading && (clubsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="No clubs found" body="Try another search term or check back later." />
      ) : null}

      {isAuthenticated && myClubs.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>My clubs</Text>
          {myClubs.map((club) => (
            <View key={club.id} style={{ gap: 10 }}>
              <ClubCard club={club} onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })} />
              {club.isAdmin ? null : club.isFollowing ? (
                <ActionButton
                  label="Leave club"
                  variant="secondary"
                  loading={toggleFollow.isPending}
                  onPress={() => toggleFollow.mutate({ clubId: club.id })}
                />
              ) : club.isJoinPending ? (
                <ActionButton
                  label="Cancel request"
                  variant="secondary"
                  loading={cancelRequest.isPending}
                  onPress={() => cancelRequest.mutate({ clubId: club.id })}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>{isAuthenticated ? 'Discover clubs' : 'All clubs'}</Text>
        {discoverClubs.map((club) => (
          <View key={club.id} style={{ gap: 10 }}>
            <ClubCard club={club} onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })} />
            {club.isAdmin ? null : club.isJoinPending ? (
              <ActionButton
                label="Cancel request"
                variant="secondary"
                loading={cancelRequest.isPending}
                onPress={() => cancelRequest.mutate({ clubId: club.id })}
              />
            ) : (
              <ActionButton
                label={club.joinPolicy === 'APPROVAL' ? 'Request to join' : 'Join club'}
                loading={toggleFollow.isPending}
                onPress={() => (isAuthenticated ? toggleFollow.mutate({ clubId: club.id }) : router.push('/sign-in'))}
              />
            )}
          </View>
        ))}
      </View>

      <SurfaceCard tone="hero">
        <Text style={{ color: palette.text, fontWeight: '700', fontSize: 16 }}>Why clubs matter</Text>
        <Text style={{ marginTop: 8, color: palette.textMuted, lineHeight: 20 }}>
          Club membership powers the same chat, announcements, and join policies you already have on web. The app simply exposes the user side in a mobile flow.
        </Text>
      </SurfaceCard>
    </PageLayout>
  )
}

const styles = {
  modeSwitch: {
    marginTop: spacing.md,
    flexDirection: 'row' as const,
    gap: 8,
    backgroundColor: palette.surface,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 999,
  },
  modeButtonActive: {
    backgroundColor: palette.primary,
  },
  modeLabel: {
    color: palette.textMuted,
    fontWeight: '700' as const,
  },
  modeLabelActive: {
    color: palette.white,
  },
  sectionTitle: {
    color: palette.text,
    fontWeight: '700' as const,
    fontSize: 18,
  },
}
