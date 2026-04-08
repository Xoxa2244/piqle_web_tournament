import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../src/components/AuthRequiredCard'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { FeedbackEntityContextCard } from '../../../../src/components/FeedbackEntityContextCard'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import { EntityImage } from '../../../../src/components/EntityImage'
import { FeedbackRatingModal } from '../../../../src/components/FeedbackRatingModal'
import { mergeMessagesByStableLiveOrder, type ChatMessage } from '../../../../src/lib/chatMessages'
import { ChatScreenLoading } from '../../../../src/components/ChatScreenLoading'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, Screen, SurfaceCard } from '../../../../src/components/ui'
import {
  useChatRealtimeQueryOptions,
  useMessageThreadRealtimeQueryOptions,
} from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { FEEDBACK_API_ENABLED } from '../../../../src/lib/config'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../src/providers/ToastProvider'

/** Доп. отступ снизу у поля, пока клавиатура закрыта (полноэкранный стек без tab bar). */
const CLUB_COMPOSER_IDLE_BOTTOM_EXTRA = 24
const CLIENT_SEND_COOLDOWN_MS = 400

export default function ClubChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const clubName = params.name || 'Club chat'
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const chatRealtimeQueryOptions = useChatRealtimeQueryOptions()
  const messageThreadRealtimeQueryOptions = useMessageThreadRealtimeQueryOptions()
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const messageOffsetsRef = useRef(new Map<string, number>())
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialScrollDoneRef = useRef(false)
  const messageOrderRef = useRef(new Map<string, number>())
  const nextMessageOrderRef = useRef(0)
  const likeMutationSeqRef = useRef<Record<string, number>>({})
  const lastSendAtRef = useRef(0)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
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
  const myChatClubsQuery = trpc.club.listMyChatClubs.useQuery(undefined, {
    enabled: isAuthenticated,
    ...chatRealtimeQueryOptions,
  })
  const clubDetailQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) && isAuthenticated })
  const activeClub = myChatClubsQuery.data?.find((c: any) => c.id === clubId) as any
  /** Список чатов может ещё не подгрузиться — logo из club.get; иначе логотип в шапке пропадает. */
  const clubLogoUrl = activeClub?.logoUrl ?? clubDetailQuery.data?.logoUrl ?? null
  const clubDisplayName = activeClub?.name ?? clubDetailQuery.data?.name ?? clubName
  const isAdmin = Boolean(myChatClubsQuery.data?.find((c) => c.id === clubId)?.isAdmin)

  const messagesQuery = trpc.clubChat.list.useQuery(
    { clubId, limit: 100 },
    { enabled: Boolean(clubId) && isAuthenticated, ...messageThreadRealtimeQueryOptions }
  )
  const pendingFeedbackQuery = trpc.feedback.getPendingPrompts.useQuery(undefined, {
    enabled: isAuthenticated && FEEDBACK_API_ENABLED,
  })
  const clearClubUnreadCache = useCallback(() => {
    if (!clubId) return
    utils.club.listMyChatClubs.setData(undefined, (current: any[] | undefined) =>
      (current ?? []).map((club) => (club.id === clubId ? { ...club, unreadCount: 0 } : club))
    )
  }, [clubId, utils.club.listMyChatClubs])
  const markRead = trpc.clubChat.markRead.useMutation({
    onMutate: () => {
      clearClubUnreadCache()
    },
    onSuccess: () => {
      clearClubUnreadCache()
    },
  })
  const sendMessage = trpc.clubChat.send.useMutation({
    onMutate: ({ text, replyToMessageId }: { text: string; replyToMessageId?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !clubId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-${clubId}-${createdAt.getTime()}`
      const resolvedReplyTarget =
        replyTarget && replyToMessageId === replyTarget.id ? replyTarget : null
      const optimisticMessage = {
        id: optimisticId,
        clubId,
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

      const previousClubs = ((utils.club.listMyChatClubs.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
      setReplyTarget(null)
      setOptimisticMessages((current) => [...current, optimisticMessage])
      utils.club.listMyChatClubs.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((club) =>
          club.id === clubId ? { ...club, unreadCount: 0, lastMessageAt: createdAt } : club
        )
      )

      return { optimisticId, previousClubs }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      utils.clubChat.list.setData({ clubId, limit: 100 }, (current: any[] | undefined) => {
        const list = (current ?? []) as any[]
        if (list.some((message) => message.id === data.id)) return list
        return [...list, data]
      })
      utils.club.listMyChatClubs.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((club) =>
          club.id === clubId ? { ...club, unreadCount: 0, lastMessageAt: data.createdAt } : club
        )
      )
      clearClubUnreadCache()
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (e: any, _vars: unknown, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (context?.previousClubs) {
        utils.club.listMyChatClubs.setData(undefined, context.previousClubs)
      }
      toast.error(e.message || 'Failed to send message')
    },
  })
  const deleteMessage = trpc.clubChat.delete.useMutation({
    onMutate: ({ messageId }: { messageId: string }) => {
      const deletedAt = new Date()
      utils.clubChat.list.setData({ clubId, limit: 100 }, (current: any[] | undefined) =>
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
  const likeMessage = trpc.clubChat.likeMessage.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      await utils.clubChat.list.cancel({ clubId, limit: 100 })
      const seq = (likeMutationSeqRef.current[messageId] ?? 0) + 1
      likeMutationSeqRef.current[messageId] = seq
      let previousState: { likeCount: number; viewerHasLiked: boolean } | null = null
      utils.clubChat.list.setData({ clubId, limit: 100 }, (current: any[] | undefined) =>
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
      if (!context || likeMutationSeqRef.current[data.messageId] !== context.seq) return
      utils.clubChat.list.setData({ clubId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === data.messageId
            ? { ...message, likeCount: data.likeCount, viewerHasLiked: data.viewerHasLiked }
            : message
        )
      )
    },
    onError: (error: any, variables: { messageId: string }, context: any) => {
      if (!context?.previousState || likeMutationSeqRef.current[variables.messageId] !== context.seq) return
      utils.clubChat.list.setData({ clubId, limit: 100 }, (current: any[] | undefined) =>
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

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return

    const now = Date.now()
    if (now - lastSendAtRef.current < CLIENT_SEND_COOLDOWN_MS) {
      toast.error('Slow down a bit.')
      return
    }
    lastSendAtRef.current = now
    sendMessage.mutate({ clubId, text, replyToMessageId: replyTarget?.id })
  }, [clubId, draft, replyTarget?.id, sendMessage, toast])

  useEffect(() => {
    initialScrollDoneRef.current = false
  }, [clubId])

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    },
    []
  )

  useEffect(() => {
    if (!clubId || !isAuthenticated) return
    markRead.mutate({ clubId })
  }, [clubId, isAuthenticated, markRead])

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s = Keyboard.addListener(showEv, () => setKeyboardVisible(true))
    const h = Keyboard.addListener(hideEv, () => setKeyboardVisible(false))
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollToBottom(true)
    })
    return () => {
      s.remove()
      h.remove()
      didShow.remove()
    }
  }, [scrollToBottom])

  const messages = useMemo(() => {
    const serverMessages = (messagesQuery.data ?? []) as ChatMessage[]
    return mergeMessagesByStableLiveOrder(
      serverMessages,
      optimisticMessages,
      messageOrderRef.current,
      nextMessageOrderRef
    )
  }, [messagesQuery.data, optimisticMessages])
  const pendingClubPrompt = (pendingFeedbackQuery.data?.items ?? []).find(
    (item: any) => item.entityType === 'CLUB' && item.entityId === clubId,
  )
  const showDevClubPrompt = !FEEDBACK_API_ENABLED
  const showClubFeedbackPrompt = Boolean(pendingClubPrompt || showDevClubPrompt)

  useEffect(() => {
    if (messages.length === 0 && !showClubFeedbackPrompt) return
    if (!initialScrollDoneRef.current) return
    scrollToBottom(true)
  }, [messages.length, showClubFeedbackPrompt, scrollToBottom])

  if (!isAuthenticated) {
    return (
      <Screen title={clubName} subtitle="Sign in to access club messages.">
        <AuthRequiredCard
          title="Authentication required"
          body="Club chat follows the same membership and moderation rules as the web app."
        />
      </Screen>
    )
  }

  if (messagesQuery.isLoading && !messagesQuery.data?.length && optimisticMessages.length === 0) {
    return <ChatScreenLoading title={clubDisplayName} />
  }

  const isEmpty = messages.length === 0

  return (
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitle={clubName}
      topBarRightSlot={null}
      onTopBarTitlePress={() => {
        if (!clubId) return
        router.push(`/clubs/${clubId}`)
      }}
      topBarTitleAccessoryLeading
      topBarTitleAccessory={
        <EntityImage
          uri={clubLogoUrl}
          style={styles.titleClubLogo}
          resizeMode="cover"
          placeholderResizeMode="contain"
        />
      }
    >
      {messagesQuery.error ? (
        <SurfaceCard tone="soft">
          <Text style={styles.error}>{messagesQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ChatThreadRoot
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, isEmpty && styles.messagesEmpty]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if ((messages.length === 0 && !showClubFeedbackPrompt) || initialScrollDoneRef.current) return
            initialScrollDoneRef.current = true
            scrollToBottom(false)
          }}
        >
          {isEmpty ? (
            <EmptyState
              title="No messages yet"
              body="Start the conversation or wait for the next club update."
            />
          ) : (
            <ChatThreadMessageList
              messages={messages as ChatMessage[]}
              currentUserId={user?.id}
              onToggleLike={(m) => {
                likeMessage.mutate({ messageId: m.id })
              }}
              onRequestReply={(m) => setReplyTarget(m)}
              onPressRepliesSummary={(m) => {
                router.push({
                  pathname: '/chats/club/[clubId]/thread/[rootMessageId]',
                  params: {
                    clubId,
                    rootMessageId: m.id,
                    name: clubDisplayName,
                  },
                })
              }}
              onPressReplyTarget={(message, targetMessageId) => {
                if (scrollToMessage(targetMessageId)) return
                router.push({
                  pathname: '/chats/club/[clubId]/thread/[rootMessageId]',
                  params: {
                    clubId,
                    rootMessageId: message.parentMessageId ?? message.id,
                    name: clubDisplayName,
                  },
                })
              }}
              onMessageLayout={handleMessageLayout}
              highlightedMessageId={highlightedMessageId}
              onPressAvatar={(m) => {
                if (!m.userId) return
                router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
              }}
              canDelete={(m) =>
                Boolean((user?.id && m.userId === user?.id) || isAdmin) && !m.isDeleted
              }
              onRequestDelete={(m) => setDeleteTargetId(m.id)}
              deleteDisabled={deleteMessage.isPending}
              longPressMenuEnabled
            />
          )}
          {showClubFeedbackPrompt ? (
            <View style={styles.systemMessageRow}>
              <Pressable onPress={() => setClubFeedbackOpen(true)} style={styles.systemMessageCard}>
                <Text style={styles.systemMessageLabel}>System</Text>
                <Text style={styles.feedbackPromptTitle}>Rate this club</Text>
                <Text style={styles.feedbackPromptStars}>★ ★ ★ ★ ★</Text>
                <Text style={styles.feedbackPromptBody}>Tap stars to leave your feedback.</Text>
              </Pressable>
            </View>
          ) : null}
        </ChatThreadRoot>

        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder="Message club..."
          onSend={handleSend}
          sendDisabled={draft.trim().length === 0}
          multiline={false}
          paddingHorizontal={16}
          paddingBottom={16 + (keyboardVisible ? 0 : CLUB_COMPOSER_IDLE_BOTTOM_EXTRA)}
          topSlot={
            replyTarget ? (
              <View style={styles.replyComposerCard}>
                <View style={styles.replyComposerBody}>
                  <Text style={styles.replyComposerLabel} numberOfLines={1}>
                    Replying to {replyTarget.user?.name || 'User'}
                  </Text>
                  <Text style={styles.replyComposerText} numberOfLines={1}>
                    {replyTarget.isDeleted ? 'Message removed' : replyTarget.text || ''}
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
            ) : null
          }
        />
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
            confirmLabel={deleteMessage.isPending ? 'Deleting…' : 'Delete'}
            onCancel={() => setDeleteTargetId(null)}
            onConfirm={() => {
              const messageId = deleteTargetId
              setDeleteTargetId(null)
              if (!messageId) return
              deleteMessage.mutate({ messageId })
            }}
            confirmLoading={deleteMessage.isPending}
          />
        }
      />
      <FeedbackRatingModal
        open={clubFeedbackOpen}
        onClose={() => setClubFeedbackOpen(false)}
        entityType="CLUB"
        entityId={clubId}
        title="Rate this club"
        subtitle="Your feedback helps improve the club experience."
        contextCard={
          <FeedbackEntityContextCard
            entityType="CLUB"
            title={clubDisplayName}
            imageUrl={clubLogoUrl}
            addressLabel={
              [activeClub?.city ?? clubDetailQuery.data?.city, activeClub?.state ?? clubDetailQuery.data?.state]
                .filter(Boolean)
                .join(', ') || null
            }
            membersLabel={`${Math.max(1, Number(clubDetailQuery.data?.followersCount ?? 0) || 1)} members`}
          />
        }
        onSubmitted={() => {
          void pendingFeedbackQuery.refetch()
        }}
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
  error: {
    color: colors.danger,
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    paddingBottom: 0,
    gap: 12,
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingBottom: 0,
  },
  feedbackPromptRow: {
    gap: 6,
  },
  systemMessageRow: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  systemMessageCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  systemMessageLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedbackPromptTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackPromptStars: {
    color: '#F4B000',
    fontSize: 18,
    letterSpacing: 2,
  },
  feedbackPromptBody: {
    color: colors.textMuted,
    fontSize: 13,
  },
  titleClubLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
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
