import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Feather } from '@expo/vector-icons'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../src/components/AuthRequiredCard'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { ChatScreenLoading } from '../../../../src/components/ChatScreenLoading'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import { RemoteUserAvatar } from '../../../../src/components/RemoteUserAvatar'
import { mergeMessagesByStableLiveOrder, type ChatMessage } from '../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, InputField, Screen, SurfaceCard } from '../../../../src/components/ui'
import {
  useChatRealtimeQueryOptions,
  useMessageThreadRealtimeQueryOptions,
} from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../src/providers/ToastProvider'

const COMPOSER_IDLE_BOTTOM_EXTRA = 24
const CLIENT_SEND_COOLDOWN_MS = 400
const CLIENT_DUPLICATE_GUARD_MS = 10_000
type PendingMenuAction = 'block' | 'report' | null

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function formatPresenceLabel(lastActiveAt?: string | Date | null) {
  if (!lastActiveAt) return 'Offline'
  const last = new Date(lastActiveAt)
  const diffMs = Date.now() - last.getTime()
  if (!Number.isFinite(diffMs)) return 'Offline'
  if (diffMs < 0) return 'Online'
  if (diffMs <= ONLINE_WINDOW_MS) return 'Online'

  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMinutes < 60) return `last seen ${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `last seen ${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `last seen ${diffDays}d ago`
}

