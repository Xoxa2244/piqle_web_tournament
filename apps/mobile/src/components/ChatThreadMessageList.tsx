import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Feather } from '@expo/vector-icons'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import LottieView from 'lottie-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import {
  buildMentionHandle,
  formatMentionsForPreview,
  getMentionDisplayText,
  parseMentionToken,
  type MentionCandidate,
} from '../lib/chatMentions'
import { formatChatTime, toLocalYmd } from '../lib/chatMessages'
import { formatDate } from '../lib/formatters'
import { radius, spacing, type AppTheme, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { useToast } from '../providers/ToastProvider'
import { AppBottomSheet } from './AppBottomSheet'
import { RemoteUserAvatar } from './RemoteUserAvatar'

const AVATAR = 32
const REPLY_AVATAR = 20
const LONG_PRESS_MS = 450
const DOUBLE_TAP_DELAY_MS = 35
const LIKE_DOUBLE_TAP_MS = 280
const STATIC_LIKE_ICON_SIZE = 14
const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s]+)/gi
const isLinkPart = (value: string) => /^(?:https?:\/\/|www\.)[^\s]+$/i.test(value)
const LINK_WRAP_PATTERN = /([/:.?&=_-]+)/g
const INLINE_TOKEN_PATTERN = /(\s+|(?:https?:\/\/|www\.)[^\s]+|@[^\s@]+)/giu

const likeBurstStyles = StyleSheet.create({
  iconWrap: {
    width: STATIC_LIKE_ICON_SIZE,
    height: STATIC_LIKE_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  burst: {
    position: 'absolute',
    width: 72,
    height: 72,
    left: -28,
    top: -28,
  },
  outlineGlyph: {
    zIndex: 1,
  },
})

type DisplayMessageEntry = {
  type: 'message'
  id: string
  message: ChatMessage
  level: 0 | 1
  threadRootId: string
}

type DisplayEntry = DisplayMessageEntry

async function playLongPressHaptic() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await new Promise((resolve) => setTimeout(resolve, DOUBLE_TAP_DELAY_MS))
    await Haptics.selectionAsync()
  } catch {
    /* no haptics */
  }
}

