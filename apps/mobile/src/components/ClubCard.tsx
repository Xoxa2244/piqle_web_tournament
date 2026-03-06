import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime, formatLocation, formatMoney } from '../lib/formatters'
import { palette, spacing } from '../lib/theme'
import { AvatarBadge, Pill, SurfaceCard } from './ui'

type ClubSummary = {
  id: string
  name: string
  city?: string | null
  state?: string | null
  kind: 'VENUE' | 'COMMUNITY'
  isVerified?: boolean
  isFollowing?: boolean
  isJoinPending?: boolean
  nextTournament?: {
    title: string
    startDate: string | Date
    entryFeeCents?: number | null
  } | null
}

export const ClubCard = ({ club, onPress }: { club: ClubSummary; onPress: () => void }) => {
  return (
    <Pressable onPress={onPress}>
      <SurfaceCard>
        <View style={styles.header}>
          <AvatarBadge label={club.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{club.name}</Text>
            <Text style={styles.meta}>{formatLocation([club.city, club.state])}</Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          <Pill label={club.kind === 'VENUE' ? 'Venue' : 'Community'} />
          {club.isVerified ? <Pill label="Verified" tone="primary" /> : null}
          {club.isFollowing ? <Pill label="Joined" tone="success" /> : null}
          {club.isJoinPending ? <Pill label="Pending" tone="muted" /> : null}
        </View>

        {club.nextTournament ? (
          <View style={styles.eventBox}>
            <Text style={styles.eventTitle}>{club.nextTournament.title}</Text>
            <Text style={styles.eventMeta}>{formatDateTime(club.nextTournament.startDate)}</Text>
            <Text style={styles.eventMeta}>{formatMoney(club.nextTournament.entryFeeCents ?? 0)}</Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>No upcoming club events yet.</Text>
        )}
      </SurfaceCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: palette.textMuted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md,
  },
  eventBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    gap: 4,
  },
  eventTitle: {
    color: palette.text,
    fontWeight: '700',
  },
  eventMeta: {
    color: palette.textMuted,
  },
  emptyText: {
    marginTop: spacing.md,
    color: palette.textMuted,
  },
})
