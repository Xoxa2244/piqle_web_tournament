import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import { AppBottomSheet, AppConfirmActions } from '../../../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../../../src/components/AuthRequiredCard'
import { ChatComposer } from '../../../../../../src/components/ChatComposer'
import { ChatScreenLoading } from '../../../../../../src/components/ChatScreenLoading'
import { ChatThreadMessageList } from '../../../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../../../src/components/ChatThreadRoot'
import { type ChatMessage, mergeMessagesByStableLiveOrder } from '../../../../../../src/lib/chatMessages'
import { useMessageThreadRealtimeQueryOptions } from '../../../../../../src/lib/realtimePoll'
import { trpc } from '../../../../../../src/lib/trpc'
import { spacing, type ThemePalette } from '../../../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../../../src/providers/ToastProvider'
import { PageLayout } from '../../../../../../src/components/navigation/PageLayout'
import { EmptyState, LoadingBlock, Screen } from '../../../../../../src/components/ui'

const COMPOSER_IDLE_BOTTOM_EXTRA = 24
const CLIENT_SEND_COOLDOWN_MS = 400
const CLIENT_DUPLICATE_GUARD_MS = 10_000

export default function TournamentThreadScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ tournamentId: string; rootMessageId: string; title?: string }>()
  const tournamentId = params.tournamentId
  const rootMessageId = params.rootMessageId
  const title = params.title || 'Event chat'
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const messageThreadRealtimeQueryOptions = useMessageThreadRealtimeQueryOptions()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const initialScrollDoneRef = useRef(false)
  const messageOrderRef = useRef(new Map<string, number>())
  const nextMessageOrderRef = useRef(0)
  const likeMutationSeqRef = useRef<Record<string, number>>({})
  const lastSendAtRef = useRef(0)
  const lastSentTextRef = useRef('')
  const lastSentTextAtRef = useRef(0)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const permissionsQuery = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const canModerate = Boolean(permissionsQuery.data?.tournament?.canModerate)
  const markRead = trpc.tournamentChat.markTournamentRead.useMutation()

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])

  const threadQuery = trpc.tournamentChat.listTournamentThread.useQuery(
    { tournamentId, rootMessageId },
    { enabled: Boolean(tournamentId) && Boolean(rootMessageId) && isAuthenticated, ...messageThreadRealtimeQueryOptions }
  )

  const rootMessage = useMemo(
    () => ((threadQuery.data?.messages ?? []) as ChatMessage[]).find((message) => message.id === (threadQuery.data?.rootMessageId ?? rootMessageId)) ?? null,
    [rootMessageId, threadQuery.data?.messages, threadQuery.data?.rootMessageId]
  )

  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onMutate: ({ text, replyToMessageId }: { text: string; replyToMessageId?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !tournamentId || !user?.id) return null
      const createdAt = new Date()
      const optimisticId = `optimistic-thread-${tournamentId}-${createdAt.getTime()}`
      const resolvedReplyTarget =
        (replyTarget && replyTarget.id === replyToMessageId ? replyTarget : null) ??
        ((threadQuery.data?.messages ?? []) as ChatMessage[]).find((message) => message.id === replyToMessageId) ??
        null

      const optimisticMessage = {
        id: optimisticId,
        tournamentId,
        userId: user.id,
        text: trimmed,
        parentMessageId: rootMessage?.id ?? rootMessageId,
        replyToMessageId: resolvedReplyTarget?.id ?? rootMessage?.id ?? rootMessageId,
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

      setDraft('')
      setReplyTarget(null)
      setOptimisticMessages((current) => [...current, optimisticMessage])
      return { optimisticId }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      utils.tournamentChat.listTournamentThread.setData({ tournamentId, rootMessageId }, (current: any) => {
        const list = ((current?.messages ?? []) as any[]).slice()
        if (list.some((message) => message.id === data.id)) return current
        return { rootMessageId: current?.rootMessageId ?? rootMessageId, messages: [...list, data] }
      })
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (error: any, _vars, context: any) => {
      if (context?.optimisticId) {
        setOptimisticMessages((current) => current.filter((message) => message.id !== context.optimisticId))
      }
      toast.error(error.message || 'Failed to send message')
    },
  })

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    const targetId = replyTarget?.id ?? rootMessage?.id ?? rootMessageId
    if (!targetId) return
    const now = Date.now()
    if (now - lastSendAtRef.current < CLIENT_SEND_COOLDOWN_MS) {
      toast.error('Slow down a bit.')
      return
    }
    if (lastSentTextRef.current && lastSentTextRef.current === text && now - lastSentTextAtRef.current < CLIENT_DUPLICATE_GUARD_MS) {
      toast.error('Duplicate message.')
      return
    }
    lastSendAtRef.current = now
    lastSentTextRef.current = text
    lastSentTextAtRef.current = now
    sendMessage.mutate({ tournamentId, text, replyToMessageId: targetId })
  }, [draft, replyTarget?.id, rootMessage?.id, rootMessageId, sendMessage, toast, tournamentId])

  const deleteMessage = trpc.tournamentChat.deleteTournament.useMutation({
    onSuccess: (_data: any, variables: { messageId: string }) => {
      utils.tournamentChat.listTournamentThread.setData({ tournamentId, rootMessageId }, (current: any) => {
        const list = ((current?.messages ?? []) as any[]).map((message) =>
          message.id === variables.messageId
            ? { ...message, text: null, isDeleted: true, deletedAt: new Date(), deletedByUserId: user?.id ?? null }
            : message
        )
        return { rootMessageId: current?.rootMessageId ?? rootMessageId, messages: list }
      })
    },
  })

  const likeMessage = trpc.tournamentChat.likeTournamentMessage.useMutation({
    onMutate: async ({ messageId }: { messageId: string }) => {
      await utils.tournamentChat.listTournamentThread.cancel({ tournamentId, rootMessageId })
      const seq = (likeMutationSeqRef.current[messageId] ?? 0) + 1
      likeMutationSeqRef.current[messageId] = seq
      let previousState: { likeCount: number; viewerHasLiked: boolean } | null = null
      utils.tournamentChat.listTournamentThread.setData({ tournamentId, rootMessageId }, (current: any) => {
        const list = ((current?.messages ?? []) as any[]).map((message) =>
          message.id === messageId
            ? (() => {
                previousState = {
                  likeCount: Number(message.likeCount ?? 0),
                  viewerHasLiked: Boolean(message.viewerHasLiked),
                }
                return {
                  ...message,
                  likeCount: previousState.viewerHasLiked ? Math.max(0, previousState.likeCount - 1) : previousState.likeCount + 1,
                  viewerHasLiked: !previousState.viewerHasLiked,
                }
              })()
            : message
        )
        return { rootMessageId: current?.rootMessageId ?? rootMessageId, messages: list }
      })
      return { messageId, previousState, seq }
    },
    onSuccess: (data: any, _vars, context: any) => {
      if (!context || likeMutationSeqRef.current[data.messageId] !== context.seq) return
      utils.tournamentChat.listTournamentThread.setData({ tournamentId, rootMessageId }, (current: any) => {
        const list = ((current?.messages ?? []) as any[]).map((message) =>
          message.id === data.messageId ? { ...message, likeCount: data.likeCount, viewerHasLiked: data.viewerHasLiked } : message
        )
        return { rootMessageId: current?.rootMessageId ?? rootMessageId, messages: list }
      })
    },
    onError: (error: any, variables: { messageId: string }, context: any) => {
      if (!context?.previousState || likeMutationSeqRef.current[variables.messageId] !== context.seq) return
      utils.tournamentChat.listTournamentThread.setData({ tournamentId, rootMessageId }, (current: any) => {
        const list = ((current?.messages ?? []) as any[]).map((message) =>
          message.id === variables.messageId
            ? { ...message, likeCount: context.previousState.likeCount, viewerHasLiked: context.previousState.viewerHasLiked }
            : message
        )
        return { rootMessageId: current?.rootMessageId ?? rootMessageId, messages: list }
      })
      toast.error(error.message || 'Failed to like message')
    },
  })

  useEffect(() => {
    initialScrollDoneRef.current = false
  }, [rootMessageId, tournamentId])

  useEffect(() => {
    if (!tournamentId || !isAuthenticated) return
    markRead.mutate({ tournamentId })
  }, [isAuthenticated, markRead, threadQuery.data?.messages?.length, tournamentId])

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
    const serverMessages = ((threadQuery.data?.messages ?? []) as ChatMessage[])
    return mergeMessagesByStableLiveOrder(serverMessages, optimisticMessages, messageOrderRef.current, nextMessageOrderRef)
  }, [optimisticMessages, threadQuery.data?.messages])

  useEffect(() => {
    if (messages.length === 0) return
    if (!initialScrollDoneRef.current) return
    scrollToBottom(true)
  }, [messages.length, scrollToBottom])

  if (!isAuthenticated) {
    return (
      <Screen title="Replies" subtitle="Sign in to access tournament chat.">
        <AuthRequiredCard title="Authentication required" body="Tournament chat is available only for signed in users." />
      </Screen>
    )
  }

  if (threadQuery.isLoading && !threadQuery.data?.messages?.length && optimisticMessages.length === 0) {
    return <ChatScreenLoading title="Replies" />
  }

  return (
    <PageLayout chatAmbient scroll={false} contentStyle={styles.screen} topBarTitle="Replies" topBarRightSlot={null}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ChatThreadRoot
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, (messages.length === 0 || threadQuery.isLoading) && styles.messagesEmpty]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if ((messages.length === 0 && !threadQuery.isLoading) || initialScrollDoneRef.current) return
            initialScrollDoneRef.current = true
            scrollToBottom(false)
          }}
        >
          {threadQuery.isLoading && messages.length === 0 ? (
            <LoadingBlock label="Loading replies…" />
          ) : messages.length === 0 ? (
            <EmptyState title="No replies yet" body="Start the thread." />
          ) : (
            <ChatThreadMessageList
              messages={messages as ChatMessage[]}
              currentUserId={user?.id}
              threadRootMessageId={threadQuery.data?.rootMessageId ?? rootMessageId}
              onToggleLike={(m) => likeMessage.mutate({ messageId: m.id })}
              onRequestReply={(m) => setReplyTarget(m)}
              onPressAvatar={(m) => {
                if (!m.userId) return
                router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
              }}
              canDelete={(m) => Boolean((user?.id && m.userId === user?.id) || canModerate) && !m.isDeleted}
              onRequestDelete={(m) => setDeleteTargetId(m.id)}
              deleteDisabled={deleteMessage.isPending}
              longPressMenuEnabled
            />
          )}
        </ChatThreadRoot>

        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply..."
          onSend={handleSend}
          sendDisabled={draft.trim().length === 0}
          paddingHorizontal={16}
          paddingBottom={16 + (keyboardVisible ? 0 : COMPOSER_IDLE_BOTTOM_EXTRA)}
          multiline={false}
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
                <Pressable onPress={() => setReplyTarget(null)} hitSlop={8} style={({ pressed }) => [styles.replyComposerClose, pressed && { opacity: 0.72 }]}>
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
              if (!deleteTargetId) return
              void deleteMessage.mutateAsync({ messageId: deleteTargetId }).then(() => setDeleteTargetId(null)).catch(() => setDeleteTargetId(null))
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
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      gap: 0,
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
