import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../lib/formatters'
import { palette, radius, spacing } from '../lib/theme'
import { AvatarBadge, Pill, SurfaceCard } from './ui'

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
      <SurfaceCard tone="soft" style={styles.previewCard}>
        <View style={styles.row}>
          <AvatarBadge label={title} />
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              <Feather name="chevron-right" size={16} color={palette.textMuted} />
            </View>
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>
          {unreadCount ? <Pill label={`${unreadCount}`} tone="primary" /> : null}
        </View>
      </SurfaceCard>
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
  previewCard: {
    shadowColor: 'transparent',
    elevation: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  subtitle: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
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
