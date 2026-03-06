import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'

import { ClubCard } from '../../src/components/ClubCard'
import { ActionButton, EmptyState, InputField, LoadingBlock, Screen, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ClubsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const utils = trpc.useUtils()

  const clubsQuery = trpc.club.list.useQuery(
    search.trim() ? { query: search.trim() } : undefined
  )
  const toggleFollow = trpc.club.toggleFollow.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.list.invalidate(), utils.club.listMyChatClubs.invalidate()])
    },
  })
  const cancelRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: async () => {
      await utils.club.list.invalidate()
    },
  })

  const myClubs = useMemo(
    () => (clubsQuery.data ?? []).filter((club) => club.isFollowing || club.isAdmin || club.isJoinPending),
    [clubsQuery.data]
  )
  const discoverClubs = useMemo(
    () => (clubsQuery.data ?? []).filter((club) => !club.isFollowing && !club.isAdmin && !club.isJoinPending),
    [clubsQuery.data]
  )

  return (
    <Screen
      title="Clubs"
      subtitle="Follow venues and communities to unlock announcements, tournaments, and club chat."
      right={!isAuthenticated ? <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} /> : undefined}
    >
      <SurfaceCard>
        <InputField value={search} onChangeText={setSearch} placeholder="Search clubs" />
      </SurfaceCard>

      {clubsQuery.isLoading ? <LoadingBlock label="Loading clubs…" /> : null}

      {!clubsQuery.isLoading && (clubsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="No clubs found" body="Try another search term or check back later." />
      ) : null}

      {isAuthenticated && myClubs.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title="My clubs" subtitle="Places where you already belong or have a pending request." />
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
        <SectionTitle title={isAuthenticated ? 'Discover clubs' : 'All clubs'} subtitle="Tap a club to read announcements, browse events, and join." />
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

      <SurfaceCard>
        <Text style={{ color: palette.text, fontWeight: '700', fontSize: 16 }}>Why clubs matter</Text>
        <Text style={{ marginTop: 8, color: palette.textMuted, lineHeight: 20 }}>
          Club membership powers the same chat, announcements, and join policies you already have on web. The app simply exposes the user side in a mobile flow.
        </Text>
      </SurfaceCard>
    </Screen>
  )
}
