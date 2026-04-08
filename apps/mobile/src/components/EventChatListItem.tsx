import { useMemo } from 'react'
import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatEventStartInTimezone, getEventTimezoneLabel } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { TournamentThumbnail } from './TournamentThumbnail'

const formatPreviewTime = (value?: string | Date | null) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export type EventChatDivision = {
  id: string
  name: string
  unreadCount?: number
  mentionCount?: number
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
  mentionCount?: number
  lastMessageAt?: string | Date | null
  divisions: EventChatDivision[]
}

/** Превью ивента в списке чатов: только общий чат. Дивизионы открываются уже внутри экрана ивента. */
export function EventChatListItemActive({
  event,
  onOpenGeneral,
}: {
  event: EventChatListEvent
  onOpenGeneral: () => void
  onOpenDivision: (divisionId: string) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const meta = `${formatEventStartInTimezone(event.startDate, event.timezone)} · ${getEventTimezoneLabel(event.timezone)}`
  const timeLabel = formatPreviewTime(event.lastMessageAt)

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
              <View style={styles.titleRight}>
                {timeLabel ? (
                  <Text style={styles.trailingTime} numberOfLines={1}>
                    {timeLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{meta}</Text>
              {event.mentionCount && event.mentionCount > 0 ? (
                <View style={styles.mentionChip} accessibilityLabel={`${event.mentionCount} mentions`}>
                  <Feather name="at-sign" size={11} color={colors.primary} />
                  <Text style={styles.mentionChipText}>{event.mentionCount}</Text>
                </View>
              ) : null}
              {event.unreadCount > 0 ? (
                <View style={styles.unreadChip} accessibilityLabel={`${event.unreadCount} unread messages`}>
                  <Text style={styles.unreadChipText}>{event.unreadCount}</Text>
                </View>
              ) : null}
            </View>
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
    </View>
  )
}

/** Архивное превью: тоже только общий чат, без вложенных дивизионов. */
export function EventChatListItemArchived({
  event,
  onOpenGeneral,
  expanded,
  onToggleExpand,
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
  const meta = `${formatEventStartInTimezone(event.startDate, event.timezone)} · ${getEventTimezoneLabel(event.timezone)}`
  const timeLabel = formatPreviewTime(event.lastMessageAt)

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpenGeneral}
        style={({ pressed }) => [styles.mainPress, pressed && styles.mainPressPressed]}
      >
        <View style={styles.archivedTitleRow}>
          <TournamentThumbnail imageUri={event.image} size={48} />
          <View style={styles.archivedTitleText}>
            <View style={styles.titleUnreadRow}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {event.title}
              </Text>
              <View style={styles.titleRight}>
                {timeLabel ? (
                  <Text style={styles.trailingTime} numberOfLines={1}>
                    {timeLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{meta}</Text>
              {event.mentionCount && event.mentionCount > 0 ? (
                <View style={styles.mentionChip} accessibilityLabel={`${event.mentionCount} mentions`}>
                  <Feather name="at-sign" size={11} color={colors.primary} />
                  <Text style={styles.mentionChipText}>{event.mentionCount}</Text>
                </View>
              ) : null}
              {event.unreadCount > 0 ? (
                <View style={styles.unreadChip} accessibilityLabel={`${event.unreadCount} unread messages`}>
                  <Text style={styles.unreadChipText}>{event.unreadCount}</Text>
                </View>
              ) : null}
            </View>
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
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    marginLeft: 8,
  },
  trailingTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    flex: 1,
  },
  unreadChip: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  mentionChip: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
    backgroundColor: colors.primaryGhost,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  mentionChipText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  unreadChipText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
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
