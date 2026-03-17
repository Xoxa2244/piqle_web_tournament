import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'
import { AvatarBadge, Pill } from './ui'

export const ChatPreviewCard = ({
  title,
  subtitle,
  unreadCount,
  onPress,
}: {
  title: string
  subtitle: string
  unreadCount?: number
  onPress: () => void
}) => {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.item}>
        <View style={styles.row}>
          <AvatarBadge label={title} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <View style={styles.titleWithIcon}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <Feather name="message-circle" size={14} color={palette.textMuted} />
              </View>
              <Text style={styles.time} numberOfLines={1}>
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
  return (
    <View style={[styles.messageWrap, isMine && styles.messageWrapMine]}>
      <View style={[styles.messageBubble, isMine ? styles.messageMine : styles.messageOther]}>
        {!isMine ? <Text style={styles.author}>{author}</Text> : null}
        <Text style={[styles.body, isMine && styles.bodyMine]}>{text}</Text>
        {createdAt ? <Text style={[styles.time, isMine && styles.timeMine]}>{formatDateTime(createdAt)}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: palette.background,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
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
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    color: palette.textMuted,
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
    color: palette.textMuted,
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
    backgroundColor: palette.primary,
  },
  unreadText: {
    color: palette.white,
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
    backgroundColor: palette.primary,
    borderColor: 'transparent',
  },
  messageOther: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  },
  author: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bodyMine: {
    color: palette.white,
  },
  time: {
    color: palette.textMuted,
    fontSize: 11,
  },
  timeMine: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
})
