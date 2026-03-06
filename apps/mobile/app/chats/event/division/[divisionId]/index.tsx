import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { ChatMessageBubble } from '../../../../../src/components/ChatPreviewCard'
import { ActionButton, EmptyState, InputField, LoadingBlock, Screen, SurfaceCard } from '../../../../../src/components/ui'
import { trpc } from '../../../../../src/lib/trpc'
import { spacing } from '../../../../../src/lib/theme'
import { useAuth } from '../../../../../src/providers/AuthProvider'

export default function DivisionChatScreen() {
  const params = useLocalSearchParams<{
    divisionId: string
    tournamentId: string
    title?: string
    eventTitle?: string
  }>()
  const divisionId = params.divisionId
  const tournamentId = params.tournamentId
  const title = params.title || 'Division chat'
  const eventTitle = params.eventTitle || 'Event'
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')

  const permissionsQuery = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId, divisionIds: [divisionId] },
    { enabled: Boolean(tournamentId && divisionId) && isAuthenticated }
  )
  const messagesQuery = trpc.tournamentChat.listDivision.useQuery(
    { divisionId, limit: 100 },
    { enabled: Boolean(divisionId) && isAuthenticated }
  )
  const markRead = trpc.tournamentChat.markDivisionRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const sendMessage = trpc.tournamentChat.sendDivision.useMutation({
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        messagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteDivision.useMutation({
    onSuccess: async () => {
      await messagesQuery.refetch()
    },
  })

  const permission = permissionsQuery.data?.divisions?.[0]

  useEffect(() => {
    if (!divisionId || !isAuthenticated) return
    markRead.mutate({ divisionId })
  }, [divisionId, isAuthenticated])

  if (!isAuthenticated) {
    return (
      <Screen title={title} subtitle="Sign in to access division chat.">
        <EmptyState title="Authentication required" body="Division chat is visible only to eligible participants and admins." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  if (permissionsQuery.isLoading || messagesQuery.isLoading) {
    return <Screen title={title}><LoadingBlock label="Loading chat…" /></Screen>
  }

  if (!permission?.canView) {
    return (
      <Screen title={title} subtitle={`${eventTitle} · restricted thread`}>
        <EmptyState title="Chat unavailable" body={permission?.reason || 'You do not have access to this thread.'} />
      </Screen>
    )
  }

  return (
    <Screen title={title} subtitle={`${eventTitle} · participants for this division only`}>
      {(messagesQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="No messages yet" body="This division thread is quiet for now." />
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
            <ActionButton label="Send message" loading={sendMessage.isPending} onPress={() => sendMessage.mutate({ divisionId, text: draft.trim() })} />
          </View>
        </SurfaceCard>
      ) : null}
    </Screen>
  )
}
