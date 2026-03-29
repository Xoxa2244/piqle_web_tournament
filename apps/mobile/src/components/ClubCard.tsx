import { Feather } from '@expo/vector-icons'
import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { formatLocation } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { EntityImage } from './EntityImage'
import { RatingStarIcon } from './icons/RatingStarIcon'
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
  /** Tap on rating area (does not navigate). */
  onRatingPress?: () => void
  onJoin?: () => void
  joinLoading?: boolean
}

export const ClubCard = ({ club, onPress, onRatingPress, onJoin, joinLoading }: ClubCardProps) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isOwner = String(club.role ?? '').toUpperCase() === 'OWNER'
  const isAdmin = Boolean(club.isAdmin && !isOwner)
  const showMember = Boolean(club.isFollowing && !club.isAdmin && !isOwner)
  const hasPrivilegedRole = Boolean(isOwner || isAdmin)
  const canJoin = Boolean(!showMember && !hasPrivilegedRole && !club.isJoinPending)
  const showPending = Boolean(!showMember && club.isJoinPending)
  const memberCount = typeof club.followersCount === 'number' ? Math.max(1, club.followersCount) : 1
  const showPublicRating = Boolean(club.feedbackSummary?.canPublish && club.feedbackSummary?.averageRating)

  return (
    <Pressable onPress={onPress}>
      <SurfaceCard padded={false} style={styles.card}>
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
            />

            <View style={styles.headerMain}>
              <Text style={styles.name} numberOfLines={2}>
                {club.name}
              </Text>
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={16} color={colors.primary} />
                <Text style={styles.location} numberOfLines={1}>
                  {formatLocation([club.city, club.state])}
                </Text>
              </View>
            </View>

            {onRatingPress ? (
              <Pressable
                onPress={() => onRatingPress()}
                hitSlop={10}
                style={({ pressed }) => [styles.ratingRow, pressed && styles.ratingRowPressed]}
              >
                <RatingStarIcon size={16} filled color="#F4B000" />
                {showPublicRating ? (
                  <Text style={styles.ratingText}>{club.feedbackSummary!.averageRating!.toFixed(1)}</Text>
                ) : (
                  <Text style={styles.ratingTextMuted}>New</Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.ratingRow}>
                <RatingStarIcon size={16} filled color="#F4B000" />
                {showPublicRating ? (
                  <Text style={styles.ratingText}>{club.feedbackSummary!.averageRating!.toFixed(1)}</Text>
                ) : (
                  <Text style={styles.ratingTextMuted}>New</Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.memberRow}>
            <View style={styles.memberCountRow}>
              <Feather name="users" size={16} color={colors.primary} />
              <Text style={styles.memberText}>{memberCount} members</Text>
            </View>

            <View style={styles.statusRow}>
              {showMember ? (
                <View style={[styles.statusBadge, styles.statusBadgeMember]}>
                  <Feather name="check-circle" size={12} color={colors.primary} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextMember]}>Member</Text>
                </View>
              ) : null}
              {isOwner ? (
                <View style={[styles.statusBadge, styles.statusBadgeOwner]}>
                  <Feather name="shield" size={12} color={colors.primary} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextOwner]}>Owner</Text>
                </View>
              ) : null}
              {isAdmin ? (
                <View style={[styles.statusBadge, styles.statusBadgeAdmin]}>
                  <Feather name="shield" size={12} color="#2F6BFF" />
                  <Text style={styles.statusBadgeText}>Admin</Text>
                </View>
              ) : null}
              {showPending ? (
                <View style={[styles.statusBadge, styles.statusBadgePending]}>
                  <Feather name="clock" size={12} color="#A16207" />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextPending]}>Pending</Text>
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

          {onJoin && canJoin && !showPending ? (
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

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
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
      overflow: 'hidden',
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.brandPrimaryBorder,
    },
    headerGradient: {
      ...StyleSheet.absoluteFillObject,
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
      backgroundColor: colors.surfaceMuted,
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
      gap: 5,
    },
    name: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    location: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
      flex: 1,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    memberCountRow: {
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
    ratingRowPressed: {
      opacity: 0.88,
    },
    memberText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
    ratingText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    ratingTextMuted: {
      color: colors.textMuted,
      fontSize: 13,
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
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
    },
    statusBadgeOwner: {
      backgroundColor: 'rgba(255, 193, 7, 0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255, 193, 7, 0.24)',
    },
    statusBadgePending: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
    },
    statusBadgeText: {
      color: '#2F6BFF',
      fontWeight: '500',
      fontSize: 13,
      lineHeight: 20,
    },
    statusBadgeTextMember: {
      color: colors.primary,
    },
    statusBadgeTextOwner: {
      color: '#A06B00',
    },
    statusBadgeTextPending: {
      color: '#A16207',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: colors.secondary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    chipText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
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
