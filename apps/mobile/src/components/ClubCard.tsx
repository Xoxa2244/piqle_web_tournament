import { Feather, MaterialIcons } from '@expo/vector-icons'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { formatLocation } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'
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
  const showMember = Boolean(club.isFollowing || club.isAdmin)
  const showPending = Boolean(!showMember && club.isJoinPending)
  const memberCount = typeof club.followersCount === 'number' ? club.followersCount : null
  const showPublicRating = Boolean(club.feedbackSummary?.canPublish && club.feedbackSummary?.averageRating)

  const nextDateLabel = (() => {
    if (!club.nextTournament?.startDate) return null
    const date = new Date(club.nextTournament.startDate)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  })()

  return (
    <Pressable onPress={onPress}>
      <SurfaceCard padded={false} style={styles.card}>
        <View style={styles.imageWrap}>
          {club.logoUrl ? (
            <Image source={{ uri: club.logoUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <OptionalLinearGradient
              pointerEvents="none"
              colors={['rgba(40, 205, 65, 0.18)', 'rgba(82, 224, 104, 0.14)', 'rgba(0, 0, 0, 0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.imagePlaceholder}
            />
          )}

          {showMember ? (
            <View style={[styles.statusBadge, styles.statusBadgeMember]}>
              <Feather name={club.isAdmin ? 'shield' : 'check'} size={14} color={palette.white} />
              <Text style={styles.statusBadgeText}>{club.isAdmin ? 'Admin' : 'Member'}</Text>
            </View>
          ) : showPending ? (
            <View style={[styles.statusBadge, styles.statusBadgePending]}>
              <Feather name="clock" size={14} color={palette.text} />
              <Text style={[styles.statusBadgeText, styles.statusBadgeTextDark]}>Pending</Text>
            </View>
          ) : null}

          {/* Distance pill is design-only until backend provides distance miles */}
        </View>

        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>
            {club.name}
          </Text>
          <Text style={styles.location}>{formatLocation([club.city, club.state])}</Text>

          {memberCount !== null ? (
            <View style={styles.memberRow}>
              <Feather name="users" size={16} color={palette.primary} />
              <Text style={styles.memberText}>{memberCount} members</Text>
            </View>
          ) : null}

          <View style={styles.ratingRow}>
            <MaterialIcons name="star" size={16} color="#F4B000" />
            {showPublicRating ? (
              <Text style={styles.ratingText}>{club.feedbackSummary!.averageRating!.toFixed(1)}</Text>
            ) : (
              <Text style={styles.ratingTextMuted}>No rating yet</Text>
            )}
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

          {club.nextTournament && nextDateLabel ? (
            <View style={styles.footerRow}>
              <View style={styles.footerLeft}>
                <Feather name="calendar" size={18} color={palette.primary} />
                <Text style={styles.footerText}>{`Tournament • ${nextDateLabel}`}</Text>
              </View>
              <Feather name="arrow-right" size={18} color={palette.primary} />
            </View>
          ) : null}

          {onJoin && !showMember && !showPending ? (
            <Pressable
              onPress={onJoin}
              disabled={joinLoading}
              style={({ pressed }) => [
                styles.joinButton,
                (pressed || joinLoading) && styles.joinButtonPressed,
              ]}
            >
              <OptionalLinearGradient
                colors={[palette.primary, palette.brandAccent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinButtonGradient}
              >
                {joinLoading ? (
                  <View style={styles.joinButtonLoadingRow}>
                    <ActivityIndicator color={palette.white} size="small" />
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

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  imageWrap: {
    position: 'relative',
    height: 180,
    backgroundColor: palette.surfaceMuted,
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
    backgroundColor: palette.primary,
  },
  statusBadgePending: {
    backgroundColor: palette.warning,
  },
  statusBadgeText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 13,
  },
  statusBadgeTextDark: {
    color: palette.text,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 10,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.3,
  },
  location: {
    marginTop: -4,
    color: palette.textMuted,
    fontSize: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  memberText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: 9999,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingTextMuted: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chip: {
    backgroundColor: palette.secondary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    marginTop: 4,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
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
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
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
    color: palette.white,
    fontSize: 16,
    fontWeight: '700',
  },
})
