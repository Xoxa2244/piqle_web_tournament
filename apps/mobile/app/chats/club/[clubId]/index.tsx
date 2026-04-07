import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../src/components/AuthRequiredCard'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { FeedbackEntityContextCard } from '../../../../src/components/FeedbackEntityContextCard'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import { EntityImage } from '../../../../src/components/EntityImage'
import { FeedbackRatingModal } from '../../../../src/components/FeedbackRatingModal'
import type { ChatMessage } from '../../../../src/lib/chatMessages'
import { ChatScreenLoading } from '../../../../src/components/ChatScreenLoading'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, Screen, SurfaceCard } from '../../../../src/components/ui'
import { chatRealtimeQueryOptions, messageThreadRealtimeQueryOptions } from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { FEEDBACK_API_ENABLED } from '../../../../src/lib/config'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../src/providers/ToastProvider'

/** Доп. отступ снизу у поля, пока клавиатура закрыта (полноэкранный стек без tab bar). */
const CLUB_COMPOSER_IDLE_BOTTOM_EXTRA = 24

export default function ClubChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const clubName = params.name || 'Club chat'
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
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
      void utils.club.listMyChatClubs.invalidate()
    },
  })
  const sendMessage = trpc.clubChat.send.useMutation({
    onMutate: ({ text }: { text: string }) => {
      const trimmed = text.trim()
      if (!trimmed || !clubId || !user?.id) return null

      const createdAt = new Date()
      const optimisticId = `optimistic-${clubId}-${createdAt.getTime()}`
      const optimisticMessage = {
        id: optimisticId,
        clubId,
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

      const previousClubs = ((utils.club.listMyChatClubs.getData(undefined) ?? []) as any[]).slice()

      setDraft('')
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
      clearClubUnreadCache()
      void messagesQuery.refetch()
      void utils.club.listMyChatClubs.invalidate()
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
    onSuccess: async () => {
      await messagesQuery.refetch()
    },
  })

  useEffect(() => {
    if (!clubId || !isAuthenticated) return
    markRead.mutate({ clubId })
  }, [clubId, isAuthenticated, messagesQuery.data?.length])

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
    if (!optimisticMessages.length) return serverMessages
    const serverIds = new Set(serverMessages.map((message) => message.id))
    return [...serverMessages, ...optimisticMessages.filter((message) => !serverIds.has(message.id))]
  }, [messagesQuery.data, optimisticMessages])
  const pendingClubPrompt = (pendingFeedbackQuery.data?.items ?? []).find(
    (item: any) => item.entityType === 'CLUB' && item.entityId === clubId,
  )
  const showDevClubPrompt = !FEEDBACK_API_ENABLED
  const showClubFeedbackPrompt = Boolean(pendingClubPrompt || showDevClubPrompt)

  useEffect(() => {
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
              onPressAvatar={(m) => {
                if (!m.userId) return
                router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
              }}
              canDelete={(m) =>
                Boolean((user?.id && m.userId === user?.id) || isAdmin) && !m.isDeleted
              }
              onRequestDelete={(m) => setDeleteTargetId(m.id)}
              deleteDisabled={deleteMessage.isPending}
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
          onSend={() => {
            void sendMessage.mutateAsync({ clubId, text: draft.trim() }).catch(() => undefined)
          }}
          sendDisabled={draft.trim().length === 0}
          multiline={false}
          paddingHorizontal={16}
          paddingBottom={16 + (keyboardVisible ? 0 : CLUB_COMPOSER_IDLE_BOTTOM_EXTRA)}
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
  })
