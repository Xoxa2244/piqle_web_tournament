import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../../src/components/AuthRequiredCard'
import { ChatScreenLoading } from '../../../../../src/components/ChatScreenLoading'
import { ChatComposer } from '../../../../../src/components/ChatComposer'
import { ChatMentionAnchorIndicator } from '../../../../../src/components/ChatMentionAnchorIndicator'
import { ChatMentionPicker } from '../../../../../src/components/ChatMentionPicker'
import { ChatScrollToBottomButton } from '../../../../../src/components/ChatScrollToBottomButton'
import { ChatThreadMessageList } from '../../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../../src/components/ChatThreadRoot'
import { mergeMessagesByStableLiveOrder, type ChatMessage } from '../../../../../src/lib/chatMessages'
import {
  applyMentionCandidate,
  encodeMentionsForSend,
  findActiveMentionQuery,
  formatMentionsForPreview,
  toMentionCandidate,
} from '../../../../../src/lib/chatMentions'
import {
  buildDivisionMentionNotificationId,
  getDivisionMentionMessageIds,
  getTournamentMentionMessageIds,
  buildTournamentMentionNotificationId,
} from '../../../../../src/lib/chatMentionNotifications'
import { PageLayout } from '../../../../../src/components/navigation/PageLayout'
import { UnreadIndicatorDot } from '../../../../../src/components/UnreadIndicatorDot'
import { ActionButton, EmptyState, LoadingBlock, Screen } from '../../../../../src/components/ui'
import {
  useChatRealtimeQueryOptions,
  useMessageThreadRealtimeQueryOptions,
  useRealtimeAwareQueryOptions,
} from '../../../../../src/lib/realtimePoll'
import { trpc } from '../../../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../../src/providers/AuthProvider'
import { useNotificationSwipeHidden } from '../../../../../src/providers/NotificationSwipeHiddenProvider'
import { useAppTheme } from '../../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../../src/providers/ToastProvider'

