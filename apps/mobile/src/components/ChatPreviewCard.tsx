import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { TournamentThumbnail } from './TournamentThumbnail'

const formatPreviewTime = (value?: string | Date | null) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const ChatPreviewCard = ({
  title,
  subtitle,
  imageUri,
  unreadCount,
  trailingTime,
  onPress,
}: {
  title: string
  subtitle: string
  /** Логотип клуба; без него — тот же плейсхолдер, что и для обложки ивента */
  imageUri?: string | null
  unreadCount?: number
  trailingTime?: string | Date | null
  onPress: () => void
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const timeLabel = useMemo(() => formatPreviewTime(trailingTime), [trailingTime])

  return (
    <Pressable onPress={onPress}>
      <View style={styles.item}>
        <View style={styles.row}>
          <TournamentThumbnail imageUri={imageUri} size={48} />
          <View style={styles.textCol}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {timeLabel ? (
                <Text style={styles.trailingTime} numberOfLines={1}>
                  {timeLabel}
                </Text>
              ) : null}
            </View>
            <View style={styles.subtitleRow}>
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
              {unreadCount && unreadCount > 0 ? (
                <View style={styles.unreadChip} accessibilityLabel={`${unreadCount} unread messages`}>
                  <Text style={styles.unreadChipText}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

export const ChatMessageBubble = ({
  author,
  text,
  isMine,
  createdAt,
}: {
  author: string
  text: string
  isMine?: boolean
  createdAt?: string | Date
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.messageWrap, isMine && styles.messageWrapMine]}>
      <View style={[styles.messageBubble, isMine ? styles.messageMine : styles.messageOther]}>
        {!isMine ? <Text style={styles.author}>{author}</Text> : null}
        <Text style={[styles.body, isMine && styles.bodyMine]}>{text}</Text>
        {createdAt ? <Text style={[styles.messageTime, isMine && styles.timeMine]}>{formatDateTime(createdAt)}</Text> : null}
      </View>
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  item: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  trailingTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  subtitleRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
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
    marginLeft: 8,
  },
  unreadChipText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  messageWrap: {
    alignItems: 'flex-start',
  },
  messageWrapMine: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '90%',
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
    borderWidth: 1,
  },
  messageMine: {
    backgroundColor: colors.primary,
    borderColor: 'transparent',
  },
  messageOther: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  author: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bodyMine: {
    color: colors.white,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 11,
  },
  timeMine: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  })
