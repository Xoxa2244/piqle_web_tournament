<<<<<<< Updated upstream
import { Feather, MaterialIcons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { formatLocation } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
=======
import { Feather } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { formatLocation } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'
import { EntityImage } from './EntityImage'
import { RatingStarIcon } from './icons/RatingStarIcon'
>>>>>>> Stashed changes
import { OptionalLinearGradient } from './OptionalLinearGradient'
import { SurfaceCard } from './ui'

type ClubSummary = {
  id: string
  name: string
  city?: string | null
  state?: string | null
  logoUrl?: string | null
  kind: 'VENUE' | 'COMMUNITY'
  joinPolicy?: 'OPEN' | 'APPROVAL'
  isVerified?: boolean
  isFollowing?: boolean
  isAdmin?: boolean
  role?: string | null
  isJoinPending?: boolean
  followersCount?: number
  hasBooking?: boolean
  nextTournament?: {
    title: string
    startDate: string | Date
    id?: string
  } | null
  feedbackSummary?: {
    averageRating: number | null
    total: number
    canPublish: boolean
  } | null
}

type ClubCardProps = {
  club: ClubSummary
  onPress: () => void
  onJoin?: () => void
  joinLoading?: boolean
}

export const ClubCard = ({ club, onPress, onJoin, joinLoading }: ClubCardProps) => {
<<<<<<< Updated upstream
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const showMember = Boolean(club.isFollowing || club.isAdmin)
=======
  const isOwner = String(club.role ?? '').toUpperCase() === 'OWNER'
  const isAdmin = Boolean(club.isAdmin && !isOwner)
  const showMember = Boolean(club.isFollowing && !club.isAdmin && !isOwner)
  const hasPrivilegedRole = Boolean(isOwner || isAdmin)
  const canJoin = Boolean(!showMember && !hasPrivilegedRole && !club.isJoinPending)
>>>>>>> Stashed changes
  const showPending = Boolean(!showMember && club.isJoinPending)
  const memberCount = typeof club.followersCount === 'number' ? Math.max(1, club.followersCount) : 1
  const showPublicRating = Boolean(club.feedbackSummary?.canPublish && club.feedbackSummary?.averageRating)

  return (
    <Pressable onPress={onPress}>
      <SurfaceCard padded={false} style={styles.card}>
<<<<<<< Updated upstream
        <View style={styles.imageWrap}>
          {club.logoUrl ? (
            <Image source={{ uri: club.logoUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <OptionalLinearGradient
              pointerEvents="none"
              colors={[colors.brandPrimaryTint, colors.brandPurpleTint, 'rgba(0, 0, 0, 0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.imagePlaceholder}
=======
        <View style={styles.headerSection}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={['rgba(40, 205, 65, 0.10)', 'rgba(82, 224, 104, 0.06)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          />
          <View style={styles.headerRow}>
            <EntityImage
              uri={club.logoUrl}
              style={styles.logo}
              resizeMode="cover"
              placeholderResizeMode="contain"
>>>>>>> Stashed changes
            />

<<<<<<< Updated upstream
          {showMember ? (
            <View style={[styles.statusBadge, styles.statusBadgeMember]}>
              <Feather name={club.isAdmin ? 'shield' : 'check'} size={14} color={colors.white} />
              <Text style={styles.statusBadgeText}>{club.isAdmin ? 'Admin' : 'Member'}</Text>
            </View>
          ) : showPending ? (
            <View style={[styles.statusBadge, styles.statusBadgePending]}>
              <Feather name="clock" size={14} color={colors.text} />
              <Text style={[styles.statusBadgeText, styles.statusBadgeTextDark]}>Pending</Text>
            </View>
          ) : null}
=======
            <View style={styles.headerMain}>
              <Text style={styles.name} numberOfLines={2}>
                {club.name}
              </Text>
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={16} color={palette.primary} />
                <Text style={styles.location} numberOfLines={1}>
                  {formatLocation([club.city, club.state])}
                </Text>
              </View>
            </View>
>>>>>>> Stashed changes

            <View style={styles.ratingRow}>
              <RatingStarIcon size={16} filled color="#F4B000" />
              {showPublicRating ? (
                <Text style={styles.ratingText}>{club.feedbackSummary!.averageRating!.toFixed(1)}</Text>
              ) : (
              <Text style={styles.ratingTextMuted}>New</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
<<<<<<< Updated upstream
          <Text style={styles.name} numberOfLines={2}>
            {club.name}
          </Text>
          <Text style={styles.location}>{formatLocation([club.city, club.state])}</Text>

          {memberCount !== null ? (
            <View style={styles.memberRow}>
              <Feather name="users" size={16} color={colors.primary} />
=======
          <View style={styles.memberRow}>
            <View style={styles.memberCountRow}>
              <Feather name="users" size={16} color={palette.primary} />
>>>>>>> Stashed changes
              <Text style={styles.memberText}>{memberCount} members</Text>
            </View>

            <View style={styles.statusRow}>
              {showMember ? (
                <View style={[styles.statusBadge, styles.statusBadgeMember]}>
                  <Feather name="check-circle" size={12} color={palette.primary} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextMember]}>Member</Text>
                </View>
              ) : null}
              {isOwner ? (
                <View style={[styles.statusBadge, styles.statusBadgeOwner]}>
                  <Feather name="shield" size={12} color={palette.primary} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextOwner]}>Owner</Text>
                </View>
              ) : null}
              {isAdmin ? (
                <View style={[styles.statusBadge, styles.statusBadgeAdmin]}>
                  <Feather name="check-circle" size={12} color={palette.primary} />
                  <Text style={styles.statusBadgeText}>Admin</Text>
                </View>
              ) : null}
              {showPending ? (
                <View style={[styles.statusBadge, styles.statusBadgePending]}>
                  <Feather name="clock" size={12} color={palette.primary} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextDark]}>Pending</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.chipRow}>
            {club.kind === 'VENUE' ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Courts</Text>
              </View>
            ) : (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Community</Text>
              </View>
            )}
            {club.hasBooking ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Booking</Text>
              </View>
            ) : null}
            {club.isVerified ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Verified</Text>
              </View>
            ) : null}
          </View>

<<<<<<< Updated upstream
          {club.nextTournament && nextDateLabel ? (
            <View style={styles.footerRow}>
              <View style={styles.footerLeft}>
                <Feather name="calendar" size={18} color={colors.primary} />
                <Text style={styles.footerText}>{`Tournament • ${nextDateLabel}`}</Text>
              </View>
              <Feather name="arrow-right" size={18} color={colors.primary} />
            </View>
          ) : null}

          {onJoin && !showMember && !showPending ? (
=======
          {onJoin && canJoin && !showPending ? (
>>>>>>> Stashed changes
            <Pressable
              onPress={onJoin}
              disabled={joinLoading}
              style={({ pressed }) => [
                styles.joinButton,
                (pressed || joinLoading) && styles.joinButtonPressed,
              ]}
            >
              <OptionalLinearGradient
                colors={[colors.primary, colors.brandAccent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinButtonGradient}
              >
                {joinLoading ? (
                  <View style={styles.joinButtonLoadingRow}>
                    <ActivityIndicator color={colors.white} size="small" />
                    <Text style={styles.joinButtonLabel}>
                      {club.joinPolicy === 'APPROVAL' ? 'Sending request…' : 'Joining…'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.joinButtonLabel}>
                    {club.joinPolicy === 'APPROVAL' ? 'Request to join' : 'Join Club'}
                  </Text>
                )}
              </OptionalLinearGradient>
            </Pressable>
          ) : null}
        </View>
      </SurfaceCard>
    </Pressable>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  headerSection: {
    position: 'relative',
<<<<<<< Updated upstream
    height: 180,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadgeMember: {
    backgroundColor: colors.primary,
  },
  statusBadgePending: {
    backgroundColor: colors.warning,
  },
  statusBadgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  statusBadgeTextDark: {
    color: colors.text,
=======
    overflow: 'hidden',
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.brandPrimaryBorder,
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
>>>>>>> Stashed changes
  },
  body: {
    padding: spacing.md,
    paddingBottom: spacing.md,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
  },
  logoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
<<<<<<< Updated upstream
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  location: {
    marginTop: -4,
    color: colors.textMuted,
    fontSize: 14,
=======
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.3,
  },
  location: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
>>>>>>> Stashed changes
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
<<<<<<< Updated upstream
  memberText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chipRow: {
=======
  memberCountRow: {
>>>>>>> Stashed changes
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 'auto',
    maxWidth: 120,
  },
  memberText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  ratingText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingTextMuted: {
<<<<<<< Updated upstream
    color: colors.textMuted,
    fontSize: 14,
=======
    color: palette.textMuted,
    fontSize: 13,
>>>>>>> Stashed changes
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeMember: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  statusBadgeAdmin: {
    backgroundColor: 'rgba(30, 122, 50, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(30, 122, 50, 0.18)',
  },
  statusBadgeOwner: {
    backgroundColor: 'rgba(255, 193, 7, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.24)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusBadgeText: {
    color: palette.primary,
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 20,
  },
  statusBadgeTextDark: {
    color: '#A16207',
  },
  statusBadgeTextMember: {
    color: palette.textMuted,
  },
  statusBadgeTextOwner: {
    color: '#A06B00',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
<<<<<<< Updated upstream
    backgroundColor: colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    marginTop: 4,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
=======
    backgroundColor: palette.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
>>>>>>> Stashed changes
  },
  joinButton: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  joinButtonPressed: {
    opacity: 0.9,
  },
  joinButtonGradient: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  joinButtonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  joinButtonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
})