export default function DirectChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ threadId: string; title?: string; userId?: string }>()
  const threadId = params.threadId
  const fallbackTitle = params.title || 'Chat'
  const fallbackUserId = params.userId
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const chatRealtimeQueryOptions = useChatRealtimeQueryOptions()
  const messageThreadRealtimeQueryOptions = useMessageThreadRealtimeQueryOptions()
  const toast = useToast()
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportDetails, setReportDetails] = useState('')
  const [pendingMenuAction, setPendingMenuAction] = useState<PendingMenuAction>(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const initialScrollDoneRef = useRef(false)
  const messageOrderRef = useRef(new Map<string, number>())
  const nextMessageOrderRef = useRef(0)
  const lastMarkedReadKeyRef = useRef<string | null>(null)
  const likeMutationSeqRef = useRef<Record<string, number>>({})
  const lastSendAtRef = useRef(0)
  const lastSentTextRef = useRef('')
  const lastSentTextAtRef = useRef(0)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')

  const threadQuery = trpc.directChat.getThread.useQuery(
    { threadId },
    { enabled: Boolean(threadId) && isAuthenticated, ...chatRealtimeQueryOptions }
  )
  const messagesQuery = trpc.directChat.list.useQuery(
    { threadId, limit: 100 },
    { enabled: Boolean(threadId) && isAuthenticated, ...messageThreadRealtimeQueryOptions }
  )
  const clearDirectUnreadCache = useCallback(() => {
    if (!threadId) return
    utils.directChat.listMyChats.setData(undefined, (current: any[] | undefined) =>
      (current ?? []).map((chat) => (chat.id === threadId ? { ...chat, unreadCount: 0 } : chat))
    )
  }, [threadId, utils.directChat.listMyChats])
  const markRead = trpc.directChat.markRead.useMutation({
    onMutate: () => {
      clearDirectUnreadCache()
    },
    onSuccess: () => {
      clearDirectUnreadCache()
    },
  })
  const sendMessage = trpc.directChat.send.useMutation({
    onMutate: ({ text }: { text: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !threadId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-${threadId}-${createdAt.getTime()}`
      const optimisticMessage = {
        id: optimisticId,
        threadId,
        userId: user.id,
        text: trimmed,
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

      const previousChats = ((utils.directChat.listMyChats.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
      setOptimisticMessages((current) => [...current, optimisticMessage])
      utils.directChat.listMyChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((chat) =>
          chat.id === threadId
            ? {
                ...chat,
                unreadCount: 0,
                updatedAt: createdAt,
                lastMessage: {
                  id: optimisticMessage.id,
                  text: trimmed,
                  isDeleted: false,
                  createdAt,
                  userId: user.id,
                  userName: user.name ?? null,
                },
              }
            : chat
        )
      )

      return { optimisticId, previousChats }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) => {
        const list = (current ?? []) as any[]
        if (list.some((message) => message.id === data.id)) return list
        return [...list, data]
      })
      utils.directChat.listMyChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((chat) =>
          chat.id === threadId
            ? {
                ...chat,
                unreadCount: 0,
                updatedAt: data.createdAt,
                lastMessage: {
                  id: data.id,
                  text: data.text,
                  isDeleted: false,
                  createdAt: data.createdAt,
                  userId: data.userId,
                  userName: data.user?.name ?? user?.name ?? null,
                },
              }
            : chat
        )
      )
      clearDirectUnreadCache()
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (error: any, _vars: unknown, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      if (context?.previousChats) {
        utils.directChat.listMyChats.setData(undefined, context.previousChats)
      }
      toast.error(error.message || 'Failed to send message')
    },
  })
  const deleteMessage = trpc.directChat.delete.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      await utils.directChat.list.cancel({ threadId, limit: 100 })

      let nextLastMessage: any = null
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) => {
        const nextList = (current ?? []).filter((message) => message.id !== messageId)
        const last = nextList[nextList.length - 1] ?? null
        nextLastMessage = last
        return nextList
      })

      utils.directChat.listMyChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).map((chat) =>
          chat.id === threadId
            ? {
                ...chat,
                lastMessage: nextLastMessage
                  ? {
                      id: nextLastMessage.id,
                      text: nextLastMessage.text,
                      isDeleted: Boolean(nextLastMessage.isDeleted),
                      createdAt: nextLastMessage.createdAt,
                      userId: nextLastMessage.userId,
                      userName: nextLastMessage.user?.name ?? chat.lastMessage?.userName ?? null,
                    }
                  : null,
                updatedAt: nextLastMessage?.createdAt ?? chat.updatedAt,
              }
            : chat
        )
      )
    },
    onSuccess: () => {
      /* optimistic state already applied */
    },
    onError: (error: any) => toast.error(error.message || 'Failed to delete message'),
  })
  const likeMessage = trpc.directChat.likeMessage.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      await utils.directChat.list.cancel({ threadId, limit: 100 })
      const seq = (likeMutationSeqRef.current[messageId] ?? 0) + 1
      likeMutationSeqRef.current[messageId] = seq
      let previousState: { likeCount: number; viewerHasLiked: boolean } | null = null
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) =>
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
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) =>
        (current ?? []).map((message) =>
          message.id === data.messageId
            ? {
                ...message,
                likeCount: data.likeCount,
                viewerHasLiked: data.viewerHasLiked,
              }
            : message
        )
      )
    },
    onError: (error: any, variables: { messageId: string }, context: any) => {
      if (!context?.previousState || likeMutationSeqRef.current[variables.messageId] !== context.seq) return
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) =>
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
  const blockUser = trpc.user.blockUser.useMutation({
    onSuccess: async () => {
      setMenuOpen(false)
      setBlockConfirmOpen(false)
      toast.success('User blocked.')
      await Promise.all([
        threadQuery.refetch(),
        utils.user.getDirectMessageState.invalidate(),
        utils.user.listBlockedUsers.invalidate(),
      ])
    },
    onError: (error: any) => toast.error(error.message || 'Failed to block user.'),
  })
  const reportUser = trpc.user.reportDirectMessageUser.useMutation({
    onSuccess: () => {
      setReportDetails('')
      setReportOpen(false)
      setMenuOpen(false)
      toast.success('Report sent.')
    },
    onError: (error: any) => toast.error(error.message || 'Failed to send report.'),
  })
  const unblockUser = trpc.user.unblockUser.useMutation({
    onSuccess: async () => {
      toast.success('User unblocked.')
      await Promise.all([
        threadQuery.refetch(),
        utils.user.getDirectMessageState.invalidate(),
        utils.user.listBlockedUsers.invalidate(),
      ])
    },
    onError: (error: any) => toast.error(error.message || 'Failed to unblock user.'),
  })

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
    sendMessage.mutate({ threadId, text })
  }, [draft, sendMessage, threadId, toast])

  useEffect(() => {
    if (!threadId || !isAuthenticated) return
    const messagesCount = messagesQuery.data?.length ?? 0
    const markReadKey = `${threadId}:${messagesCount}`
    if (lastMarkedReadKeyRef.current === markReadKey) return
    lastMarkedReadKeyRef.current = markReadKey
    markRead.mutate({ threadId })
  }, [threadId, isAuthenticated, markRead])

  useEffect(() => {
    initialScrollDoneRef.current = false
    lastMarkedReadKeyRef.current = null
  }, [threadId])

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEv, () => setKeyboardVisible(true))
    const hideSub = Keyboard.addListener(hideEv, () => setKeyboardVisible(false))
    const didShow = Keyboard.addListener('keyboardDidShow', () => scrollToBottom(true))
    return () => {
      showSub.remove()
      hideSub.remove()
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
  const displayName = threadQuery.data?.otherUser?.name?.trim() || fallbackTitle
  const otherUserId = threadQuery.data?.otherUser?.id || fallbackUserId
  const messagingState = threadQuery.data?.messagingState
  const presenceLabel = formatPresenceLabel((threadQuery.data as any)?.presence?.lastActiveAt)
  const messagingBlocked = Boolean(messagingState && !messagingState.canMessage)
  const blockedComposerText = messagingState?.blockedByMe
    ? 'You blocked this user and cannot send messages.'
    : 'You cannot send messages to this user.'
  const isEmpty = messages.length === 0

  useEffect(() => {
    if (messages.length === 0) return
    if (!initialScrollDoneRef.current) return
    scrollToBottom(true)
  }, [messages.length, scrollToBottom])

  if (!isAuthenticated) {
    return (
      <Screen title={fallbackTitle} subtitle="Sign in to access personal messages.">
        <AuthRequiredCard
          title="Authentication required"
          body="Personal chats are available only for signed-in players."
        />
      </Screen>
    )
  }

  if (threadQuery.isLoading || (messagesQuery.isLoading && !messagesQuery.data?.length && optimisticMessages.length === 0)) {
    return <ChatScreenLoading title={displayName} />
  }

  if (threadQuery.error) {
    return (
      <Screen title={fallbackTitle} subtitle="Personal chat">
        <EmptyState title="Chat unavailable" body={threadQuery.error.message || 'Could not open this chat.'} />
      </Screen>
    )
  }

  return (
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitle={displayName}
      topBarTitleBelow={presenceLabel}
      onTopBarTitlePress={() => {
        if (!otherUserId) return
        router.push({ pathname: '/profile/[id]', params: { id: otherUserId } })
      }}
      topBarTitleAccessoryLeading
      topBarTitleAccessory={
        <Pressable
          onPress={() => {
            if (!otherUserId) return
            router.push({ pathname: '/profile/[id]', params: { id: otherUserId } })
          }}
          hitSlop={8}
        >
          <RemoteUserAvatar
            uri={threadQuery.data?.otherUser?.image}
            size={36}
            fallback="initials"
            initialsLabel={displayName}
          />
        </Pressable>
      }
      topBarRightSlot={
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.menuButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.menuButtonPressed,
          ]}
        >
          <Feather name="more-vertical" size={18} color={colors.text} />
        </Pressable>
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
            if (messages.length === 0 || initialScrollDoneRef.current) return
            initialScrollDoneRef.current = true
            scrollToBottom(false)
          }}
        >
          {isEmpty ? (
            <EmptyState title="No messages yet" body="Send the first message to start this conversation." />
          ) : (
            <ChatThreadMessageList
              messages={messages}
              currentUserId={user?.id}
              showOtherAvatars={false}
              onToggleLike={(m) => {
                likeMessage.mutate({ messageId: m.id })
              }}
              onPressAvatar={() => {
                if (!otherUserId) return
                router.push({ pathname: '/profile/[id]', params: { id: otherUserId } })
              }}
              canDelete={(message) => Boolean(user?.id && message.userId === user.id) && !message.isDeleted}
              onRequestDelete={(message) => setDeleteTargetId(message.id)}
              deleteDisabled={deleteMessage.isPending}
              longPressMenuEnabled
            />
          )}
        </ChatThreadRoot>

        {messagingState?.blockedByMe ? (
          <SurfaceCard style={styles.blockedBanner}>
            <Text style={[styles.blockedBannerTitle, { color: colors.text }]}>You blocked this user</Text>
            <Text style={[styles.blockedBannerBody, { color: colors.textMuted }]}>
              Unblock them to see new messages and continue chatting.
            </Text>
            <ActionButton
              label={unblockUser.isPending ? 'Unblocking…' : 'Unblock'}
              onPress={() => {
                if (!otherUserId) return
                unblockUser.mutate({ userId: otherUserId })
              }}
              loading={unblockUser.isPending}
            />
          </SurfaceCard>
        ) : null}

        <ChatComposer
          value={messagingBlocked ? blockedComposerText : draft}
          onChangeText={setDraft}
          placeholder={messagingBlocked ? blockedComposerText : 'Message...'}
          onSend={handleSend}
          sendDisabled={messagingBlocked || draft.trim().length === 0}
          editable={!messagingBlocked}
          multiline={false}
          paddingHorizontal={16}
          paddingBottom={16 + (keyboardVisible ? 0 : COMPOSER_IDLE_BOTTOM_EXTRA)}
        />
      </KeyboardAvoidingView>

      <AppBottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onDismissed={() => {
          if (pendingMenuAction === 'block') {
            setPendingMenuAction(null)
            setBlockConfirmOpen(true)
            return
          }
          if (pendingMenuAction === 'report') {
            setPendingMenuAction(null)
            setReportOpen(true)
          }
        }}
        title={displayName}
        subtitle="Chat actions"
      >
        <View style={styles.sheetActions}>
          <Pressable
            onPress={() => {
              setPendingMenuAction('block')
              setMenuOpen(false)
            }}
            disabled={!otherUserId || Boolean(messagingState?.blockedByMe) || blockUser.isPending}
            style={({ pressed }) => [
              styles.sheetActionRow,
              { borderColor: colors.border, backgroundColor: colors.surface },
              pressed && styles.sheetActionRowPressed,
              (!otherUserId || Boolean(messagingState?.blockedByMe)) && styles.sheetActionRowDisabled,
            ]}
          >
            <View style={styles.sheetActionCopy}>
              <Feather
                name="slash"
                size={18}
                color={messagingState?.blockedByMe ? colors.textMuted : colors.danger}
              />
              <View style={styles.sheetActionTextWrap}>
                <Text style={[styles.sheetActionTitle, { color: colors.text }]}>
                  {messagingState?.blockedByMe ? 'User blocked' : 'Block user'}
                </Text>
                <Text style={[styles.sheetActionSubtitle, { color: colors.textMuted }]}>
                  They will be moved to your blacklist.
                </Text>
              </View>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              setPendingMenuAction('report')
              setMenuOpen(false)
            }}
            disabled={!otherUserId}
            style={({ pressed }) => [
              styles.sheetActionRow,
              { borderColor: colors.border, backgroundColor: colors.surface },
              pressed && styles.sheetActionRowPressed,
            ]}
          >
            <View style={styles.sheetActionCopy}>
              <Feather name="flag" size={18} color={colors.text} />
              <View style={styles.sheetActionTextWrap}>
                <Text style={[styles.sheetActionTitle, { color: colors.text }]}>Report user</Text>
                <Text style={[styles.sheetActionSubtitle, { color: colors.textMuted }]}>
                  Send a complaint with context from this chat.
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      </AppBottomSheet>

      <AppBottomSheet
        open={blockConfirmOpen}
        onClose={() => setBlockConfirmOpen(false)}
        title="Block this user?"
        subtitle="They will be added to your blacklist and personal messaging will be disabled."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={blockUser.isPending ? 'Blocking…' : 'Block'}
            onCancel={() => setBlockConfirmOpen(false)}
            onConfirm={() => {
              if (!otherUserId) return
              blockUser.mutate({ userId: otherUserId })
            }}
            confirmLoading={blockUser.isPending}
          />
        }
      />

      <AppBottomSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report user"
        subtitle="Describe what happened and we will review it."
        footer={
          <ActionButton
            label={reportUser.isPending ? 'Sending…' : 'Send report'}
            loading={reportUser.isPending}
            disabled={reportDetails.trim().length < 10}
            onPress={() => {
              if (!otherUserId) return
              reportUser.mutate({
                reportedUserId: otherUserId,
                threadId,
                details: reportDetails.trim(),
              })
            }}
          />
        }
      >
        <View style={styles.reportSheetContent}>
          <InputField
            value={reportDetails}
            onChangeText={(value) => setReportDetails(value.slice(0, 2000))}
            placeholder="Explain the issue..."
            multiline
            containerStyle={styles.reportInput}
          />
          <Text style={[styles.reportHint, { color: colors.textMuted }]}>
            At least 10 characters. Include only the details that matter.
          </Text>
        </View>
      </AppBottomSheet>

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
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      paddingBottom: 0,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
    },
    menuButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.96 }],
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: spacing.sm,
      flexGrow: 1,
    },
    messagesEmpty: {
      justifyContent: 'center',
      paddingBottom: spacing.xl,
    },
    sheetActions: {
      gap: spacing.sm,
    },
    blockedBanner: {
      marginHorizontal: 16,
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    blockedBannerTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    blockedBannerBody: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    sheetActionRow: {
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    sheetActionRowPressed: {
      opacity: 0.88,
    },
    sheetActionRowDisabled: {
      opacity: 0.55,
    },
    sheetActionCopy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sheetActionTextWrap: {
      flex: 1,
      gap: 3,
    },
    sheetActionTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    sheetActionSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    reportSheetContent: {
      gap: spacing.sm,
    },
    reportInput: {
      minHeight: 132,
      alignItems: 'flex-start',
    },
    reportHint: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
  })
