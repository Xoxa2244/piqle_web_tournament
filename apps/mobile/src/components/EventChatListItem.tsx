import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatEventStartInTimezone, getEventTimezoneLabel } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'

export type EventChatDivision = {
  id: string
  name: string
  unreadCount?: number
}

export type EventChatListEvent = {
  id: string
  title: string
  startDate: string
  endDate: string
  timezone?: string | null
  club?: { id: string; name: string } | null
  unreadCount: number
  divisions: EventChatDivision[]
}

function UnreadBadge({ count, compact }: { count: number; compact?: boolean }) {
  if (count <= 0) return null
  return (
    <View style={[styles.unreadBadge, compact && styles.unreadBadgeCompact]}>
      <Text style={[styles.unreadText, compact && styles.unreadTextCompact]}>
        {count > 99 ? '99+' : String(count)}
      </Text>
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
  const hasDivisions = (event.divisions?.length ?? 0) > 0
  const meta = `${formatEventStartInTimezone(event.startDate, event.timezone)} · ${getEventTimezoneLabel(event.timezone)}`

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpenGeneral} style={({ pressed }) => [styles.mainPress, pressed && styles.mainPressPressed]}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
        {event.unreadCount > 0 ? (
          <View style={styles.unreadRow}>
            <UnreadBadge count={event.unreadCount} />
          </View>
        ) : null}
        <Text style={styles.meta}>{meta}</Text>
        {event.club?.name ? (
          <View style={styles.clubRow}>
            <Feather name="map-pin" size={12} color={palette.textMuted} />
            <Text style={styles.clubName} numberOfLines={1}>
              {event.club.name}
            </Text>
          </View>
        ) : null}
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
              <UnreadBadge count={division.unreadCount ?? 0} compact />
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
          <View style={styles.archivedTitleText}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {event.title}
            </Text>
            {event.unreadCount > 0 ? (
              <View style={styles.unreadRow}>
                <UnreadBadge count={event.unreadCount} />
              </View>
            ) : null}
            <Text style={styles.meta}>{meta}</Text>
            {event.club?.name ? (
              <View style={styles.clubRow}>
                <Feather name="map-pin" size={12} color={palette.textMuted} />
                <Text style={styles.clubName} numberOfLines={1}>
                  {event.club.name}
                </Text>
              </View>
            ) : null}
          </View>
          {hasDivisions ? (
            <Feather name="chevron-right" size={18} color={palette.textMuted} style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} />
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
              <UnreadBadge count={division.unreadCount ?? 0} compact />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: spacing.sm,
  },
  mainPress: {
    borderRadius: radius.sm - 2,
    padding: spacing.sm,
  },
  mainPressPressed: {
    backgroundColor: palette.surfaceElevated,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
  },
  unreadBadgeCompact: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
  },
  unreadText: {
    color: palette.white,
    fontWeight: '800',
    fontSize: 12,
  },
  unreadTextCompact: {
    fontSize: 10,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: palette.textMuted,
    lineHeight: 16,
  },
  clubRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clubName: {
    flex: 1,
    fontSize: 12,
    color: palette.textMuted,
  },
  nested: {
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
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
    backgroundColor: palette.surfaceElevated,
  },
  divisionName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: palette.text,
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
