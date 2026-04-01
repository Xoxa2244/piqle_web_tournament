import * as Haptics from 'expo-haptics'
import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import { formatChatTime, groupMessagesByDate } from '../lib/chatMessages'
import { type AppTheme, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { RemoteUserAvatar } from './RemoteUserAvatar'

const AVATAR = 32
const LONG_PRESS_MS = 450
const DOUBLE_TAP_DELAY_MS = 35

async function playLongPressHaptic() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await new Promise((resolve) => setTimeout(resolve, DOUBLE_TAP_DELAY_MS))
    await Haptics.selectionAsync()
  } catch {
    /* no haptics */
  }
}

function UserAvatar({ user }: { user?: ChatMessage['user'] }) {
  return (
    <RemoteUserAvatar
      uri={user?.image}
      size={AVATAR}
      fallback="initials"
      initialsLabel={user?.name ?? 'User'}
    />
  )
}

type Props = {
  messages: ChatMessage[]
  currentUserId?: string
  canDelete: (m: ChatMessage) => boolean
  onPressAvatar?: (m: ChatMessage) => void
  /** Долгое нажатие: родитель открывает шторку подтверждения */
  onRequestDelete: (m: ChatMessage) => void
  deleteDisabled?: boolean
}

export function ChatThreadMessageList({
  messages,
  currentUserId,
  canDelete,
  onPressAvatar,
  onRequestDelete,
  deleteDisabled,
}: Props) {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme])
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
                    <Pressable
                      onPress={() => onPressAvatar?.(m)}
                      disabled={!onPressAvatar || !m.userId}
                      hitSlop={8}
                      style={({ pressed }) => [pressed && styles.avatarPressed]}
                    >
                      <UserAvatar user={m.user} />
                    </Pressable>
                  ) : (
                    <View style={styles.avatarSpacer} />
                  )
                ) : null}

                <Pressable
                  disabled={!deletable}
                  delayLongPress={LONG_PRESS_MS}
                  onLongPress={() => {
                    void playLongPressHaptic()
                    tryDelete(m)
                  }}
                  style={({ pressed }) => [
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleOther,
                    pressed &&
                      deletable && {
                        opacity: 0.92,
                        transform: [{ scale: 0.955 }],
                      },
                  ]}
                >
                  {showName ? (
                    <Pressable
                      onPress={() => onPressAvatar?.(m)}
                      disabled={!onPressAvatar || !m.userId}
                      hitSlop={6}
                      style={({ pressed }) => [pressed && styles.namePressed]}
                    >
                      <Text style={styles.authorName} numberOfLines={1}>
                        {m.user?.name || 'User'}
                      </Text>
                    </Pressable>
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

const createStyles = (colors: ThemePalette, theme: AppTheme) =>
  StyleSheet.create({
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
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
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
  avatarSpacer: {
    width: AVATAR,
    height: AVATAR,
  },
  avatarPressed: {
    opacity: 0.86,
  },
  namePressed: {
    opacity: 0.84,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderBottomRightRadius: 6,
    backgroundColor: theme === 'dark' ? colors.chip : colors.primary,
    ...(theme === 'dark'
      ? {
          shadowOpacity: 0,
          elevation: 0,
        }
      : {
          shadowColor: colors.shadowStrong,
          shadowOpacity: 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }),
  },
  bubbleOther: {
    borderBottomLeftRadius: 6,
    /** Светлая тема: едва заметный серый; тёмная: приглушённая поверхность без обводки */
    backgroundColor: theme === 'light' ? 'rgba(10, 10, 10, 0.045)' : colors.surfaceMuted,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  bodyMine: {
    color: colors.white,
  },
  time: {
    marginTop: 6,
    fontSize: 10,
    color: colors.textMuted,
  },
  timeMine: {
    color: theme === 'dark' ? colors.textMuted : 'rgba(255,255,255,0.75)',
  },
})
