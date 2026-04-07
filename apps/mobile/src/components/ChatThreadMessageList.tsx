import * as Haptics from 'expo-haptics'
import { Feather } from '@expo/vector-icons'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import { formatChatTime, groupMessagesByDate } from '../lib/chatMessages'
import { type AppTheme, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { RemoteUserAvatar } from './RemoteUserAvatar'

const AVATAR = 32
const LONG_PRESS_MS = 450
const DOUBLE_TAP_DELAY_MS = 35
const LIKE_DOUBLE_TAP_MS = 280
const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s]+)/gi
const isLinkPart = (value: string) => /^(?:https?:\/\/|www\.)[^\s]+$/i.test(value)
const LINK_WRAP_PATTERN = /([/:.?&=_-]+)/g

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

function LinkInlineText({
  segments,
  url,
  textStyle,
  linkStyle,
  pressedStyle,
}: {
  segments: string[]
  url: string
  textStyle: any
  linkStyle: any
  pressedStyle: any
}) {
  const [pressed, setPressed] = useState(false)

  const handleOpenLink = useCallback(() => {
    Alert.alert(
      'Open external link?',
      'This link will open outside Piqle. External websites may be unsafe. Continue only if you trust the source.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: async () => {
            try {
              const supported = await Linking.canOpenURL(url)
              if (!supported) {
                Alert.alert('Cannot open link', 'This link could not be opened on this device.')
                return
              }
              await Linking.openURL(url)
            } catch {
              Alert.alert('Cannot open link', 'This link could not be opened on this device.')
            }
          },
        },
      ]
    )
  }, [url])

  return (
    <>
      {segments.map((segment, index) => (
        <Text
          key={`${url}-${index}-${segment}`}
          style={[textStyle, linkStyle, pressed && pressedStyle]}
          suppressHighlighting
          onPress={handleOpenLink}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
        >
          {segment}
        </Text>
      ))}
    </>
  )
}

type Props = {
  messages: ChatMessage[]
  currentUserId?: string
  canDelete: (m: ChatMessage) => boolean
  onPressAvatar?: (m: ChatMessage) => void
  showOtherAvatars?: boolean
  onToggleLike?: (m: ChatMessage) => void
  likeDisabled?: boolean
  /** Долгое нажатие: родитель открывает шторку подтверждения */
  onRequestDelete: (m: ChatMessage) => void
  deleteDisabled?: boolean
}

