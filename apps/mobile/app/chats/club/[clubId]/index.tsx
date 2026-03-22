import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../../../src/components/AppBottomSheet'
import { ChatComposer } from '../../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../src/components/ChatThreadRoot'
import type { ChatMessage } from '../../../../src/lib/chatMessages'
import { ActionButton, EmptyState, IconButton, LoadingBlock, Screen, SurfaceCard } from '../../../../src/components/ui'
import { trpc } from '../../../../src/lib/trpc'
import { palette } from '../../../../src/lib/theme'
import { useAuth } from '../../../../src/providers/AuthProvider'

export default function ClubChatScreen() {
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const clubName = params.name || 'Club chat'
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const myChatClubsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
  const isAdmin = Boolean(myChatClubsQuery.data?.find((c) => c.id === clubId)?.isAdmin)

  const messagesQuery = trpc.clubChat.list.useQuery(
    { clubId, limit: 100 },
    { enabled: Boolean(clubId) && isAuthenticated }
  )
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
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true })
    })
  }, [messagesQuery.data?.length])

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

  return (
    <Screen
      chatAmbient
      left={<IconButton icon={<Feather name="arrow-left" size={20} color={palette.text} />} onPress={() => router.back()} />}
      title={clubName}
      subtitle="Club Chat"
      scroll={false}
    >
      {messagesQuery.error ? (
        <SurfaceCard tone="soft">
          <Text style={styles.error}>{messagesQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 2 : 0}
      >
        <ChatThreadRoot
          ref={scrollRef}
          contentContainerStyle={[styles.messages, isEmpty && styles.messagesEmpty]}
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
    </Screen>
  )
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  error: {
    color: palette.danger,
    lineHeight: 20,
  },
  messages: {
    paddingHorizontal: 0,
    paddingBottom: 16,
    gap: 12,
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingBottom: 0,
  },
})
