import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../lib/formatters'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { TournamentThumbnail } from './TournamentThumbnail'

export const ChatPreviewCard = ({
  title,
  subtitle,
  imageUri,
  unreadCount,
  onPress,
}: {
  title: string
  subtitle: string
  /** Логотип клуба; без него — тот же плейсхолдер, что и для обложки ивента */
  imageUri?: string | null
  unreadCount?: number
  onPress: () => void
}) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <Pressable onPress={onPress}>
      <View style={styles.item}>
        <View style={styles.row}>
          <TournamentThumbnail imageUri={imageUri} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.previewTime} numberOfLines={1}>
                {''}
              </Text>
            </View>
            <View style={styles.subtitleRow}>
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
              {unreadCount && unreadCount > 0 ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
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
    alignItems: 'flex-start',
    gap: 12,
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
  previewTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  subtitleRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  unreadText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
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
