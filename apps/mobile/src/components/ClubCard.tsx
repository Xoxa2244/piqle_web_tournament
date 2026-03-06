import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime, formatLocation, formatMoney } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'
import { OptionalLinearGradient } from './OptionalLinearGradient'
import { Pill, SurfaceCard } from './ui'

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
      <SurfaceCard padded={false}>
        <View style={styles.hero}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={['rgba(40, 205, 65, 0.16)', 'rgba(82, 224, 104, 0.12)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          />
          <View style={styles.heroIcon}>
            <Feather name={club.kind === 'VENUE' ? 'map-pin' : 'users'} size={20} color={palette.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{club.name}</Text>
            <Text style={styles.meta}>{formatLocation([club.city, club.state])}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.pillRow}>
            <Pill label={club.kind === 'VENUE' ? 'Venue' : 'Community'} />
            {club.isVerified ? <Pill label="Verified" tone="primary" /> : null}
            {club.isFollowing ? <Pill label="Joined" tone="success" /> : null}
            {club.isJoinPending ? <Pill label="Pending" tone="warning" /> : null}
          </View>

          {club.nextTournament ? (
            <View style={styles.eventBox}>
              <View style={styles.eventHeading}>
                <Text style={styles.eventTitle}>{club.nextTournament.title}</Text>
                <Feather name="chevron-right" size={18} color={palette.primary} />
              </View>
              <View style={styles.eventMetaRow}>
                <Feather name="calendar" size={15} color={palette.primary} />
                <Text style={styles.eventMeta}>{formatDateTime(club.nextTournament.startDate)}</Text>
              </View>
              <View style={styles.eventMetaRow}>
                <Feather name="credit-card" size={15} color={palette.accent} />
                <Text style={styles.eventMeta}>{formatMoney(club.nextTournament.entryFeeCents ?? 0)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No upcoming events</Text>
              <Text style={styles.emptyText}>Club updates and tournaments will appear here once they are published.</Text>
            </View>
          )}
        </View>
      </SurfaceCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: palette.hero,
    borderBottomWidth: 1,
    borderBottomColor: palette.brandPrimaryBorder,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandAccent,
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
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  eventBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    gap: 8,
  },
  eventHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eventTitle: {
    color: palette.text,
    fontWeight: '700',
    flex: 1,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  emptyBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
  },
  emptyTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    color: palette.textMuted,
    marginTop: 6,
    lineHeight: 20,
  },
})