/** Как в клубном чате: `CLUB_COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMPOSER_IDLE_BOTTOM_EXTRA = 24
const CLIENT_SEND_COOLDOWN_MS = 400

export default function TournamentChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ tournamentId: string; title?: string; divisionId?: string }>()
  const tournamentId = params.tournamentId
  const title = params.title || 'Event chat'
  const paramDivisionId = typeof params.divisionId === 'string' && params.divisionId ? params.divisionId : null
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(paramDivisionId)

  useEffect(() => {
    setSelectedDivisionId(paramDivisionId)
  }, [tournamentId, paramDivisionId])

  const activeDivisionId = selectedDivisionId
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const chatRealtimeQueryOptions = useChatRealtimeQueryOptions()
  const messageThreadRealtimeQueryOptions = useMessageThreadRealtimeQueryOptions()
  const realtimeAwareQueryOptions = useRealtimeAwareQueryOptions()
  const utils = trpc.useUtils()
  const { swipeHiddenIds, setSwipeHiddenIds } = useNotificationSwipeHidden()
  const scrollRef = useRef<ScrollView>(null)
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const activeMentionQuery = useMemo(() => findActiveMentionQuery(draft), [draft])
  const [seenMentionMessageIds, setSeenMentionMessageIds] = useState<string[]>([])
  const messageOffsetsRef = useRef(new Map<string, number>())
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialScrollDoneRef = useRef(false)
  const messageOrderRef = useRef(new Map<string, number>())
  const nextMessageOrderRef = useRef(0)
  const lastMarkedReadKeyRef = useRef<string | null>(null)
  const tournamentLikeMutationSeqRef = useRef<Record<string, number>>({})
  const divisionLikeMutationSeqRef = useRef<Record<string, number>>({})
  const lastSendAtRef = useRef(0)
  const threadContentOpacity = useRef(new Animated.Value(1)).current
  const skipThreadTopicFadeRef = useRef(true)

  useEffect(() => {
    skipThreadTopicFadeRef.current = true
    initialScrollDoneRef.current = false
    lastMarkedReadKeyRef.current = null
  }, [tournamentId])

  useEffect(() => {
    initialScrollDoneRef.current = false
    lastMarkedReadKeyRef.current = null
  }, [activeDivisionId])

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    },
    []
  )

  useEffect(() => {
    if (skipThreadTopicFadeRef.current) {
      skipThreadTopicFadeRef.current = false
      return
    }
    threadContentOpacity.setValue(0.78)
    Animated.timing(threadContentOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [activeDivisionId, threadContentOpacity])

  const scrollToBottom = useCallback((animated = true) => {
    setShowScrollToBottom(false)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])
  const handleThreadScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
    setShowScrollToBottom(distanceFromBottom > 140)
  }, [])
  const handleMessageLayout = useCallback((messageId: string, y: number) => {
    messageOffsetsRef.current.set(messageId, y)
  }, [])
  const scrollToMessage = useCallback((messageId: string) => {
    const y = messageOffsetsRef.current.get(messageId)
    if (y == null) return false
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true })
    setHighlightedMessageId(messageId)
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current))
      highlightTimeoutRef.current = null
    }, 1400)
    return true
  }, [])
  const dismissNotification = trpc.notification.dismiss.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })
  const mentionNotificationsQuery = trpc.notification.list.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated, ...realtimeAwareQueryOptions }
  )
  const markMentionSeen = useCallback(
    (messageId: string) => {
      const notificationId = activeDivisionId
        ? buildDivisionMentionNotificationId(messageId)
        : buildTournamentMentionNotificationId(messageId)
      setSeenMentionMessageIds((current) => (current.includes(messageId) ? current : [...current, messageId]))
      setSwipeHiddenIds((current) => {
        if (current.has(notificationId)) return current
        const next = new Set(current)
        next.add(notificationId)
        return next
      })
      utils.notification.list.setData({ limit: 100 }, (current: any) => {
        if (!current?.items) return current
        const removed = (current.items as any[]).find((item) => String(item?.id ?? '') === notificationId)
        const nextItems = (current.items as any[]).filter((item) => String(item?.id ?? '') !== notificationId)
        const wasUnread = Boolean(removed && !(removed.readAt ?? null))
        return {
          ...current,
          items: nextItems,
          unreadCount: Math.max(0, Number(current.unreadCount ?? 0) - (wasUnread ? 1 : 0)),
        }
      })
      utils.notification.list.setData({ limit: 40 }, (current: any) => {
        if (!current?.items) return current
        const removed = (current.items as any[]).find((item) => String(item?.id ?? '') === notificationId)
        const nextItems = (current.items as any[]).filter((item) => String(item?.id ?? '') !== notificationId)
        const wasUnread = Boolean(removed && !(removed.readAt ?? null))
        return {
          ...current,
          items: nextItems,
          unreadCount: Math.max(0, Number(current.unreadCount ?? 0) - (wasUnread ? 1 : 0)),
        }
      })
      dismissNotification.mutate({ notificationId })
    },
    [activeDivisionId, dismissNotification, setSwipeHiddenIds, utils.notification.list]
  )

  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: Boolean(tournamentId) && isAuthenticated,
    ...chatRealtimeQueryOptions,
  })
  const eventMeta = useMemo(() => {
    const all = (eventChatsQuery.data ?? []) as any[]
    return all.find((e) => e.id === tournamentId) ?? null
  }, [eventChatsQuery.data, tournamentId])

  const permissionsQuery = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId, divisionIds: activeDivisionId ? [activeDivisionId] : undefined },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const tournamentMessagesQuery = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit: 100 },
    {
      enabled: Boolean(tournamentId) && isAuthenticated && !activeDivisionId,
      ...messageThreadRealtimeQueryOptions,
    }
  )
  const divisionMessagesQuery = trpc.tournamentChat.listDivision.useQuery(
    { divisionId: activeDivisionId || '', limit: 100 },
    { enabled: Boolean(activeDivisionId) && isAuthenticated, ...messageThreadRealtimeQueryOptions }
  )
  const mentionCandidatesQuery = trpc.tournamentChat.listMentionCandidates.useQuery(
    { tournamentId, divisionId: activeDivisionId || undefined },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const mentionCandidates = useMemo(
    () => ((mentionCandidatesQuery.data ?? []) as any[]).map((user) => toMentionCandidate(user)).filter((candidate) => candidate.id !== user?.id),
    [mentionCandidatesQuery.data, user?.id]
  )
  const filteredMentionCandidates = useMemo(() => {
    if (activeMentionQuery === null) return []
    const query = activeMentionQuery.trim().toLowerCase()
    return mentionCandidates
      .filter((candidate) => !query || candidate.handle.toLowerCase().includes(query) || candidate.name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [activeMentionQuery, mentionCandidates])
  const clearEventUnreadCache = useCallback(
    (divisionId?: string | null) => {
      if (!tournamentId) return
      utils.tournamentChat.listMyEventChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((event) => {
          if (event.id !== tournamentId) return event
          if (divisionId) {
            return {
              ...event,
              divisions: (event.divisions ?? []).map((division: any) =>
                division.id === divisionId ? { ...division, unreadCount: 0 } : division
              ),
            }
          }
          return { ...event, unreadCount: 0 }
        })
      )
    },
    [tournamentId, utils.tournamentChat.listMyEventChats]
  )
  const markRead = trpc.tournamentChat.markTournamentRead.useMutation({
    onMutate: () => {
      clearEventUnreadCache(null)
    },
    onSuccess: () => {
      clearEventUnreadCache(null)
    },
  })
  const markDivisionRead = trpc.tournamentChat.markDivisionRead.useMutation({
    onMutate: ({ divisionId }: { divisionId: string }) => {
      clearEventUnreadCache(divisionId)
    },
    onSuccess: (_data: unknown, variables: { divisionId: string }) => {
      clearEventUnreadCache(variables.divisionId)
    },
  })
  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onMutate: ({ text, replyToMessageId }: { text: string; replyToMessageId?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !tournamentId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-tournament-${tournamentId}-${createdAt.getTime()}`
      const resolvedReplyTarget =
        replyTarget && replyToMessageId === replyTarget.id ? replyTarget : null
      const optimisticMessage = {
        id: optimisticId,
        tournamentId,
        userId: user.id,
        text: trimmed,
        parentMessageId: resolvedReplyTarget ? resolvedReplyTarget.parentMessageId ?? resolvedReplyTarget.id : null,
        replyToMessageId: resolvedReplyTarget ? resolvedReplyTarget.id : null,
        replyToMessage: resolvedReplyTarget
          ? {
              id: resolvedReplyTarget.id,
              userId: resolvedReplyTarget.userId,
              text: resolvedReplyTarget.text,
              isDeleted: resolvedReplyTarget.isDeleted,
              createdAt: resolvedReplyTarget.createdAt,
              user: resolvedReplyTarget.user,
            }
          : null,
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        deliveryStatus: 'sent' as const,
        createdAt,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
        clientOrder: nextMessageOrderRef.current,
      }

      const previousEvents = ((utils.tournamentChat.listMyEventChats.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
      setReplyTarget(null)
      setOptimisticMessages((current) => [...current, optimisticMessage])
      utils.tournamentChat.listMyEventChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((event) =>
          event.id === tournamentId ? { ...event, unreadCount: 0, lastMessageAt: createdAt } : event
        )
      )

      return { optimisticId, previousEvents }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      utils.tournamentChat.listTournament.setData({ tournamentId, limit: 100 }, (current: any[] | undefined) => {
        const list = (current ?? []) as any[]
        if (list.some((message) => message.id === data.id)) return list
        return [...list, data]
      })
      utils.tournamentChat.listMyEventChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((event) =>
          event.id === tournamentId ? { ...event, unreadCount: 0, lastMessageAt: data.createdAt } : event
        )
      )
      clearEventUnreadCache(null)
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (e: any, _vars: unknown, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (context?.previousEvents) {
        utils.tournamentChat.listMyEventChats.setData(undefined, context.previousEvents)
      }
      toast.error(e.message || 'Failed to send message')
    },
  })
  const sendDivisionMessage = trpc.tournamentChat.sendDivision.useMutation({
    onMutate: ({ text, divisionId, replyToMessageId }: { text: string; divisionId: string; replyToMessageId?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !divisionId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-division-${divisionId}-${createdAt.getTime()}`
      const resolvedReplyTarget =
        replyTarget && replyToMessageId === replyTarget.id ? replyTarget : null
      const optimisticMessage = {
        id: optimisticId,
        divisionId,
        userId: user.id,
        text: trimmed,
        parentMessageId: resolvedReplyTarget ? resolvedReplyTarget.parentMessageId ?? resolvedReplyTarget.id : null,
        replyToMessageId: resolvedReplyTarget ? resolvedReplyTarget.id : null,
        replyToMessage: resolvedReplyTarget
          ? {
              id: resolvedReplyTarget.id,
              userId: resolvedReplyTarget.userId,
              text: resolvedReplyTarget.text,
              isDeleted: resolvedReplyTarget.isDeleted,
              createdAt: resolvedReplyTarget.createdAt,
              user: resolvedReplyTarget.user,
            }
          : null,
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        deliveryStatus: 'sent' as const,
        createdAt,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
        clientOrder: nextMessageOrderRef.current,
      }

      const previousEvents = ((utils.tournamentChat.listMyEventChats.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
      setReplyTarget(null)
      setOptimisticMessages((current) => [...current, optimisticMessage])
      clearEventUnreadCache(divisionId)

      return { optimisticId, previousEvents }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (activeDivisionId) {
        utils.tournamentChat.listDivision.setData(
          { divisionId: activeDivisionId, limit: 100 },
          (current: any[] | undefined) => {
            const list = (current ?? []) as any[]
            if (list.some((message) => message.id === data.id)) return list
            return [...list, data]
          }
        )
      }
      if (activeDivisionId) {
        clearEventUnreadCache(activeDivisionId)
      }
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (e: any, _vars: unknown, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (context?.previousEvents) {
        utils.tournamentChat.listMyEventChats.setData(undefined, context.previousEvents)
      }
      toast.error(e.message || 'Failed to send message')
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteTournament.useMutation({
    onMutate: ({ messageId }: { messageId: string }) => {
      const deletedAt = new Date()
      utils.tournamentChat.listTournament.setData({ tournamentId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) => {
          if (message.id === messageId) {
            return {
              ...message,
              text: null,
              isDeleted: true,
              deletedAt,
              deletedByUserId: user?.id ?? null,
            }
          }
          if (message.replyToMessageId === messageId && message.replyToMessage) {
            return {
              ...message,
              replyToMessage: {
                ...message.replyToMessage,
                text: null,
                isDeleted: true,
                deletedAt,
              },
            }
          }
          return message
        })
      )
    },
    onSuccess: () => {
      /* optimistic state already applied */
    },
  })
  const deleteDivisionMessage = trpc.tournamentChat.deleteDivision.useMutation({
    onMutate: ({ messageId }: { messageId: string }) => {
      if (!activeDivisionId) return
      const deletedAt = new Date()
      utils.tournamentChat.listDivision.setData({ divisionId: activeDivisionId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) => {
          if (message.id === messageId) {
            return {
              ...message,
              text: null,
              isDeleted: true,
              deletedAt,
              deletedByUserId: user?.id ?? null,
            }
          }
          if (message.replyToMessageId === messageId && message.replyToMessage) {
            return {
              ...message,
              replyToMessage: {
                ...message.replyToMessage,
                text: null,
                isDeleted: true,
                deletedAt,
              },
            }
          }
          return message
        })
      )
    },
    onSuccess: () => {
      /* optimistic state already applied */
    },
  })
  const likeTournamentMessage = trpc.tournamentChat.likeTournamentMessage.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      await utils.tournamentChat.listTournament.cancel({ tournamentId, limit: 100 })
      const seq = (tournamentLikeMutationSeqRef.current[messageId] ?? 0) + 1
      tournamentLikeMutationSeqRef.current[messageId] = seq
      let previousState: { likeCount: number; viewerHasLiked: boolean } | null = null
      utils.tournamentChat.listTournament.setData({ tournamentId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === messageId
            ? (() => {
                previousState = {
                  likeCount: Number(message.likeCount ?? 0),
                  viewerHasLiked: Boolean(message.viewerHasLiked),
                }
                return {
                  ...message,
                  likeCount: previousState.viewerHasLiked
                    ? Math.max(0, previousState.likeCount - 1)
                    : previousState.likeCount + 1,
                  viewerHasLiked: !previousState.viewerHasLiked,
                }
              })()
            : message
        )
      )
      return { messageId, previousState, seq }
    },
    onSuccess: (data: any, _vars: unknown, context: any) => {
      if (!context || tournamentLikeMutationSeqRef.current[data.messageId] !== context.seq) return
      utils.tournamentChat.listTournament.setData({ tournamentId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === data.messageId
            ? { ...message, likeCount: data.likeCount, viewerHasLiked: data.viewerHasLiked }
            : message
        )
      )
    },
    onError: (error: any, variables: { messageId: string }, context: any) => {
      if (!context?.previousState || tournamentLikeMutationSeqRef.current[variables.messageId] !== context.seq) return
      utils.tournamentChat.listTournament.setData({ tournamentId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === variables.messageId
            ? {
                ...message,
                likeCount: context.previousState.likeCount,
                viewerHasLiked: context.previousState.viewerHasLiked,
              }
            : message
        )
      )
      toast.error(error.message || 'Failed to like message')
    },
  })
  const likeDivisionMessage = trpc.tournamentChat.likeDivisionMessage.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      if (!activeDivisionId) return
      await utils.tournamentChat.listDivision.cancel({ divisionId: activeDivisionId, limit: 100 })
      const seq = (divisionLikeMutationSeqRef.current[messageId] ?? 0) + 1
      divisionLikeMutationSeqRef.current[messageId] = seq
      let previousState: { likeCount: number; viewerHasLiked: boolean } | null = null
      utils.tournamentChat.listDivision.setData({ divisionId: activeDivisionId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === messageId
            ? (() => {
                previousState = {
                  likeCount: Number(message.likeCount ?? 0),
                  viewerHasLiked: Boolean(message.viewerHasLiked),
                }
                return {
                  ...message,
                  likeCount: previousState.viewerHasLiked
                    ? Math.max(0, previousState.likeCount - 1)
                    : previousState.likeCount + 1,
                  viewerHasLiked: !previousState.viewerHasLiked,
                }
              })()
            : message
        )
      )
      return { messageId, previousState, seq }
    },
    onSuccess: (data: any, _vars: unknown, context: any) => {
      if (!activeDivisionId) return
      if (!context || divisionLikeMutationSeqRef.current[data.messageId] !== context.seq) return
      utils.tournamentChat.listDivision.setData({ divisionId: activeDivisionId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === data.messageId
            ? { ...message, likeCount: data.likeCount, viewerHasLiked: data.viewerHasLiked }
            : message
        )
      )
    },
    onError: (error: any, variables: { messageId: string }, context: any) => {
      if (activeDivisionId && context?.previousState && divisionLikeMutationSeqRef.current[variables.messageId] === context.seq) {
        utils.tournamentChat.listDivision.setData({ divisionId: activeDivisionId, limit: 100 }, (current: any[] | undefined) =>
          (current ?? []).map((message) =>
            message.id === variables.messageId
              ? {
                  ...message,
                  likeCount: context.previousState.likeCount,
                  viewerHasLiked: context.previousState.viewerHasLiked,
                }
              : message
          )
        )
      }
      toast.error(error.message || 'Failed to like message')
    },
  })

  const handleSend = useCallback(() => {
    const text = encodeMentionsForSend(draft.trim(), mentionCandidates)
    if (!text) return

    const now = Date.now()
    if (now - lastSendAtRef.current < CLIENT_SEND_COOLDOWN_MS) {
      toast.error('Slow down a bit.')
      return
    }
    lastSendAtRef.current = now
    if (activeDivisionId) {
      sendDivisionMessage.mutate({ divisionId: activeDivisionId, text, replyToMessageId: replyTarget?.id })
      return
    }
    sendMessage.mutate({ tournamentId, text, replyToMessageId: replyTarget?.id })
  }, [activeDivisionId, draft, mentionCandidates, replyTarget?.id, sendDivisionMessage, sendMessage, toast, tournamentId])

  const permission = permissionsQuery.data?.tournament
  const activeDivisionPermission = activeDivisionId ? permissionsQuery.data?.divisions?.[0] : null
  const messagesLen = ((activeDivisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []).length

  useEffect(() => {
    if (!tournamentId || !isAuthenticated) return
    const markTarget = activeDivisionId ? `division:${activeDivisionId}` : `tournament:${tournamentId}`
    const markReadKey = `${markTarget}:${messagesLen}`
    if (lastMarkedReadKeyRef.current === markReadKey) return
    lastMarkedReadKeyRef.current = markReadKey
    if (activeDivisionId) {
      markDivisionRead.mutate({ divisionId: activeDivisionId })
    } else {
      markRead.mutate({ tournamentId })
    }
  }, [tournamentId, isAuthenticated, activeDivisionId, markDivisionRead, markRead])

  useEffect(() => {
    if (messagesLen === 0) return
    if (!initialScrollDoneRef.current) return
    scrollToBottom(true)
  }, [messagesLen, activeDivisionId, scrollToBottom])

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s = Keyboard.addListener(showEv, () => setKeyboardVisible(true))
    const h = Keyboard.addListener(hideEv, () => setKeyboardVisible(false))
    const didShow = Keyboard.addListener('keyboardDidShow', () => scrollToBottom(true))
    return () => {
      s.remove()
      h.remove()
      didShow.remove()
    }
  }, [scrollToBottom])

  const messages = useMemo(() => {
    const serverMessages = ((activeDivisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []) as ChatMessage[]
    return mergeMessagesByStableLiveOrder(
      serverMessages,
      optimisticMessages,
      messageOrderRef.current,
      nextMessageOrderRef
    )
  }, [activeDivisionId, divisionMessagesQuery.data, tournamentMessagesQuery.data, optimisticMessages])
  const unseenMentionMessageIds = useMemo(
    () => {
      const visibleItems = ((mentionNotificationsQuery.data?.items ?? []) as any[]).filter(
        (item) => !swipeHiddenIds.has(String(item?.id ?? ''))
      )
      const ids = activeDivisionId
        ? getDivisionMentionMessageIds(visibleItems, activeDivisionId)
        : getTournamentMentionMessageIds(visibleItems, tournamentId)
      return ids.filter((messageId) => !seenMentionMessageIds.includes(messageId))
    },
    [activeDivisionId, mentionNotificationsQuery.data?.items, seenMentionMessageIds, swipeHiddenIds, tournamentId]
  )

  if (!isAuthenticated) {
    return (
      <Screen title={title} subtitle="Sign in to access tournament chat.">
        <AuthRequiredCard
          title="Authentication required"
          body="Tournament chat is restricted to participants and admins."
        />
      </Screen>
    )
  }

  const messagesLoading = activeDivisionId
    ? divisionMessagesQuery.isLoading
    : tournamentMessagesQuery.isLoading

  if (permissionsQuery.isLoading) {
    return <ChatScreenLoading title={title} />
  }

  const hasAccess = permission?.canView && (!activeDivisionId || activeDivisionPermission?.canView)
  if (!permissionsQuery.isLoading && !hasAccess) {
    if (activeDivisionId) {
      return (
        <Screen title={title} subtitle="Division thread.">
          <EmptyState title="Chat unavailable" body={activeDivisionPermission?.reason || 'You do not have access to this division thread.'} />
        </Screen>
      )
    }
    return (
      <Screen title={title} subtitle="Tournament-wide event thread.">
        <EmptyState title="Chat unavailable" body={permission?.reason || 'You do not have access to this thread.'} />
      </Screen>
    )
  }

  const divisions = (eventMeta?.divisions ?? []) as any[]
  const activeDivision = activeDivisionId ? divisions.find((d: any) => d.id === activeDivisionId) ?? null : null
  const canPost = activeDivisionId ? Boolean(activeDivisionPermission?.canPost) : Boolean(permission?.canPost)
  const canModerate = activeDivisionId ? Boolean(activeDivisionPermission?.canModerate) : Boolean(permission?.canModerate)
  const isEmpty = (messages.length ?? 0) === 0
  const topicBar = (
    <View style={styles.topicBarWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topicBar}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topicBarItem}>
          <Pressable
            onPress={() => setSelectedDivisionId(null)}
            style={[styles.topicPill, !activeDivisionId && styles.topicPillActive]}
          >
            <Feather name="award" size={16} color={!activeDivisionId ? colors.white : colors.textMuted} />
            <Text style={[styles.topicPillText, !activeDivisionId && styles.topicPillTextActive]}>General Chat</Text>
          </Pressable>
          {eventMeta?.unreadCount ? (
            <View style={styles.topicUnreadDotWrap} accessibilityLabel="Unread messages">
              <UnreadIndicatorDot />
            </View>
          ) : null}
        </View>

        {divisions.map((d: any) => (
          <View key={d.id} style={styles.topicBarItem}>
            <Pressable
              onPress={() => setSelectedDivisionId(d.id)}
              style={[styles.topicPill, activeDivisionId === d.id && styles.topicPillActive]}
            >
              <Feather name="hash" size={16} color={activeDivisionId === d.id ? colors.white : colors.textMuted} />
              <Text
                style={[styles.topicPillText, activeDivisionId === d.id && styles.topicPillTextActive]}
                numberOfLines={1}
              >
                {d.name}
              </Text>
            </Pressable>
            {d.unreadCount ? (
              <View style={styles.topicUnreadDotWrap} accessibilityLabel="Unread messages">
                <UnreadIndicatorDot />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  )

  return (
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitle={title}
      topBarRightSlot={
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/chats/event/tournament/[tournamentId]/members',
              params: {
                tournamentId,
                title,
                divisionId: activeDivisionId ?? undefined,
              },
            })
          }
          style={({ pressed }) => [
            styles.topBarIconButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.topBarIconButtonPressed,
          ]}
        >
          <Feather name="users" size={18} color={colors.text} />
        </Pressable>
      }
      onTopBarTitlePress={() => {
        if (!tournamentId) return
        router.push(`/tournaments/${tournamentId}`)
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {topicBar}
        <Animated.View style={[styles.threadFadeWrap, { opacity: threadContentOpacity }]}>
          <ChatThreadRoot
            ref={scrollRef}
            contentContainerStyle={[styles.scrollContent, (isEmpty || messagesLoading) && styles.messagesEmpty]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleThreadScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if ((messagesLen === 0 && !messagesLoading) || initialScrollDoneRef.current) return
              initialScrollDoneRef.current = true
              scrollToBottom(false)
            }}
          >
            {messagesLoading && messages.length === 0 ? (
              <LoadingBlock label="Loading messages…" />
            ) : isEmpty ? (
              <EmptyState
                title="No messages yet"
                body="Say hi to other players or ask the organizer a question."
              />
            ) : (
              <ChatThreadMessageList
                messages={messages as ChatMessage[]}
                currentUserId={user?.id}
                onToggleLike={(m) => {
                  if (activeDivisionId) {
                    likeDivisionMessage.mutate({ messageId: m.id })
                    return
                  }
                  likeTournamentMessage.mutate({ messageId: m.id })
                }}
                onRequestReply={(m) => setReplyTarget(m)}
                onPressRepliesSummary={(m) => {
                  if (activeDivisionId) {
                    router.push({
                      pathname: '/chats/event/division/[divisionId]/thread/[rootMessageId]',
                      params: {
                        divisionId: activeDivisionId,
                        rootMessageId: m.id,
                        tournamentId,
                        title: activeDivision?.name || 'Division chat',
                        eventTitle: title,
                      },
                    })
                    return
                  }
                  router.push({
                    pathname: '/chats/event/tournament/[tournamentId]/thread/[rootMessageId]',
                    params: {
                      tournamentId,
                      rootMessageId: m.id,
                      title,
                    },
                  })
                }}
                onPressReplyTarget={(message, targetMessageId) => {
                  if (scrollToMessage(targetMessageId)) return
                  if (activeDivisionId) {
                    router.push({
                      pathname: '/chats/event/division/[divisionId]/thread/[rootMessageId]',
                      params: {
                        divisionId: activeDivisionId,
                        rootMessageId: message.parentMessageId ?? message.id,
                        tournamentId,
                        title: activeDivision?.name || 'Division chat',
                        eventTitle: title,
                      },
                    })
                    return
                  }
                  router.push({
                    pathname: '/chats/event/tournament/[tournamentId]/thread/[rootMessageId]',
                    params: {
                      tournamentId,
                      rootMessageId: message.parentMessageId ?? message.id,
                      title,
                    },
                  })
                }}
                onMessageLayout={handleMessageLayout}
                highlightedMessageId={highlightedMessageId}
                onPressAvatar={(m) => {
                  if (!m.userId) return
                  router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
                }}
                mentionCandidates={mentionCandidates}
                onPressMentionUser={(userId) => {
                  router.push({ pathname: '/profile/[id]', params: { id: userId } })
                }}
                canDelete={(m) => {
                  const mine = Boolean(user?.id && m.userId === user?.id)
                  return Boolean((mine || canModerate) && !m.isDeleted)
                }}
                onRequestDelete={(m) => setDeleteTargetId(m.id)}
                deleteDisabled={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
                longPressMenuEnabled
              />
            )}
          </ChatThreadRoot>
          <ChatScrollToBottomButton visible={showScrollToBottom} onPress={() => scrollToBottom(true)} />
        </Animated.View>

        {canPost ? (
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${activeDivision ? activeDivision.name : 'General Chat'}...`}
            onSend={handleSend}
            sendDisabled={
              draft.trim().length === 0
            }
            paddingHorizontal={16}
            paddingBottom={16 + (keyboardVisible ? 0 : COMPOSER_IDLE_BOTTOM_EXTRA)}
            multiline={false}
            topSlot={
              unseenMentionMessageIds.length > 0 || replyTarget ? (
                <View style={styles.composerTopStack}>
                  {unseenMentionMessageIds.length > 0 ? (
                  <ChatMentionAnchorIndicator
                    count={unseenMentionMessageIds.length}
                    onPress={() => {
                      const targetMessageId = unseenMentionMessageIds[0]
                      if (!targetMessageId) return
                      const didScroll = scrollToMessage(targetMessageId)
                      if (!didScroll) return
                      markMentionSeen(targetMessageId)
                    }}
                  />
                ) : null}
                  {replyTarget ? (
                    <View style={styles.replyComposerCard}>
                      <View style={styles.replyComposerBody}>
                        <Text style={styles.replyComposerLabel} numberOfLines={1}>
                          Replying to {replyTarget.user?.name || 'User'}
                        </Text>
                        <Text style={styles.replyComposerText} numberOfLines={1}>
                          {replyTarget.isDeleted ? 'Message removed' : formatMentionsForPreview(replyTarget.text || '', mentionCandidates)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setReplyTarget(null)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.replyComposerClose, pressed && { opacity: 0.72 }]}
                      >
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null
            }
            bottomSlot={
              activeMentionQuery !== null ? (
                <ChatMentionPicker
                  candidates={filteredMentionCandidates}
                  onSelect={(candidate) => setDraft((current) => applyMentionCandidate(current, candidate))}
                />
              ) : null
            }
          />
        ) : null}
      </KeyboardAvoidingView>

      <AppBottomSheet
        open={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        title="Delete this message?"
        subtitle="This message will be permanently removed."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={
              (activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending)
                ? 'Deleting…'
                : 'Delete'
            }
            onCancel={() => setDeleteTargetId(null)}
            onConfirm={() => {
              const messageId = deleteTargetId
              setDeleteTargetId(null)
              if (!messageId) return
              if (activeDivisionId) {
                deleteDivisionMessage.mutate({ messageId })
                return
              }
              deleteMessage.mutate({ messageId })
            }}
            confirmLoading={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
          />
        }
      />
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  threadFadeWrap: {
    flex: 1,
    minHeight: 0,
  },
  topicBarWrap: {
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topicBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  topicBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicPill: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 220,
    flexDirection: 'row',
    gap: 10,
  },
  topicPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  topicPillText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  topicPillTextActive: {
    color: colors.white,
  },
  topicUnreadDotWrap: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: 12,
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingBottom: 0,
  },
  topBarIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  topBarIconButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  composerTopStack: {
    gap: 10,
  },
  replyComposerCard: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  replyComposerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  replyComposerLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  replyComposerText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  replyComposerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