function UserAvatar({ user, size = AVATAR }: { user?: ChatMessage['user']; size?: number }) {
  return (
    <RemoteUserAvatar
      uri={user?.image}
      size={size}
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

function LikeChipIcon({
  active,
  color,
  animateKey,
  shouldAnimate,
  onAnimationEnd,
}: {
  active: boolean
  color: string
  animateKey: number
  shouldAnimate: boolean
  onAnimationEnd?: () => void
}) {
  const lastAnimatedKeyRef = useRef(0)
  const [visibleAnimationKey, setVisibleAnimationKey] = useState(0)

  useEffect(() => {
    if (!shouldAnimate || animateKey <= 0 || animateKey === lastAnimatedKeyRef.current) {
      return
    }
    lastAnimatedKeyRef.current = animateKey
    setVisibleAnimationKey(animateKey)
  }, [animateKey, shouldAnimate])

  return (
    <View style={likeBurstStyles.iconWrap}>
      {visibleAnimationKey > 0 ? (
        <LottieView
          key={visibleAnimationKey}
          source={require('../assets/animations/like-burst.json')}
          autoPlay
          loop={false}
          style={likeBurstStyles.burst}
          resizeMode="contain"
          onAnimationFinish={() => {
            setVisibleAnimationKey(0)
            onAnimationEnd?.()
          }}
        />
      ) : null}
      <MaterialCommunityIcons
        name={active ? 'heart' : 'heart-outline'}
        size={STATIC_LIKE_ICON_SIZE}
        color={color}
        style={likeBurstStyles.outlineGlyph}
      />
    </View>
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
  onRequestDelete: (m: ChatMessage) => void
  deleteDisabled?: boolean
  onRequestReply?: (m: ChatMessage) => void
  onPressRepliesSummary?: (rootMessage: ChatMessage) => void
  replyPreviewLimit?: number
  threadRootMessageId?: string | null
  longPressMenuEnabled?: boolean
  onMessageLayout?: (messageId: string, y: number) => void
  onPressReplyTarget?: (message: ChatMessage, targetMessageId: string) => void
  highlightedMessageId?: string | null
  mentionCandidates?: MentionCandidate[]
  onPressMentionUser?: (userId: string) => void
  userTagByUserId?: Record<string, string | null | undefined>
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
  onRequestReply,
  onPressRepliesSummary,
  replyPreviewLimit = 3,
  threadRootMessageId,
  longPressMenuEnabled = false,
  onMessageLayout,
  onPressReplyTarget,
  highlightedMessageId,
  mentionCandidates,
  onPressMentionUser,
  userTagByUserId,
}: Props) {
  const { colors, theme } = useAppTheme()
  const toast = useToast()
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme])
  const lastTapAtRef = useRef(0)
  const lastTapMessageIdRef = useRef<string | null>(null)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [likeAnimationTickByMessageId, setLikeAnimationTickByMessageId] = useState<Record<string, number>>({})
  const [animatingLikeMessageIds, setAnimatingLikeMessageIds] = useState<Record<string, true>>({})
  const [menuTarget, setMenuTarget] = useState<ChatMessage | null>(null)
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<ChatMessage | null>(null)

  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const message of messages) {
      map.set(message.id, message)
    }
    return map
  }, [messages])

  const mentionByHandle = useMemo(() => {
    const map = new Map<string, MentionCandidate>()
    for (const candidate of mentionCandidates ?? []) {
      map.set(candidate.handle.toLowerCase(), candidate)
      map.set(buildMentionHandle(candidate.name).toLowerCase(), candidate)
    }
    return map
  }, [mentionCandidates])
  const mentionById = useMemo(() => {
    const map = new Map<string, MentionCandidate>()
    for (const candidate of mentionCandidates ?? []) {
      map.set(candidate.id, candidate)
    }
    return map
  }, [mentionCandidates])

  const displayEntries = useMemo<DisplayEntry[]>(() => {
    const repliesByRoot = new Map<string, ChatMessage[]>()
    const sortByCreatedAt = (left: ChatMessage, right: ChatMessage) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

    for (const message of messages) {
      if (threadRootMessageId) {
        continue
      }
      if (message.parentMessageId) {
        const current = repliesByRoot.get(message.parentMessageId) ?? []
        current.push(message)
        repliesByRoot.set(message.parentMessageId, current)
      }
    }

    if (threadRootMessageId) {
      const rootMessage = messageById.get(threadRootMessageId)
      if (!rootMessage) return []
      const replies = messages
        .filter((message) => message.parentMessageId === threadRootMessageId)
        .slice()
        .sort(sortByCreatedAt)
      return [
        { type: 'message', id: rootMessage.id, message: rootMessage, level: 0, threadRootId: threadRootMessageId },
        ...replies.map(
          (message) =>
            ({
              type: 'message',
              id: message.id,
              message,
              level: 1,
              threadRootId: threadRootMessageId,
            }) satisfies DisplayMessageEntry
        ),
      ]
    }

    const orderedMessages = messages.slice().sort(sortByCreatedAt)
    const entries: DisplayEntry[] = []
    for (const message of orderedMessages) {
      entries.push({
        type: 'message',
        id: message.id,
        message,
        level: 0,
        threadRootId: message.parentMessageId ?? message.id,
      })
    }
    return entries
  }, [messageById, messages, threadRootMessageId])

  const renderedMessageEntries = displayEntries
  const replyCountByRootId = useMemo(() => {
    const map = new Map<string, number>()
    for (const message of messages) {
      if (!message.parentMessageId) continue
      map.set(message.parentMessageId, (map.get(message.parentMessageId) ?? 0) + 1)
    }
    return map
  }, [messages])

  const findNeighborMessageEntry = useCallback(
    (messageId: string) => {
      const index = renderedMessageEntries.findIndex((entry) => entry.message.id === messageId)
      if (index < 0) return { prev: null as DisplayMessageEntry | null, next: null as DisplayMessageEntry | null }
      return {
        prev: index > 0 ? renderedMessageEntries[index - 1]! : null,
        next: index < renderedMessageEntries.length - 1 ? renderedMessageEntries[index + 1]! : null,
      }
    },
    [renderedMessageEntries]
  )

  const tryDelete = useCallback(
    (m: ChatMessage) => {
      if (!canDelete(m) || m.isDeleted || deleteDisabled) return
      onRequestDelete(m)
    },
    [canDelete, deleteDisabled, onRequestDelete]
  )

  const tryLike = useCallback(
    (m: ChatMessage) => {
      if (!onToggleLike || likeDisabled) return
      void Haptics.selectionAsync().catch(() => {})
      if (!m.viewerHasLiked) {
        setAnimatingLikeMessageIds((current) => ({ ...current, [m.id]: true }))
        setLikeAnimationTickByMessageId((current) => ({
          ...current,
          [m.id]: (current[m.id] ?? 0) + 1,
        }))
      }
      onToggleLike(m)
    },
    [likeDisabled, onToggleLike]
  )

  const renderMessageText = useCallback(
    (rawText: string, isMine: boolean) => {
      const parts = rawText.split(INLINE_TOKEN_PATTERN).filter(Boolean)
      if (parts.length === 1) {
        const single = parts[0] ?? rawText
        if (single.startsWith('@')) {
          const parsedMention = parseMentionToken(single)
          const candidate =
            (parsedMention?.userId ? mentionById.get(parsedMention.userId) : null) ??
            (parsedMention ? mentionByHandle.get(parsedMention.handle.toLowerCase()) : null)
          const mentionUserId = parsedMention?.userId ?? candidate?.id ?? null
          if (parsedMention && mentionUserId) {
            return (
              <Text
              style={[styles.body, isMine && styles.bodyMine, styles.mentionText]}
              suppressHighlighting
              onPress={() => onPressMentionUser?.(mentionUserId)}
            >
              {getMentionDisplayText(single, candidate?.name)}
            </Text>
          )
        }
        }
        return <Text style={[styles.body, isMine && styles.bodyMine]}>{rawText}</Text>
      }

      return (
        <View style={styles.bodyFlow}>
          {parts.map((part, index) => {
            if (!part) return null
            if (/^\s+$/u.test(part)) {
              return (
                <Text key={`${index}-ws`} style={[styles.body, isMine && styles.bodyMine]}>
                  {part}
                </Text>
              )
            }
            if (!isLinkPart(part)) {
              if (part.startsWith('@')) {
                const parsedMention = parseMentionToken(part)
                const candidate =
                  (parsedMention?.userId ? mentionById.get(parsedMention.userId) : null) ??
                  (parsedMention ? mentionByHandle.get(parsedMention.handle.toLowerCase()) : null)
                const mentionUserId = parsedMention?.userId ?? candidate?.id ?? null
                if (parsedMention && mentionUserId) {
                  return (
                    <Text
                      key={`${index}-${part}`}
                      style={[styles.body, isMine && styles.bodyMine, styles.mentionText]}
                      suppressHighlighting
                      onPress={() => onPressMentionUser?.(mentionUserId)}
                    >
                      {getMentionDisplayText(part, candidate?.name)}
                    </Text>
                  )
                }
              }
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
    [mentionByHandle, mentionById, onPressMentionUser, styles]
  )

  const handleCopy = useCallback(
    async (message: ChatMessage) => {
      const text = (message.text ?? '').trim()
      if (!text) return
      try {
        await Clipboard.setStringAsync(text)
        toast.success('Copied to clipboard', 'Copied')
      } catch {
        toast.error('Failed to copy message')
      }
    },
    [toast]
  )

  const handleLongPress = useCallback(
    (message: ChatMessage) => {
      void playLongPressHaptic()
      if (!longPressMenuEnabled) {
        tryDelete(message)
        return
      }
      setMenuTarget(message)
    },
    [longPressMenuEnabled, tryDelete]
  )

  const renderReplyContext = useCallback(
    (message: ChatMessage, isMine: boolean) => {
      const replyTarget =
        message.replyToMessage ??
        (message.replyToMessageId ? messageById.get(message.replyToMessageId) ?? null : null)
      if (!replyTarget) return null
      return (
        <Pressable
          onPress={() => onPressReplyTarget?.(message, replyTarget.id)}
          disabled={!onPressReplyTarget}
          style={({ pressed }) => [
            styles.replyContext,
            isMine && styles.replyContextMine,
            pressed && onPressReplyTarget ? styles.replyContextPressed : null,
          ]}
        >
          <Text style={styles.replyContextAuthor} numberOfLines={1}>
            {replyTarget.user?.name || 'User'}
          </Text>
          <Text style={styles.replyContextText} numberOfLines={1}>
            {replyTarget.isDeleted ? 'Message removed' : formatMentionsForPreview(replyTarget.text || '', mentionCandidates)}
          </Text>
        </Pressable>
      )
    },
    [mentionCandidates, messageById, onPressReplyTarget, styles]
  )

  const renderMessageBubble = useCallback(
    (entry: DisplayMessageEntry) => {
      const m = entry.message
      const isMine = Boolean(currentUserId && m.userId === currentUserId)
      const { prev, next } = findNeighborMessageEntry(m.id)
      const sameAuthorAsPrev =
        Boolean(prev) && prev?.level === entry.level && prev?.message.userId === m.userId && prev?.threadRootId === entry.threadRootId
      const showName = !isMine && entry.level === 0 && (!prev || prev.level !== entry.level || prev.message.userId !== m.userId)
      const userTag = String(userTagByUserId?.[m.userId] ?? '').trim() || null
      const showAvatar =
        showOtherAvatars &&
        !isMine &&
        (!next || next.level !== entry.level || next.message.userId !== m.userId || next.threadRootId !== entry.threadRootId)
      const tightTop = sameAuthorAsPrev
      const deletable = canDelete(m) && !m.isDeleted && !deleteDisabled
      const likeCountValue = Math.max(0, Number(m.likeCount ?? 0))
      const isLikeAnimating = Boolean(animatingLikeMessageIds[m.id])
      const showLikeChip = Boolean(likeCountValue > 0 || m.viewerHasLiked || isLikeAnimating)
      const replyCount = threadRootMessageId ? 0 : replyCountByRootId.get(m.id) ?? 0
      const rowStyles = [
        styles.row,
        isMine ? styles.rowMine : styles.rowOther,
        entry.level === 1 ? styles.rowReply : null,
        tightTop ? styles.rowGrouped : styles.rowNewAuthor,
      ]

      return (
        <View
          key={m.id}
          style={[rowStyles, highlightedMessageId === m.id ? styles.rowHighlighted : null]}
          onLayout={(event) => {
            onMessageLayout?.(m.id, event.nativeEvent.layout.y)
          }}
        >
          {!isMine && showOtherAvatars ? (
            showAvatar ? (
              <Pressable
                onPress={() => onPressAvatar?.(m)}
                disabled={!onPressAvatar || !m.userId}
                hitSlop={8}
                style={({ pressed }) => [entry.level === 1 ? styles.replyAvatarWrap : null, pressed && styles.avatarPressed]}
              >
                <UserAvatar user={m.user} size={entry.level === 1 ? REPLY_AVATAR : AVATAR} />
              </Pressable>
            ) : (
              <View style={entry.level === 1 ? styles.replyAvatarSpacer : styles.avatarSpacer} />
            )
          ) : null}

          <Pressable
            delayLongPress={LONG_PRESS_MS}
            onPress={() => {
              if (!onToggleLike || likeDisabled) return
              const now = Date.now()
              if (lastTapMessageIdRef.current === m.id && now - lastTapAtRef.current <= LIKE_DOUBLE_TAP_MS) {
                if (singleTapTimerRef.current) {
                  clearTimeout(singleTapTimerRef.current)
                  singleTapTimerRef.current = null
                }
                lastTapMessageIdRef.current = null
                lastTapAtRef.current = 0
                tryLike(m)
                return
              }
              lastTapMessageIdRef.current = m.id
              lastTapAtRef.current = now
              if (!threadRootMessageId && entry.level === 1 && onPressRepliesSummary) {
                if (singleTapTimerRef.current) {
                  clearTimeout(singleTapTimerRef.current)
                }
                singleTapTimerRef.current = setTimeout(() => {
                  singleTapTimerRef.current = null
                  onPressRepliesSummary(messageById.get(entry.threadRootId) ?? m)
                }, LIKE_DOUBLE_TAP_MS + 16)
              }
            }}
            onLongPress={() => handleLongPress(m)}
            style={({ pressed }) => [
              styles.bubble,
              entry.level === 1 ? styles.bubbleReply : null,
              isMine ? styles.bubbleMine : styles.bubbleOther,
              pressed &&
                ((longPressMenuEnabled && !m.isDeleted) || deletable || onToggleLike) && {
                  opacity: 0.92,
                  transform: [{ scale: 0.97 }],
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
                <View style={styles.authorRow}>
                  <Text style={styles.authorName} numberOfLines={1}>
                    {m.user?.name || 'User'}
                  </Text>
                  {userTag ? (
                    <View style={styles.authorTagChip}>
                      <Text style={styles.authorTagText} numberOfLines={1}>
                        {userTag}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            {m.replyToMessageId ? renderReplyContext(m, isMine) : null}
            {renderMessageText(m.isDeleted ? 'Message removed' : m.text || '', isMine)}
            <View style={styles.metaRow}>
              {!isMine && showLikeChip ? (
                <View style={[styles.likeChipInline, m.viewerHasLiked && styles.likeChipActive]}>
                  <LikeChipIcon
                    active={Boolean(m.viewerHasLiked)}
                    color={m.viewerHasLiked ? colors.primary : colors.textMuted}
                    animateKey={likeAnimationTickByMessageId[m.id] ?? 0}
                    shouldAnimate={isLikeAnimating}
                    onAnimationEnd={() => {
                      setAnimatingLikeMessageIds((current) => {
                        if (!current[m.id]) return current
                        const nextState = { ...current }
                        delete nextState[m.id]
                        return nextState
                      })
                    }}
                  />
                  {likeCountValue > 1 ? (
                    <Text style={[styles.likeChipText, m.viewerHasLiked && styles.likeChipTextActive]}>
                      {likeCountValue}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {!isMine && replyCount > 0 ? (
                <Pressable
                  onPress={() => onPressRepliesSummary?.(m)}
                  disabled={!onPressRepliesSummary}
                  style={({ pressed }) => [
                    styles.replyCountChip,
                    pressed && onPressRepliesSummary ? styles.replyCountChipPressed : null,
                  ]}
                >
                  <Text style={styles.replyCountText}>{replyCount}</Text>
                  <MaterialCommunityIcons name="reply" size={12} color={colors.text} />
                </Pressable>
              ) : null}
              {!isMine ? <Text style={styles.time}>{formatChatTime(m.createdAt)}</Text> : null}
              {isMine ? (
                <>
                  {showLikeChip ? (
                    <View style={[styles.likeChipInline, m.viewerHasLiked && styles.likeChipActive]}>
                      <LikeChipIcon
                        active={Boolean(m.viewerHasLiked)}
                        color={m.viewerHasLiked ? colors.primary : colors.textMuted}
                        animateKey={likeAnimationTickByMessageId[m.id] ?? 0}
                        shouldAnimate={isLikeAnimating}
                        onAnimationEnd={() => {
                          setAnimatingLikeMessageIds((current) => {
                            if (!current[m.id]) return current
                            const nextState = { ...current }
                            delete nextState[m.id]
                            return nextState
                          })
                        }}
                      />
                      {likeCountValue > 1 ? (
                        <Text style={[styles.likeChipText, m.viewerHasLiked && styles.likeChipTextActive]}>
                          {likeCountValue}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {replyCount > 0 ? (
                    <Pressable
                      onPress={() => onPressRepliesSummary?.(m)}
                      disabled={!onPressRepliesSummary}
                      style={({ pressed }) => [
                        styles.replyCountChip,
                        pressed && onPressRepliesSummary ? styles.replyCountChipPressed : null,
                      ]}
                    >
                      <Text style={styles.replyCountText}>{replyCount}</Text>
                      <MaterialCommunityIcons name="reply" size={12} color={colors.text} />
                    </Pressable>
                  ) : null}
                  <View style={styles.statusWrap}>
                    {m.deliveryStatus === 'read' ? (
                      <View style={styles.statusDoubleWrap}>
                        <Feather name="check" size={11} color={colors.primary} style={styles.statusCheckBack} />
                        <Feather name="check" size={11} color={colors.primary} style={styles.statusCheckFront} />
                      </View>
                    ) : m.deliveryStatus === 'delivered' ? (
                      <View style={styles.statusDoubleWrap}>
                        <Feather name="check" size={11} color={colors.textMuted} style={styles.statusCheckBack} />
                        <Feather name="check" size={11} color={colors.textMuted} style={styles.statusCheckFront} />
                      </View>
                    ) : (
                      <Feather name="check" size={11} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={[styles.time, styles.timeMine]}>{formatChatTime(m.createdAt)}</Text>
                </>
              ) : null}
            </View>
          </Pressable>
        </View>
      )
    },
    [
      animatingLikeMessageIds,
      canDelete,
      colors.primary,
      colors.textMuted,
      currentUserId,
      deleteDisabled,
      findNeighborMessageEntry,
      highlightedMessageId,
      handleLongPress,
      likeAnimationTickByMessageId,
      likeDisabled,
      longPressMenuEnabled,
      messageById,
      onMessageLayout,
      onPressAvatar,
      onPressRepliesSummary,
      onToggleLike,
      renderMessageText,
      renderReplyContext,
      showOtherAvatars,
      styles,
      threadRootMessageId,
      tryLike,
      userTagByUserId,
    ]
  )

  const renderSelectedMessagePreview = useCallback(
    (message: ChatMessage) => {
      const isMine = Boolean(currentUserId && message.userId === currentUserId)
      return (
        <View style={[styles.previewBubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {!isMine ? (
            <Text style={styles.previewAuthor} numberOfLines={1}>
              {message.user?.name || 'User'}
            </Text>
          ) : null}
          {renderReplyContext(message, isMine)}
          {renderMessageText(message.isDeleted ? 'Message removed' : message.text || '', isMine)}
        </View>
      )
    },
    [currentUserId, renderMessageText, renderReplyContext, styles]
  )

  const rendered: any[] = []
  let currentDateKey = ''
  let dateSectionIndex = 0
  const todayKey = toLocalYmd(new Date())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toLocalYmd(yesterday)

  for (const entry of displayEntries) {
    const d = entry.message.createdAt ? new Date(entry.message.createdAt) : new Date()
    const key = toLocalYmd(d)
    if (key !== currentDateKey) {
      currentDateKey = key
      rendered.push(
        <View key={`date-${key}-${dateSectionIndex++}`} style={styles.datePillWrap}>
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>
              {key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatDate(d) || ''}
            </Text>
          </View>
        </View>
      )
    }
    rendered.push(renderMessageBubble(entry))
  }

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
      }
    }
  }, [])

  return (
    <>
      <View style={styles.root}>{rendered}</View>

      <AppBottomSheet
        open={Boolean(menuTarget)}
        onClose={() => setMenuTarget(null)}
        onDismissed={() => {
          if (!pendingDeleteTarget) return
          onRequestDelete(pendingDeleteTarget)
          setPendingDeleteTarget(null)
        }}
        title="Message actions"
        titleBelow={menuTarget ? renderSelectedMessagePreview(menuTarget) : null}
      >
        <View style={styles.menuList}>
          {onRequestReply && menuTarget && !menuTarget.isDeleted ? (
            <Pressable
              onPress={() => {
                const target = menuTarget
                setMenuTarget(null)
                onRequestReply(target)
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Feather name="corner-up-left" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Reply</Text>
            </Pressable>
          ) : null}

          {onToggleLike && menuTarget ? (
            <Pressable
              onPress={() => {
                const target = menuTarget
                setMenuTarget(null)
                tryLike(target)
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <MaterialCommunityIcons
                name={menuTarget.viewerHasLiked ? 'heart-off-outline' : 'heart-outline'}
                size={19}
                color={colors.text}
              />
              <Text style={styles.menuItemText}>
                {menuTarget.viewerHasLiked ? 'Remove like' : 'Like message'}
              </Text>
            </Pressable>
          ) : null}

          {menuTarget && (menuTarget.text ?? '').trim().length > 0 ? (
            <Pressable
              onPress={() => {
                const target = menuTarget
                setMenuTarget(null)
                void handleCopy(target)
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Feather name="copy" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Copy</Text>
            </Pressable>
          ) : null}

          {menuTarget && canDelete(menuTarget) && !menuTarget.isDeleted ? (
            <Pressable
              onPress={() => {
                const target = menuTarget
                setPendingDeleteTarget(target)
                setMenuTarget(null)
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete message</Text>
            </Pressable>
          ) : null}
        </View>
      </AppBottomSheet>
    </>
  )
}

const createStyles = (colors: ThemePalette, theme: AppTheme) =>
  StyleSheet.create({
    root: {
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
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
    rowHighlighted: {
      borderRadius: 18,
      backgroundColor: theme === 'dark' ? 'rgba(117, 230, 109, 0.08)' : 'rgba(117, 230, 109, 0.14)',
    },
    rowMine: {
      justifyContent: 'flex-end',
    },
    rowOther: {
      justifyContent: 'flex-start',
    },
    rowReply: {
      paddingLeft: 22,
    },
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
    replyAvatarSpacer: {
      width: REPLY_AVATAR,
      height: REPLY_AVATAR,
    },
    replyAvatarWrap: {
      marginBottom: 2,
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
      overflow: 'visible',
    },
    bubbleReply: {
      maxWidth: '76%',
      paddingHorizontal: 12,
      paddingVertical: 9,
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
      backgroundColor: theme === 'light' ? 'rgba(10, 10, 10, 0.045)' : colors.surfaceMuted,
    },
    previewBubble: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    previewAuthor: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 4,
    },
    authorName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 0,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
      minWidth: 0,
      alignSelf: 'flex-start',
    },
    authorTagChip: {
      maxWidth: 110,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 3,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    authorTagText: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.primary,
    },
    body: {
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
      maxWidth: '100%',
      flexShrink: 1,
      minWidth: 0,
    },
    bodyMine: {
      color: theme === 'dark' ? colors.white : colors.text,
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
    mentionText: {
      color: colors.primary,
      fontWeight: '600',
    },
    replyContext: {
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      paddingLeft: 8,
      marginBottom: 7,
      gap: 1,
    },
    replyContextPressed: {
      opacity: 0.82,
    },
    replyContextMine: {
      borderLeftColor: theme === 'dark' ? colors.white : colors.primary,
    },
    replyContextAuthor: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    replyContextText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    likeChipInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      height: 18,
      borderRadius: 999,
      backgroundColor: 'transparent',
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
    time: {
      fontSize: 10,
      color: colors.textMuted,
    },
    timeMine: {
      color: colors.textMuted,
    },
    metaRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 4,
    },
    replyCountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginRight: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
    },
    replyCountChipPressed: {
      opacity: 0.72,
    },
    replyCountText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
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
    replySummaryRow: {
      paddingLeft: 54,
      marginTop: 8,
    },
    replySummaryPressed: {
      opacity: 0.7,
    },
    replySummaryText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    menuList: {
      gap: 8,
      paddingBottom: spacing.xs,
    },
    menuItem: {
      minHeight: 48,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    menuItemPressed: {
      opacity: 0.86,
    },
    menuItemText: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    menuItemDanger: {
      color: colors.danger,
    },
  })
