import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import { FeedbackRatingModal } from '../../../../src/components/FeedbackRatingModal'
import type { ChatMessage } from '../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, LoadingBlock, Screen, SurfaceCard } from '../../../../src/components/ui'
import { trpc } from '../../../../src/lib/trpc'
import { FEEDBACK_API_ENABLED } from '../../../../src/lib/config'
import { palette, spacing } from '../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../src/providers/AuthProvider'

/** Доп. отступ снизу у поля, пока клавиатура закрыта (полноэкранный стек без tab bar). */
const CLUB_COMPOSER_IDLE_BOTTOM_EXTRA = 24

export default function ClubChatScreen() {
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const clubName = params.name || 'Club chat'
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])
  const myChatClubsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
  const isAdmin = Boolean(myChatClubsQuery.data?.find((c) => c.id === clubId)?.isAdmin)

  const messagesQuery = trpc.clubChat.list.useQuery(
    { clubId, limit: 100 },
    { enabled: Boolean(clubId) && isAuthenticated }
  )
  const pendingFeedbackQuery = trpc.feedback.getPendingPrompts.useQuery(undefined, {
    enabled: isAuthenticated && FEEDBACK_API_ENABLED,
  })
  const markRead = trpc.clubChat.markRead.useMutation({
    onSuccess: async () => {
      await utils.club.listMyChatClubs.invalidate()
    },
  })
  const sendMessage = trpc.clubChat.send.useMutation({
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        messagesQuery.refetch(),
        utils.club.listMyChatClubs.invalidate(),
      ])
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
  }, [clubId, isAuthenticated])

  useEffect(() => {
    scrollToBottom(true)
  }, [messagesQuery.data?.length, scrollToBottom])

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

  if (!isAuthenticated) {
    return (
      <Screen title={clubName} subtitle="Sign in to access club messages.">
        <EmptyState title="Authentication required" body="Club chat follows the same membership and moderation rules as the web app." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  if (messagesQuery.isLoading) {
    return <Screen title={clubName}><LoadingBlock label="Loading chat…" /></Screen>
  }

  const messages = (messagesQuery.data ?? []) as any[]
  const isEmpty = messages.length === 0
  const pendingClubPrompt = (pendingFeedbackQuery.data?.items ?? []).find(
    (item: any) => item.entityType === 'CLUB' && item.entityId === clubId,
  )
  const showDevClubPrompt = !FEEDBACK_API_ENABLED

  return (
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitle={clubName}
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
          {pendingClubPrompt || showDevClubPrompt ? (
            <SurfaceCard tone="soft">
              <Pressable onPress={() => setClubFeedbackOpen(true)} style={styles.feedbackPromptRow}>
                <Text style={styles.feedbackPromptTitle}>Rate this club</Text>
                <Text style={styles.feedbackPromptStars}>★ ★ ★ ★ ★</Text>
                <Text style={styles.feedbackPromptBody}>Tap stars to leave your feedback.</Text>
              </Pressable>
            </SurfaceCard>
          ) : null}
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
        </ChatThreadRoot>

        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder="Message club..."
          onSend={() => sendMessage.mutate({ clubId, text: draft.trim() })}
          sendDisabled={sendMessage.isPending || draft.trim().length === 0}
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
        subtitle="Your feedback helps improve club experience."
        onSubmitted={() => {
          void pendingFeedbackQuery.refetch()
        }}
      />
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  error: {
    color: palette.danger,
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
  feedbackPromptTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackPromptStars: {
    color: '#F4B000',
    fontSize: 18,
    letterSpacing: 2,
  },
  feedbackPromptBody: {
    color: palette.textMuted,
    fontSize: 13,
  },
})
