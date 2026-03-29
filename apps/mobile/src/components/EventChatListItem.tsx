import { useMemo } from 'react'
import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatEventStartInTimezone, getEventTimezoneLabel } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { TournamentThumbnail } from './TournamentThumbnail'
import { UnreadIndicatorDot } from './UnreadIndicatorDot'

export type EventChatDivision = {
  id: string
  name: string
  unreadCount?: number
}

export type EventChatListEvent = {
  id: string
  title: string
  /** Обложка турнира; если нет — в UI тот же плейсхолдер, что на вебе (`tournament-placeholder.png`) */
  image?: string | null
  startDate: string
  endDate: string
  timezone?: string | null
  club?: { id: string; name: string } | null
  unreadCount: number
  divisions: EventChatDivision[]
}

function UnreadDotRow({
  count,
  compact,
  styles,
}: {
  count: number
  compact?: boolean
  styles: ReturnType<typeof createStyles>
}) {
  if (count <= 0) return null
  return (
    <View style={[styles.unreadDotWrap, compact && styles.unreadDotWrapCompact]} accessibilityLabel="Unread messages">
      <UnreadIndicatorDot size={compact ? 7 : 8} />
    </View>
  )
}

/** Активный ивент: общий чат + вложенные дивизионы (как на вебе). */
export function EventChatListItemActive({
  event,
  onOpenGeneral,
  onOpenDivision,
}: {
  event: EventChatListEvent
  onOpenGeneral: () => void
  onOpenDivision: (divisionId: string) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const hasDivisions = (event.divisions?.length ?? 0) > 0
  const meta = `${formatEventStartInTimezone(event.startDate, event.timezone)} · ${getEventTimezoneLabel(event.timezone)}`

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpenGeneral} style={({ pressed }) => [styles.mainPress, pressed && styles.mainPressPressed]}>
        <View style={styles.headerRow}>
          <TournamentThumbnail imageUri={event.image} size={48} />
          <View style={styles.headerTextCol}>
            <View style={styles.titleUnreadRow}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {event.title}
              </Text>
              {event.unreadCount > 0 ? <UnreadDotRow count={event.unreadCount} styles={styles} /> : null}
            </View>
            <Text style={styles.meta}>{meta}</Text>
            {event.club?.name ? (
              <View style={styles.clubRow}>
                <Feather name="map-pin" size={12} color={colors.textMuted} />
                <Text style={styles.clubName} numberOfLines={1}>
                  {event.club.name}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {hasDivisions ? (
        <View style={styles.nested}>
          {event.divisions.map((division) => (
            <Pressable
              key={division.id}
              onPress={() => onOpenDivision(division.id)}
              style={({ pressed }) => [styles.divisionPress, pressed && styles.divisionPressPressed]}
            >
              <Text style={styles.divisionName} numberOfLines={2}>
                {division.name}
              </Text>
              <UnreadDotRow count={division.unreadCount ?? 0} compact styles={styles} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Архив: раскрытие дивизионов по тапу на строку ивента (как на вебе). */
export function EventChatListItemArchived({
  event,
  expanded,
  onToggleExpand,
  onOpenGeneral,
  onOpenDivision,
}: {
  event: EventChatListEvent
  expanded: boolean
  onToggleExpand: () => void
  onOpenGeneral: () => void
  onOpenDivision: (divisionId: string) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const hasDivisions = (event.divisions?.length ?? 0) > 0
  const meta = `${formatEventStartInTimezone(event.startDate, event.timezone)} · ${getEventTimezoneLabel(event.timezone)}`

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          onOpenGeneral()
          if (hasDivisions) onToggleExpand()
        }}
        style={({ pressed }) => [styles.mainPress, pressed && styles.mainPressPressed]}
      >
        <View style={styles.archivedTitleRow}>
          <TournamentThumbnail imageUri={event.image} size={48} />
          <View style={styles.archivedTitleText}>
            <View style={styles.titleUnreadRow}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {event.title}
              </Text>
              {event.unreadCount > 0 ? <UnreadDotRow count={event.unreadCount} styles={styles} /> : null}
            </View>
            <Text style={styles.meta}>{meta}</Text>
            {event.club?.name ? (
              <View style={styles.clubRow}>
                <Feather name="map-pin" size={12} color={colors.textMuted} />
                <Text style={styles.clubName} numberOfLines={1}>
                  {event.club.name}
                </Text>
              </View>
            ) : null}
          </View>
          {hasDivisions ? (
            <Feather name="chevron-right" size={18} color={colors.textMuted} style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} />
          ) : null}
        </View>
      </Pressable>

      {hasDivisions && expanded ? (
        <View style={styles.nested}>
          {event.divisions.map((division) => (
            <Pressable
              key={division.id}
              onPress={() => onOpenDivision(division.id)}
              style={({ pressed }) => [styles.divisionPress, pressed && styles.divisionPressPressed]}
            >
              <Text style={styles.divisionName} numberOfLines={2}>
                {division.name}
              </Text>
              <UnreadDotRow count={division.unreadCount ?? 0} compact styles={styles} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  mainPress: {
    borderRadius: radius.sm - 2,
    padding: spacing.sm,
  },
  mainPressPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  titleUnreadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  unreadDotWrap: {
    marginLeft: 6,
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  unreadDotWrapCompact: {
    marginLeft: 4,
    paddingTop: 0,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  clubRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clubName: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  nested: {
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    gap: 4,
  },
  divisionPress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  divisionPressPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  divisionName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  archivedTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  archivedTitleText: {
    flex: 1,
    minWidth: 0,
  },
  })
