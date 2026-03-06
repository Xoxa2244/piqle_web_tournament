import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../lib/formatters'
import { palette, spacing } from '../lib/theme'
import { Pill, SurfaceCard } from './ui'

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
      <SurfaceCard>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  messageMine: {
    backgroundColor: palette.primary,
  },
  messageOther: {
    backgroundColor: palette.surfaceMuted,
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
    color: '#fffdf8',
  },
  time: {
    color: palette.textMuted,
    fontSize: 11,
  },
  timeMine: {
    color: '#daf0e8',
  },
})
