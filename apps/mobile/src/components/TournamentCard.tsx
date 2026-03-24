<<<<<<< Updated upstream
import { Feather, MaterialIcons } from '@expo/vector-icons'
import { useMemo } from 'react'
=======
import { Feather } from '@expo/vector-icons'
>>>>>>> Stashed changes
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatLocation, formatMoney } from '../lib/formatters'
import { getTournamentSlotMetrics } from '../lib/tournamentSlots'
<<<<<<< Updated upstream
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
=======
import { palette, radius, spacing } from '../lib/theme'
import { RatingStarIcon } from './icons/RatingStarIcon'
>>>>>>> Stashed changes
import { OptionalLinearGradient } from './OptionalLinearGradient'
import { TournamentThumbnail } from './TournamentThumbnail'
import { Pill, SurfaceCard } from './ui'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const formatTournamentDateRange = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start) return 'Date TBD'

  const startDate = new Date(start)
  if (!end) return dateFormatter.format(startDate)

  const endDate = new Date(end)
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()

  if (sameMonth) {
    return `${startDate.toLocaleString('en-US', { month: 'short' })} ${startDate.getDate()}-${endDate.getDate()}`
  }

  return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`
}

const formatTournamentFormat = (format?: string | null) => {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elimination'
    case 'ROUND_ROBIN':
      return 'Round Robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy League'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League Round Robin'
    case 'ONE_DAY_LADDER':
      return 'One Day Ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder League'
    default:
      return 'Tournament'
  }
}

type TournamentSummary = {
  id: string
  title: string
  image?: string | null
  startDate: string | Date
  endDate: string | Date
  venueName?: string | null
  venueAddress?: string | null
  entryFee?: string | number | null
  entryFeeCents?: number | null
  format?: string | null
  divisions: Array<{
    id: string
    name: string
    teamKind?: string | null
    maxTeams?: number | null
    _count?: { teams?: number }
    teams?: Array<{
      teamPlayers?: Array<{
        slotIndex?: number | null
      } | null> | null
    } | null> | null
  }>
  _count?: { players?: number }
  user?: {
    id: string
    name?: string | null
    email?: string | null
  } | null
  feedbackSummary?: {
    averageRating: number | null
    total: number
    canPublish: boolean
  } | null
}

export const TournamentCard = ({
  tournament,
  onPress,
  statusLabel,
  statusTone = 'success',
  secondaryStatusLabel,
  secondaryStatusTone = 'warning',
}: {
  tournament: TournamentSummary
  onPress: () => void
  statusLabel?: string | null
  statusTone?: 'muted' | 'primary' | 'danger' | 'success' | 'warning'
  secondaryStatusLabel?: string | null
  secondaryStatusTone?: 'muted' | 'primary' | 'danger' | 'success' | 'warning'
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const feeLabel = typeof tournament.entryFeeCents === 'number'
    ? formatMoney(tournament.entryFeeCents)
    : tournament.entryFee && Number(tournament.entryFee) > 0
    ? `$${Number(tournament.entryFee).toFixed(2)}`
    : 'Free'
  const slotMetrics = getTournamentSlotMetrics(tournament)
  const teamCount = tournament.divisions.reduce((sum, division) => sum + Number(division._count?.teams ?? 0), 0)
  const teamCapacity = tournament.divisions.reduce((sum, division) => sum + Number(division.maxTeams ?? 0), 0)
  const playerCount = Number(tournament._count?.players ?? 0)
  const hasSlotMetrics = slotMetrics.createdSlots !== null && slotMetrics.filledSlots !== null && slotMetrics.createdSlots > 0
  const progress = hasSlotMetrics
    ? Math.min(100, (slotMetrics.filledSlots! / slotMetrics.createdSlots!) * 100)
    : teamCapacity > 0
    ? Math.min(100, (teamCount / teamCapacity) * 100)
    : 0
  const spotsLeft = hasSlotMetrics ? slotMetrics.openSlots : null
  const occupancyLabel =
    hasSlotMetrics
      ? `${slotMetrics.filledSlots} / ${slotMetrics.createdSlots} spots`
      : teamCapacity > 0
      ? `${teamCount} / ${teamCapacity} teams`
      : playerCount > 0
      ? `${playerCount} players registered`
      : 'Open registration'
  const progressWidth = progress > 0 ? `${Math.max(progress, 8)}%` : '0%'
  const showPublicRating = Boolean(tournament.feedbackSummary?.canPublish && tournament.feedbackSummary?.averageRating)

  return (
    <Pressable onPress={onPress}>
      <SurfaceCard padded={false}>
        <View style={styles.hero}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={[colors.brandPrimaryTint, colors.brandPurpleTint, 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          />
          <View style={styles.heroHeader}>
            <TournamentThumbnail imageUri={tournament.image ?? null} size={48} />
            <View style={styles.heroMain}>
              <Text numberOfLines={1} style={styles.title}>
                {tournament.title}
              </Text>
              <View style={styles.formatRow}>
<<<<<<< Updated upstream
                <Feather name="award" size={14} color={colors.textMuted} />
=======
                <Feather name="award" size={14} color={palette.primary} />
>>>>>>> Stashed changes
                <Text style={styles.formatText}>{formatTournamentFormat(tournament.format)}</Text>
              </View>
            </View>
            {statusLabel || secondaryStatusLabel ? (
              <View style={styles.statusBadgeRow}>
                {statusLabel ? <Pill label={statusLabel} tone={statusTone} /> : null}
                {secondaryStatusLabel ? <Pill label={secondaryStatusLabel} tone={secondaryStatusTone} /> : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <Text style={styles.metaText}>{formatTournamentDateRange(tournament.startDate, tournament.endDate)}</Text>
            </View>
            <View style={styles.metaCell}>
<<<<<<< Updated upstream
              <Feather name="map-pin" size={16} color={colors.accent} />
=======
              <Feather name="map-pin" size={16} color={palette.primary} />
>>>>>>> Stashed changes
              <Text numberOfLines={1} style={styles.metaText}>
                {formatLocation([tournament.venueName, tournament.venueAddress])}
              </Text>
            </View>
          </View>

          <View style={styles.ratingRow}>
            <RatingStarIcon size={16} filled color="#F4B000" />
            {showPublicRating ? (
              <Text style={styles.ratingText}>{tournament.feedbackSummary!.averageRating!.toFixed(1)}</Text>
            ) : (
              <Text style={styles.ratingTextMuted}>No rating yet</Text>
            )}
          </View>

          {tournament.divisions?.length ? (
            <View style={styles.divisionRow}>
              {tournament.divisions.slice(0, 3).map((division) => (
                <Pill key={division.id} label={division.name} />
              ))}
              {tournament.divisions.length > 3 ? <Pill label={`+${tournament.divisions.length - 3}`} /> : null}
            </View>
          ) : null}

          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <View style={styles.progressMetric}>
<<<<<<< Updated upstream
                <Feather name="users" size={16} color={colors.textMuted} />
=======
                <Feather name="users" size={16} color={palette.primary} />
>>>>>>> Stashed changes
                <Text style={styles.progressText}>{occupancyLabel}</Text>
              </View>
              <View style={styles.priceTag}>
                <Feather name="dollar-sign" size={16} color={colors.primary} />
                <Text style={styles.priceText}>{feeLabel}</Text>
              </View>
            </View>
            {hasSlotMetrics || teamCapacity > 0 ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: progressWidth }]} />
              </View>
            ) : null}
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footer}>
              {spotsLeft !== null ? `${spotsLeft} spots left` : 'View registration details'}
            </Text>
            <View style={styles.footerAction}>
              <Text style={styles.footerActionText}>View Details</Text>
              <Feather name="arrow-right" size={16} color={colors.primary} />
            </View>
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    minHeight: 88,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandPrimaryBorder,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  formatText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  divisionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingTextMuted: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  progressBlock: {
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  progressMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
    flexShrink: 1,
  },
  priceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  footerRow: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footer: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerActionText: {
    color: colors.primary,
    fontWeight: '700',
  },
})
