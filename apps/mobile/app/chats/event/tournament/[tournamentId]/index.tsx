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
import { ChatThreadMessageList } from '../../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../../src/components/ChatThreadRoot'
import { mergeMessagesByStableLiveOrder, type ChatMessage } from '../../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../../src/components/navigation/PageLayout'
import { UnreadIndicatorDot } from '../../../../../src/components/UnreadIndicatorDot'
import { ActionButton, EmptyState, LoadingBlock, Screen } from '../../../../../src/components/ui'
import { chatRealtimeQueryOptions, messageThreadRealtimeQueryOptions } from '../../../../../src/lib/realtimePoll'
import { trpc } from '../../../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../../src/providers/ToastProvider'

/** Как в клубном чате: `CLUB_COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMPOSER_IDLE_BOTTOM_EXTRA = 24
const CLIENT_SEND_COOLDOWN_MS = 400
const CLIENT_DUPLICATE_GUARD_MS = 10_000

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
  const utils = trpc.useUtils()
  const scrollRef = useRef<ScrollView>(null)
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const initialScrollDoneRef = useRef(false)
  const messageOrderRef = useRef(new Map<string, number>())
  const nextMessageOrderRef = useRef(0)
  const lastSendAtRef = useRef(0)
  const lastSentTextRef = useRef('')
  const lastSentTextAtRef = useRef(0)
  const threadContentOpacity = useRef(new Animated.Value(1)).current
  const skipThreadTopicFadeRef = useRef(true)

  useEffect(() => {
    skipThreadTopicFadeRef.current = true
    initialScrollDoneRef.current = false
  }, [tournamentId])

  useEffect(() => {
    initialScrollDoneRef.current = false
  }, [activeDivisionId])

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
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])
  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return

    const now = Date.now()
    if (now - lastSendAtRef.current < CLIENT_SEND_COOLDOWN_MS) {
      toast.error('Slow down a bit.')
      return
    }
    if (
      lastSentTextRef.current &&
      lastSentTextRef.current === text &&
      now - lastSentTextAtRef.current < CLIENT_DUPLICATE_GUARD_MS
    ) {
      toast.error('Duplicate message.')
      return
    }

    lastSendAtRef.current = now
    lastSentTextRef.current = text
    lastSentTextAtRef.current = now
    if (activeDivisionId) {
      sendDivisionMessage.mutate({ divisionId: activeDivisionId, text })
      return
    }
    sendMessage.mutate({ tournamentId, text })
  }, [activeDivisionId, draft, sendDivisionMessage, sendMessage, toast, tournamentId])

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
      void utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const markDivisionRead = trpc.tournamentChat.markDivisionRead.useMutation({
    onMutate: ({ divisionId }: { divisionId: string }) => {
      clearEventUnreadCache(divisionId)
    },
    onSuccess: (_data: unknown, variables: { divisionId: string }) => {
      clearEventUnreadCache(variables.divisionId)
      void utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onMutate: ({ text }: { text: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !tournamentId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-tournament-${tournamentId}-${createdAt.getTime()}`
      const optimisticMessage = {
        id: optimisticId,
        tournamentId,
        userId: user.id,
        text: trimmed,
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
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
      clearEventUnreadCache(null)
      void tournamentMessagesQuery.refetch()
      void utils.tournamentChat.listMyEventChats.invalidate()
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
    onMutate: ({ text, divisionId }: { text: string; divisionId: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !divisionId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-division-${divisionId}-${createdAt.getTime()}`
      const optimisticMessage = {
        id: optimisticId,
        divisionId,
        userId: user.id,
        text: trimmed,
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
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
      setOptimisticMessages((current) => [...current, optimisticMessage])
      clearEventUnreadCache(divisionId)

      return { optimisticId, previousEvents }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (activeDivisionId) {
        utils.tournamentChat.listDivision.setData({ divisionId: activeDivisionId, limit: 100 }, (current: any[] | undefined) => {
          const list = (current ?? []) as any[]
          if (list.some((message) => message.id === data.id)) return list
          return [...list, data]
        })
      }
      if (activeDivisionId) {
        clearEventUnreadCache(activeDivisionId)
      }
      void divisionMessagesQuery.refetch()
      void utils.tournamentChat.listMyEventChats.invalidate()
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
    onSuccess: async () => {
      await tournamentMessagesQuery.refetch()
    },
  })
  const deleteDivisionMessage = trpc.tournamentChat.deleteDivision.useMutation({
    onSuccess: async () => {
      await divisionMessagesQuery.refetch()
    },
  })

  const permission = permissionsQuery.data?.tournament
  const activeDivisionPermission = activeDivisionId ? permissionsQuery.data?.divisions?.[0] : null
  const messagesLen = ((activeDivisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []).length

  useEffect(() => {
    if (!tournamentId || !isAuthenticated) return
    if (activeDivisionId) {
      markDivisionRead.mutate({ divisionId: activeDivisionId })
    } else {
      markRead.mutate({ tournamentId })
    }
  }, [tournamentId, isAuthenticated, activeDivisionId, messagesLen])

  useEffect(() => {
    if (messagesLen === 0) return
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      scrollToBottom(false)
      return
    }
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
      topBarRightSlot={null}
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
                onPressAvatar={(m) => {
                  if (!m.userId) return
                  router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
                }}
                canDelete={(m) => {
                  const mine = Boolean(user?.id && m.userId === user?.id)
                  return Boolean((mine || canModerate) && !m.isDeleted)
                }}
                onRequestDelete={(m) => setDeleteTargetId(m.id)}
                deleteDisabled={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
              />
            )}
          </ChatThreadRoot>
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
              if (!deleteTargetId) return
              const run = activeDivisionId
                ? deleteDivisionMessage.mutateAsync({ messageId: deleteTargetId })
                : deleteMessage.mutateAsync({ messageId: deleteTargetId })
              void run.then(() => setDeleteTargetId(null)).catch(() => setDeleteTargetId(null))
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
})
