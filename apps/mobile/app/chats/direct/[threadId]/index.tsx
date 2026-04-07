import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../src/components/AuthRequiredCard'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { ChatScreenLoading } from '../../../../src/components/ChatScreenLoading'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import { RemoteUserAvatar } from '../../../../src/components/RemoteUserAvatar'
import type { ChatMessage } from '../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { EmptyState, Screen, SurfaceCard } from '../../../../src/components/ui'
import { chatRealtimeQueryOptions } from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../src/providers/ToastProvider'

const COMPOSER_IDLE_BOTTOM_EXTRA = 24

export default function DirectChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ threadId: string; title?: string; userId?: string }>()
  const threadId = params.threadId
  const fallbackTitle = params.title || 'Chat'
  const fallbackUserId = params.userId
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const toast = useToast()
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')

  const threadQuery = trpc.directChat.getThread.useQuery(
    { threadId },
    { enabled: Boolean(threadId) && isAuthenticated, ...chatRealtimeQueryOptions }
  )
  const messagesQuery = trpc.directChat.list.useQuery(
    { threadId, limit: 100 },
    { enabled: Boolean(threadId) && isAuthenticated, ...chatRealtimeQueryOptions }
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
      void utils.directChat.listMyChats.invalidate()
    },
  })
  const sendMessage = trpc.directChat.send.useMutation({
    onMutate: ({ text }: { text: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !threadId || !user?.id) return null

      const createdAt = new Date()
      const optimisticMessage = {
        id: `optimistic-${threadId}-${createdAt.getTime()}`,
        threadId,
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
      }

      const previousMessages = (messagesQuery.data ?? []) as ChatMessage[]
      const previousChats = ((utils.directChat.listMyChats.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
      utils.directChat.list.setData({ threadId, limit: 100 }, (current: any[] | undefined) => [
        ...((current ?? []) as any[]),
        optimisticMessage,
      ])
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

      return { previousMessages, previousChats }
    },
    onSuccess: (data: { wasFiltered?: boolean }) => {
      clearDirectUnreadCache()
      void messagesQuery.refetch()
      void utils.directChat.listMyChats.invalidate()
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (error: any, _vars: unknown, context: any) => {
      if (context?.previousMessages) {
        utils.directChat.list.setData({ threadId, limit: 100 }, context.previousMessages)
      }
      if (context?.previousChats) {
        utils.directChat.listMyChats.setData(undefined, context.previousChats)
      }
      toast.error(error.message || 'Failed to send message')
    },
  })
  const deleteMessage = trpc.directChat.delete.useMutation({
    onSuccess: async () => {
      await messagesQuery.refetch()
    },
    onError: (error: any) => toast.error(error.message || 'Failed to delete message'),
  })

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])

  useEffect(() => {
    if (!threadId || !isAuthenticated) return
    markRead.mutate({ threadId })
  }, [threadId, isAuthenticated, messagesQuery.data?.length])

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

  const messages = (messagesQuery.data ?? []) as ChatMessage[]
  const displayName = threadQuery.data?.otherUser?.name?.trim() || fallbackTitle
  const otherUserId = threadQuery.data?.otherUser?.id || fallbackUserId
  const isEmpty = messages.length === 0

  useEffect(() => {
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

  if (threadQuery.isLoading || messagesQuery.isLoading) {
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
            size={28}
            fallback="initials"
            initialsLabel={displayName}
          />
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
        >
          {isEmpty ? (
            <EmptyState title="No messages yet" body="Send the first message to start this conversation." />
          ) : (
            <ChatThreadMessageList
              messages={messages}
              currentUserId={user?.id}
              onPressAvatar={() => {
                if (!otherUserId) return
                router.push({ pathname: '/profile/[id]', params: { id: otherUserId } })
              }}
              canDelete={(message) => Boolean(user?.id && message.userId === user.id) && !message.isDeleted}
              onRequestDelete={(message) => setDeleteTargetId(message.id)}
              deleteDisabled={deleteMessage.isPending}
            />
          )}
        </ChatThreadRoot>

        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          onSend={() => {
            void sendMessage.mutateAsync({ threadId, text: draft.trim() }).catch(() => undefined)
          }}
          sendDisabled={sendMessage.isPending || draft.trim().length === 0}
          multiline={false}
          paddingHorizontal={16}
          paddingBottom={16 + (keyboardVisible ? 0 : COMPOSER_IDLE_BOTTOM_EXTRA)}
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
              void deleteMessage
                .mutateAsync({ messageId: deleteTargetId })
                .then(() => setDeleteTargetId(null))
                .catch(() => setDeleteTargetId(null))
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
  })
