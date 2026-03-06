import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateRange, formatLocation, formatMoney } from '../lib/formatters'
import { palette, spacing } from '../lib/theme'
import { AvatarBadge, Pill, SurfaceCard } from './ui'

type TournamentSummary = {
  id: string
  title: string
  startDate: string | Date
  endDate: string | Date
  venueName?: string | null
  venueAddress?: string | null
  entryFee?: string | number | null
  entryFeeCents?: number | null
  divisions: Array<{ id: string; name: string }>
  likes?: number
  dislikes?: number
  user?: {
    id: string
    name?: string | null
    email?: string | null
  } | null
}

export const TournamentCard = ({
  tournament,
  onPress,
  statusLabel,
  secondaryStatus,
}: {
  tournament: TournamentSummary
  onPress: () => void
  statusLabel?: string | null
  secondaryStatus?: string | null
}) => {
  const fee = typeof tournament.entryFeeCents === 'number'
    ? formatMoney(tournament.entryFeeCents)
    : tournament.entryFee && Number(tournament.entryFee) > 0
    ? `$${Number(tournament.entryFee).toFixed(2)}`
    : 'Free'

  return (
    <Pressable onPress={onPress}>
      <SurfaceCard>
        <View style={styles.cardHeader}>
          <AvatarBadge label={tournament.title} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{tournament.title}</Text>
            <Text style={styles.meta}>{formatDateRange(tournament.startDate, tournament.endDate)}</Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          {statusLabel ? <Pill label={statusLabel} tone="primary" /> : null}
          {secondaryStatus ? <Pill label={secondaryStatus} /> : null}
          <Pill label={fee} tone={fee === 'Free' ? 'success' : 'muted'} />
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Venue</Text>
          <Text style={styles.value}>{formatLocation([tournament.venueName, tournament.venueAddress])}</Text>
        </View>

        {tournament.divisions?.length ? (
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Divisions</Text>
            <Text style={styles.value}>{tournament.divisions.slice(0, 4).map((division) => division.name).join(' · ')}</Text>
          </View>
        ) : null}

        {tournament.user ? (
          <Text style={styles.footer}>Director: {tournament.user.name || tournament.user.email || 'Organizer'}</Text>
        ) : null}
      </SurfaceCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cardHeader: {
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
  infoBlock: {
    marginTop: spacing.md,
    gap: 4,
  },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.md,
    color: palette.textMuted,
    fontSize: 13,
  },
})
