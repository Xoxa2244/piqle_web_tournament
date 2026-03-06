import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { ChatMessageBubble } from '../../../../../src/components/ChatPreviewCard'
import { ActionButton, EmptyState, InputField, LoadingBlock, Screen, SurfaceCard } from '../../../../../src/components/ui'
import { trpc } from '../../../../../src/lib/trpc'
import { palette, spacing } from '../../../../../src/lib/theme'
import { useAuth } from '../../../../../src/providers/AuthProvider'

export default function TournamentChatScreen() {
  const params = useLocalSearchParams<{ tournamentId: string; title?: string }>()
  const tournamentId = params.tournamentId
  const title = params.title || 'Event chat'
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')

  const permissionsQuery = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const messagesQuery = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit: 100 },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const markRead = trpc.tournamentChat.markTournamentRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        messagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteTournament.useMutation({
    onSuccess: async () => {
      await messagesQuery.refetch()
    },
  })

  const permission = permissionsQuery.data?.tournament

  useEffect(() => {
    if (!tournamentId || !isAuthenticated) return
    markRead.mutate({ tournamentId })
  }, [tournamentId, isAuthenticated])

  if (!isAuthenticated) {
    return (
      <Screen title={title} subtitle="Sign in to access tournament chat.">
        <EmptyState title="Authentication required" body="Tournament chat is restricted to participants and admins." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  if (permissionsQuery.isLoading || messagesQuery.isLoading) {
    return <Screen title={title}><LoadingBlock label="Loading chat…" /></Screen>
  }

  if (!permission?.canView) {
    return (
      <Screen title={title} subtitle="Tournament-wide event thread.">
        <EmptyState title="Chat unavailable" body={permission?.reason || 'You do not have access to this thread.'} />
      </Screen>
    )
  }

  return (
    <Screen title={title} subtitle="Organizer, admins, and event participants share this thread.">
      {(messagesQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="No messages yet" body="This tournament thread will populate as soon as people start posting." />
      ) : null}

      {messagesQuery.data?.map((message) => (
        <View key={message.id} style={{ gap: 8 }}>
          <ChatMessageBubble
            author={message.user?.name || 'Player'}
            text={message.isDeleted ? 'Message removed' : message.text || ''}
            createdAt={message.createdAt}
            isMine={message.userId === user?.id}
          />
          {(message.userId === user?.id || permission.canModerate) && !message.isDeleted ? (
            <ActionButton label="Delete" variant="secondary" loading={deleteMessage.isPending} onPress={() => deleteMessage.mutate({ messageId: message.id })} />
          ) : null}
        </View>
      ))}

      {permission.canPost ? (
        <SurfaceCard>
          <InputField value={draft} onChangeText={setDraft} placeholder="Write a message" multiline />
          <View style={{ marginTop: spacing.md }}>
            <ActionButton label="Send message" loading={sendMessage.isPending} onPress={() => sendMessage.mutate({ tournamentId, text: draft.trim() })} />
          </View>
        </SurfaceCard>
      ) : null}
    </Screen>
  )
}
