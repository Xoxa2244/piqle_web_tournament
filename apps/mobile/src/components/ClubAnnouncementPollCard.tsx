import { Feather } from '@expo/vector-icons'
import { memo, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { SurfaceCard } from './ui'

export type ClubAnnouncementPollOption = {
  id: string
  text: string
  voteCount: number
}

export type ClubAnnouncementPoll = {
  id: string
  title: string
  totalVotes: number
  viewerOptionId: string | null
  options: ClubAnnouncementPollOption[]
}

type Props = {
  poll: ClubAnnouncementPoll
  onVote?: (optionId: string) => void
  loading?: boolean
}

export const ClubAnnouncementPollCard = memo(function ClubAnnouncementPollCard({
  poll,
  onVote,
  loading = false,
}: Props) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const maxVotes = poll.options.reduce((max, option) => Math.max(max, Number(option.voteCount ?? 0)), 0)

  return (
    <SurfaceCard padded={false} tone="soft" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.badge}>
            <Feather name="bar-chart-2" size={14} color={colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={2}>
              {poll.title}
            </Text>
            <Text style={styles.meta}>{poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.options}>
        {poll.options.map((option) => {
          const voteCount = Number(option.voteCount ?? 0)
          const percent = poll.totalVotes > 0 ? Math.round((voteCount / poll.totalVotes) * 100) : 0
          const isSelected = poll.viewerOptionId === option.id
          const isLeader = maxVotes > 0 && voteCount === maxVotes
          const isInteractive = Boolean(onVote)

          return (
            <Pressable
              key={option.id}
              onPress={() => onVote?.(option.id)}
              disabled={!isInteractive || loading}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                isLeader && styles.optionLeader,
                pressed && isInteractive && !loading && styles.optionPressed,
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.optionFill,
                  {
                    width: `${poll.totalVotes > 0 ? Math.max(percent, 4) : 0}%`,
                    backgroundColor: isLeader
                      ? colors.successSoft
                      : isSelected
                      ? colors.primaryGhost
                      : colors.surfaceMuted,
                  },
                ]}
              />
              <View style={styles.optionContent}>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionText} numberOfLines={2}>
                    {option.text}
                  </Text>
                  {isSelected ? (
                    <Text style={styles.optionSelectedLabel} numberOfLines={1}>
                      Your vote
                    </Text>
                  ) : null}
                </View>
                <View style={styles.optionStats}>
                  <Text style={styles.optionCount}>{voteCount}</Text>
                  <Text style={[styles.optionPercent, isLeader && styles.optionPercentLeader]}>{percent}%</Text>
                </View>
              </View>
            </Pressable>
          )
        })}
      </View>
    </SurfaceCard>
  )
})

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      gap: spacing.md,
      borderRadius: radius.lg,
    },
    header: {
      gap: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    badge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGhost,
      marginTop: 1,
    },
    title: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    meta: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    options: {
      gap: 10,
    },
    option: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 58,
    },
    optionLeader: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    optionSelected: {
      borderColor: colors.primary,
    },
    optionPressed: {
      opacity: 0.85,
    },
    optionFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: radius.md,
      opacity: 0.55,
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    optionTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    optionText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
    },
    optionSelectedLabel: {
      color: colors.success,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    optionStats: {
      alignItems: 'flex-end',
      minWidth: 42,
    },
    optionCount: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    optionPercent: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
    },
    optionPercentLeader: {
      color: colors.success,
    },
  })
