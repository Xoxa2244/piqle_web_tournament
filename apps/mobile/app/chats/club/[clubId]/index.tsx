import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatMessageBubble } from '../../../../src/components/ChatPreviewCard'
import { ActionButton, EmptyState, IconButton, LoadingBlock, Screen, SurfaceCard } from '../../../../src/components/ui'
import { trpc } from '../../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../../src/lib/theme'
import { useAuth } from '../../../../src/providers/AuthProvider'

export default function ClubChatScreen() {
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const clubName = params.name || 'Club chat'
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const insets = useSafeAreaInsets()

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
      left={<IconButton icon={<Feather name="arrow-left" size={20} color={palette.text} />} onPress={() => router.back()} />}
      title={clubName}
      subtitle="Club Chat"
      scroll={false}
      contentStyle={{ paddingHorizontal: 24, paddingTop: 0, paddingBottom: 0 }}
    >
      {messagesQuery.error ? (
        <SurfaceCard tone="soft">
          <Text style={styles.error}>{messagesQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.messages, isEmpty && styles.messagesEmpty]}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <EmptyState title="" body="Start the conversation or wait for the next club update." />
          </View>
        ) : null}

        {messages.map((message) => (
          <View key={message.id} style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: message.userId === user?.id ? 'flex-end' : 'flex-start',
                gap: 10,
              }}
            >
              {message.userId === user?.id && !message.isDeleted ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete message"
                  disabled={deleteMessage.isPending}
                  onPress={() => deleteMessage.mutate({ messageId: message.id })}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Feather name="trash-2" size={16} color={palette.textMuted} />
                </Pressable>
              ) : null}

              <ChatMessageBubble
                author={message.user?.name || 'Player'}
                text={message.isDeleted ? 'Message removed' : message.text || ''}
                createdAt={message.createdAt}
                isMine={message.userId === user?.id}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: 16 + insets.bottom }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message club..."
          placeholderTextColor={palette.textMuted}
          style={styles.composerInput}
          multiline={false}
        />
        <Pressable
          style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.9 }]}
          disabled={sendMessage.isPending || draft.trim().length === 0}
          onPress={() => sendMessage.mutate({ clubId, text: draft.trim() })}
        >
          <Feather name="send" size={18} color={palette.white} />
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    paddingBottom: 0,
  },
  emptyTitle: {
    color: '#6B7280',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 0,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.background,
  },
  composerInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    backgroundColor: '#EEF0F2',
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
})
