import { useCallback } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import { formatChatTime, groupMessagesByDate } from '../lib/chatMessages'
import { palette } from '../lib/theme'

const AVATAR = 32
const LONG_PRESS_MS = 450

function UserAvatar({ user }: { user?: ChatMessage['user'] }) {
  const initial = (user?.name || 'U').trim().charAt(0).toUpperCase() || 'U'
  if (user?.image) {
    return (
      <View style={styles.avatarRing}>
        <Image source={{ uri: user.image }} style={styles.avatarImg} />
      </View>
    )
  }
  return (
    <View style={[styles.avatarRing, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{initial}</Text>
    </View>
  )
}

type Props = {
  messages: ChatMessage[]
  currentUserId?: string
  canDelete: (m: ChatMessage) => boolean
  /** Долгое нажатие: родитель открывает шторку подтверждения */
  onRequestDelete: (m: ChatMessage) => void
  deleteDisabled?: boolean
}

export function ChatThreadMessageList({
  messages,
  currentUserId,
  canDelete,
  onRequestDelete,
  deleteDisabled,
}: Props) {
  const groups = groupMessagesByDate(messages)

  const tryDelete = useCallback(
    (m: ChatMessage) => {
      if (!canDelete(m) || m.isDeleted || deleteDisabled) return
      onRequestDelete(m)
    },
    [canDelete, deleteDisabled, onRequestDelete]
  )

  return (
    <View style={styles.root}>
      {groups.map((g) => (
        <View key={g.dateKey} style={styles.dateBlock}>
          <View style={styles.datePillWrap}>
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{g.dateLabel}</Text>
            </View>
          </View>
          {g.list.map((m, idx) => {
            const isMine = Boolean(currentUserId && m.userId === currentUserId)
            const prev = idx > 0 ? g.list[idx - 1] : null
            const sameAuthorAsPrev = Boolean(prev && prev.userId === m.userId)
            const showName = !isMine && (!prev || prev.userId !== m.userId)
            const showAvatar = !isMine && (!prev || prev.userId !== m.userId)
            const tightTop = sameAuthorAsPrev
            const deletable = canDelete(m) && !m.isDeleted && !deleteDisabled

            return (
              <View
                key={m.id}
                style={[
                  styles.row,
                  isMine ? styles.rowMine : styles.rowOther,
                  tightTop ? styles.rowGrouped : styles.rowNewAuthor,
                ]}
              >
                {!isMine ? (
                  showAvatar ? (
                    <UserAvatar user={m.user} />
                  ) : (
                    <View style={styles.avatarSpacer} />
                  )
                ) : null}

                <Pressable
                  disabled={!deletable}
                  delayLongPress={LONG_PRESS_MS}
                  onLongPress={() => tryDelete(m)}
                  style={({ pressed }) => [
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleOther,
                    pressed && deletable && { opacity: 0.92 },
                  ]}
                >
                  {showName ? (
                    <Text style={styles.authorName} numberOfLines={1}>
                      {m.user?.name || 'User'}
                    </Text>
                  ) : null}
                  <Text style={[styles.body, isMine && styles.bodyMine]}>
                    {m.isDeleted ? 'Message removed' : m.text || ''}
                  </Text>
                  <Text style={[styles.time, isMine && styles.timeMine]}>{formatChatTime(m.createdAt)}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  dateBlock: {},
  datePillWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  datePill: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  /** Подряд от одного автора — небольшой зазор (как в Telegram) */
  rowGrouped: {
    marginTop: 5,
  },
  rowNewAuthor: {
    marginTop: 12,
  },
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    backgroundColor: '#f1f5f9',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  avatarSpacer: {
    width: AVATAR,
    height: AVATAR,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleMine: {
    borderBottomRightRadius: 6,
    backgroundColor: palette.primary,
  },
  bubbleOther: {
    borderBottomLeftRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
  },
  authorName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    color: palette.text,
  },
  bodyMine: {
    color: palette.white,
  },
  time: {
    marginTop: 6,
    fontSize: 10,
    color: '#64748b',
  },
  timeMine: {
    color: 'rgba(255,255,255,0.75)',
  },
})
