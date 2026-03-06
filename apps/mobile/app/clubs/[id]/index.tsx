import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { ActionButton, EmptyState, LoadingBlock, Pill, Screen, SectionTitle, SurfaceCard } from '../../../src/components/ui'
import { buildWebUrl } from '../../../src/lib/config'
import { formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = params.id
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })
  const toggleFollow = trpc.club.toggleFollow.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
    },
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
    },
  })

  if (clubQuery.isLoading) {
    return <Screen title="Club"><LoadingBlock label="Loading club…" /></Screen>
  }

  if (!clubQuery.data) {
    return <Screen title="Club"><EmptyState title="Club not found" body="This club could not be loaded." /></Screen>
  }

  const club = clubQuery.data

  return (
    <Screen title={club.name} subtitle={formatLocation([club.address, club.city, club.state, club.country])}>
      <SurfaceCard>
        <View style={styles.pillRow}>
          <Pill label={club.kind === 'VENUE' ? 'Venue' : 'Community'} />
          {club.isVerified ? <Pill label="Verified" tone="primary" /> : null}
          <Pill label={`${club.followersCount} members`} tone="success" />
        </View>

        {club.description ? <Text style={styles.body}>{club.description}</Text> : null}

        <View style={styles.actions}>
          {club.isAdmin ? null : club.isFollowing ? (
            <ActionButton label="Leave club" variant="secondary" loading={toggleFollow.isPending} onPress={() => toggleFollow.mutate({ clubId })} />
          ) : club.isJoinPending ? (
            <ActionButton label="Cancel join request" variant="secondary" loading={cancelJoinRequest.isPending} onPress={() => cancelJoinRequest.mutate({ clubId })} />
          ) : (
            <ActionButton
              label={club.joinPolicy === 'APPROVAL' ? 'Request to join' : 'Join club'}
              onPress={() => (isAuthenticated ? toggleFollow.mutate({ clubId }) : router.push('/sign-in'))}
            />
          )}

          {(club.isFollowing || club.isAdmin) ? (
            <ActionButton
              label="Open club chat"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/chats/club/[clubId]',
                  params: { clubId: club.id, name: club.name },
                })
              }
            />
          ) : null}

          {club.courtReserveUrl ? (
            <ActionButton label="Booking courts" variant="secondary" onPress={() => Linking.openURL(club.courtReserveUrl!)} />
          ) : null}
        </View>
      </SurfaceCard>

      {club.announcements.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Announcements" subtitle="These posts come from the same club admin tools available on web." />
          {club.announcements.map((announcement) => (
            <SurfaceCard key={announcement.id}>
              {announcement.title ? <Text style={styles.announcementTitle}>{announcement.title}</Text> : null}
              <Text style={styles.body}>{announcement.body}</Text>
              <Text style={styles.smallMeta}>Posted {formatDateTime(announcement.createdAt)}{announcement.createdByUser?.name ? ` · ${announcement.createdByUser.name}` : ''}</Text>
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      {club.tournaments.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Upcoming tournaments" subtitle="Club events can still be private on web; the mobile app reuses the same list." />
          {club.tournaments.map((tournament) => (
            <SurfaceCard key={tournament.id}>
              <Pressable onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: tournament.id } })}>
                <Text style={styles.eventTitle}>{tournament.title}</Text>
                <Text style={styles.smallMeta}>{formatDateTime(tournament.startDate)} · {tournament.format}</Text>
              </Pressable>
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      <SurfaceCard>
        <SectionTitle title="Open on web" subtitle="For full member moderation and club management, the web interface remains the source of truth." />
        <ActionButton label="Open club page in browser" variant="secondary" onPress={() => Linking.openURL(buildWebUrl(`/clubs/${club.id}`))} />
      </SurfaceCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  body: {
    marginTop: spacing.md,
    color: palette.text,
    lineHeight: 22,
  },
  actions: {
    marginTop: spacing.md,
    gap: 10,
  },
  announcementTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  smallMeta: {
    marginTop: spacing.sm,
    color: palette.textMuted,
    fontSize: 12,
  },
  eventTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
})