export function ChatThreadMessageList({
  messages,
  currentUserId,
  canDelete,
  onPressAvatar,
  showOtherAvatars = true,
  onToggleLike,
  likeDisabled,
  onRequestDelete,
  deleteDisabled,
}: Props) {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme])
  const groups = groupMessagesByDate(messages)
  const lastTapAtRef = useRef(0)
  const lastTapMessageIdRef = useRef<string | null>(null)

  const tryDelete = useCallback(
    (m: ChatMessage) => {
      if (!canDelete(m) || m.isDeleted || deleteDisabled) return
      onRequestDelete(m)
    },
    [canDelete, deleteDisabled, onRequestDelete]
  )

  const tryLike = useCallback(
    (m: ChatMessage) => {
      if (!onToggleLike || likeDisabled || m.isDeleted || m.viewerHasLiked) return
      void Haptics.selectionAsync().catch(() => {})
      onToggleLike(m)
    },
    [likeDisabled, onToggleLike]
  )

  const renderMessageText = useCallback(
    (rawText: string, isMine: boolean) => {
      const parts = rawText.split(LINK_PATTERN)
      if (parts.length === 1) {
        return <Text style={[styles.body, isMine && styles.bodyMine]}>{rawText}</Text>
      }

      return (
        <View style={styles.bodyFlow}>
          {parts.map((part, index) => {
            if (!part) return null
            if (!isLinkPart(part)) {
              return (
                <Text key={`${index}-${part}`} style={[styles.body, isMine && styles.bodyMine]}>
                  {part}
                </Text>
              )
            }
            const url = /^https?:\/\//i.test(part) ? part : `https://${part}`
            const segments = part.split(LINK_WRAP_PATTERN).filter(Boolean)
            return (
              <LinkInlineText
                key={`${index}-${part}`}
                segments={segments}
                url={url}
                textStyle={[styles.body, isMine && styles.bodyMine]}
                linkStyle={styles.linkText}
                pressedStyle={styles.linkTextPressed}
              />
            )
          })}
        </View>
      )
    },
    [styles]
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
            const next = idx < g.list.length - 1 ? g.list[idx + 1] : null
            const sameAuthorAsPrev = Boolean(prev && prev.userId === m.userId)
            const showName = !isMine && (!prev || prev.userId !== m.userId)
            const showAvatar = showOtherAvatars && !isMine && (!next || next.userId !== m.userId)
            const tightTop = sameAuthorAsPrev
            const deletable = canDelete(m) && !m.isDeleted && !deleteDisabled
            const showLikeChip = Boolean((m.likeCount ?? 0) > 0 || m.viewerHasLiked)

            return (
              <View
                key={m.id}
                style={[
                  styles.row,
                  isMine ? styles.rowMine : styles.rowOther,
                  tightTop ? styles.rowGrouped : styles.rowNewAuthor,
                ]}
              >
                {!isMine && showOtherAvatars ? (
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
                  onPress={() => {
                    if (!onToggleLike || likeDisabled || m.isDeleted) return
                    const now = Date.now()
                    if (lastTapMessageIdRef.current === m.id && now - lastTapAtRef.current <= LIKE_DOUBLE_TAP_MS) {
                      lastTapMessageIdRef.current = null
                      lastTapAtRef.current = 0
                      tryLike(m)
                      return
                    }
                    lastTapMessageIdRef.current = m.id
                    lastTapAtRef.current = now
                  }}
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
                  {renderMessageText(m.isDeleted ? 'Message removed' : m.text || '', isMine)}
                  {showLikeChip ? (
                    <View style={[styles.likeChip, m.viewerHasLiked && styles.likeChipActive]}>
                      <MaterialCommunityIcons
                        name={m.viewerHasLiked ? 'heart' : 'heart-outline'}
                        size={12}
                        color={m.viewerHasLiked ? colors.primary : colors.textMuted}
                      />
                      <Text style={[styles.likeChipText, m.viewerHasLiked && styles.likeChipTextActive]}>
                        {Math.max(1, Number(m.likeCount ?? 0))}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.metaRow}>
                    {isMine ? (
                      <View style={styles.statusWrap}>
                        {m.deliveryStatus === 'read' ? (
                          <View style={styles.statusDoubleWrap}>
                            <Feather name="check" size={11} color={colors.primary} style={styles.statusCheckBack} />
                            <Feather name="check" size={11} color={colors.primary} style={styles.statusCheckFront} />
                          </View>
                        ) : m.deliveryStatus === 'delivered' ? (
                          <View style={styles.statusDoubleWrap}>
                            <Feather
                              name="check"
                              size={11}
                              color={colors.textMuted}
                              style={styles.statusCheckBack}
                            />
                            <Feather
                              name="check"
                              size={11}
                              color={colors.textMuted}
                              style={styles.statusCheckFront}
                            />
                          </View>
                        ) : (
                          <Feather name="check" size={11} color={colors.textMuted} />
                        )}
                      </View>
                    ) : null}
                    <Text style={[styles.time, isMine && styles.timeMine]}>{formatChatTime(m.createdAt)}</Text>
                  </View>
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
    minWidth: 0,
    flexShrink: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderBottomRightRadius: 6,
    backgroundColor: theme === 'dark' ? colors.chip : colors.brandPrimaryTint,
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
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
  },
  bodyFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    maxWidth: '100%',
    minWidth: 0,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '600',
    maxWidth: '100%',
  },
  linkTextPressed: {
    backgroundColor: theme === 'dark' ? 'rgba(117, 230, 109, 0.2)' : 'rgba(117, 230, 109, 0.18)',
    borderRadius: 8,
  },
  likeChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  likeChipActive: {
    borderColor: colors.brandPrimaryBorder,
  },
  likeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  likeChipTextActive: {
    color: colors.primary,
  },
  bodyMine: {
    color: theme === 'dark' ? colors.white : colors.text,
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
  },
  timeMine: {
    color: theme === 'dark' ? colors.textMuted : colors.textMuted,
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 14,
    height: 11,
  },
  statusDoubleWrap: {
    width: 16,
    height: 11,
    position: 'relative',
  },
  statusCheckBack: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  statusCheckFront: {
    position: 'absolute',
    left: 5,
    top: 0,
  },
})
