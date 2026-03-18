import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatMessageBubble } from '../../../../../src/components/ChatPreviewCard'
import { ActionButton, EmptyState, IconButton, LoadingBlock, Screen } from '../../../../../src/components/ui'
import { trpc } from '../../../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../../../src/lib/theme'
import { useAuth } from '../../../../../src/providers/AuthProvider'

export default function TournamentChatScreen() {
  const params = useLocalSearchParams<{ tournamentId: string; title?: string; divisionId?: string }>()
  const tournamentId = params.tournamentId
  const title = params.title || 'Event chat'
  const activeDivisionId = typeof params.divisionId === 'string' && params.divisionId ? params.divisionId : null
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState('')

  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: Boolean(tournamentId) && isAuthenticated,
  })
  const eventMeta = useMemo(() => {
    const all = (eventChatsQuery.data ?? []) as any[]
    return all.find((e) => e.id === tournamentId) ?? null
  }, [eventChatsQuery.data, tournamentId])

  const permissionsQuery = trpc.tournamentChat.getPermissions.useQuery(
    { tournamentId, divisionIds: activeDivisionId ? [activeDivisionId] : undefined },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const tournamentMessagesQuery = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit: 100 },
    { enabled: Boolean(tournamentId) && isAuthenticated && !activeDivisionId }
  )
  const divisionMessagesQuery = trpc.tournamentChat.listDivision.useQuery(
    { divisionId: activeDivisionId || '', limit: 100 },
    { enabled: Boolean(activeDivisionId) && isAuthenticated }
  )
  const markRead = trpc.tournamentChat.markTournamentRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const markDivisionRead = trpc.tournamentChat.markDivisionRead.useMutation({
    onSuccess: async () => {
      await utils.tournamentChat.listMyEventChats.invalidate()
    },
  })
  const sendMessage = trpc.tournamentChat.sendTournament.useMutation({
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        tournamentMessagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
    },
  })
  const sendDivisionMessage = trpc.tournamentChat.sendDivision.useMutation({
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        divisionMessagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
    },
  })
  const deleteMessage = trpc.tournamentChat.deleteTournament.useMutation({
    onSuccess: async () => {
      await tournamentMessagesQuery.refetch()
    },
  })
  const deleteDivisionMessage = trpc.tournamentChat.deleteDivision.useMutation({
    onSuccess: async () => {
      await divisionMessagesQuery.refetch()
    },
  })

  const permission = permissionsQuery.data?.tournament
  const activeDivisionPermission = activeDivisionId ? permissionsQuery.data?.divisions?.[0] : null

  useEffect(() => {
    if (!tournamentId || !isAuthenticated) return
    if (activeDivisionId) {
      markDivisionRead.mutate({ divisionId: activeDivisionId })
    } else {
      markRead.mutate({ tournamentId })
    }
  }, [tournamentId, isAuthenticated, activeDivisionId])

  if (!isAuthenticated) {
    return (
      <Screen title={title} subtitle="Sign in to access tournament chat.">
        <EmptyState title="Authentication required" body="Tournament chat is restricted to participants and admins." />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  const messagesLoading = activeDivisionId
    ? divisionMessagesQuery.isLoading
    : tournamentMessagesQuery.isLoading

  const isInitialLoad = permissionsQuery.isLoading && !activeDivisionId
  if (isInitialLoad) {
    return <Screen title={title}><LoadingBlock label="Loading chat…" /></Screen>
  }

  const hasAccess = permission?.canView && (!activeDivisionId || activeDivisionPermission?.canView)
  if (!permissionsQuery.isLoading && !hasAccess) {
    if (activeDivisionId) {
      return (
        <Screen title={title} subtitle="Division thread.">
          <EmptyState title="Chat unavailable" body={activeDivisionPermission?.reason || 'You do not have access to this division thread.'} />
        </Screen>
      )
    }
    return (
      <Screen title={title} subtitle="Tournament-wide event thread.">
        <EmptyState title="Chat unavailable" body={permission?.reason || 'You do not have access to this thread.'} />
      </Screen>
    )
  }

  const divisions = (eventMeta?.divisions ?? []) as any[]
  const activeDivision = activeDivisionId ? divisions.find((d: any) => d.id === activeDivisionId) ?? null : null
  const activeLabel = activeDivision ? activeDivision.name : 'General Chat'
  const canPost = activeDivisionId ? Boolean(activeDivisionPermission?.canPost) : Boolean(permission?.canPost)
  const canModerate = activeDivisionId ? Boolean(activeDivisionPermission?.canModerate) : Boolean(permission?.canModerate)
  const messages = ((activeDivisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []) as any[]
  const isEmpty = (messages.length ?? 0) === 0
  const topicBar = (
    <View style={styles.topicBarWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topicBar}
      >
        <View style={styles.topicBarItem}>
          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/chats/event/tournament/[tournamentId]',
                params: { tournamentId, title },
              })
            }
            style={[styles.topicPill, !activeDivisionId && styles.topicPillActive]}
          >
            <Feather name="award" size={16} color={!activeDivisionId ? palette.white : palette.textMuted} />
            <Text style={[styles.topicPillText, !activeDivisionId && styles.topicPillTextActive]}>General Chat</Text>
          </Pressable>
          {eventMeta?.unreadCount ? (
            <View style={styles.topicUnread}>
              <Text style={styles.topicUnreadText}>{eventMeta.unreadCount > 99 ? '99+' : String(eventMeta.unreadCount)}</Text>
            </View>
          ) : null}
        </View>

        {divisions.map((d: any) => (
          <View key={d.id} style={styles.topicBarItem}>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/chats/event/tournament/[tournamentId]',
                  params: {
                    tournamentId,
                    title,
                    divisionId: d.id,
                  },
                })
              }
              style={[styles.topicPill, activeDivisionId === d.id && styles.topicPillActive]}
            >
              <Feather name="hash" size={16} color={activeDivisionId === d.id ? palette.white : palette.textMuted} />
              <Text style={styles.topicPillText} numberOfLines={1}>
                {d.name}
              </Text>
            </Pressable>
            {d.unreadCount ? (
              <View style={styles.topicUnread}>
                <Text style={styles.topicUnreadText}>{d.unreadCount > 99 ? '99+' : String(d.unreadCount)}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  )

  return (
    <Screen
      left={<IconButton icon={<Feather name="arrow-left" size={20} color={palette.text} />} onPress={() => router.back()} />}
      title={title}
      subtitle="Tournament Chat"
      scroll={false}
      contentStyle={{ paddingHorizontal: 24, paddingTop: 0, paddingBottom: 0 }}
    >
      {topicBar}
      <View style={styles.contextRow}>
        <View style={styles.contextLeft}>
          <Feather name={activeDivisionId ? 'hash' : 'award'} size={16} color={palette.textMuted} />
          <Text style={styles.contextTitle}>{activeLabel}</Text>
          <Text style={styles.contextDot}>·</Text>
          <Feather name="users" size={16} color={palette.textMuted} />
          <Text style={styles.contextMeta}>Tournament Chat</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.messages, (isEmpty || messagesLoading) && styles.messagesEmpty]}
        showsVerticalScrollIndicator={false}
      >
        {messagesLoading ? (
          <Text style={styles.emptyTitle}>Loading…</Text>
        ) : isEmpty ? (
          <Text style={styles.emptyTitle}>No messages yet</Text>
        ) : null}

        {!messagesLoading && messages.map((message) => (
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
                  disabled={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
                  onPress={() =>
                    activeDivisionId
                      ? deleteDivisionMessage.mutate({ messageId: message.id })
                      : deleteMessage.mutate({ messageId: message.id })
                  }
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

      {canPost ? (
        <View style={[styles.composer, { paddingBottom: 16 + insets.bottom }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${activeLabel}...`}
            placeholderTextColor={palette.textMuted}
            style={styles.composerInput}
          />
          <Pressable
            style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.9 }]}
            disabled={(activeDivisionId ? sendDivisionMessage.isPending : sendMessage.isPending) || draft.trim().length === 0}
            onPress={() =>
              activeDivisionId
                ? sendDivisionMessage.mutate({ divisionId: activeDivisionId, text: draft.trim() })
                : sendMessage.mutate({ tournamentId, text: draft.trim() })
            }
          >
            <Feather name="send" size={18} color={palette.white} />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  topicBarWrap: {
    backgroundColor: palette.background,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topicBar: {
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 12,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  topicBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicPill: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF0F2',
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 220,
    flexDirection: 'row',
    gap: 10,
  },
  topicPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  topicPillText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
  topicPillTextActive: {
    color: palette.white,
  },
  topicUnread: {
    marginLeft: -10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2D78',
    borderWidth: 2,
    borderColor: palette.background,
  },
  topicUnreadText: {
    color: palette.white,
    fontWeight: '900',
    fontSize: 12,
  },
  contextRow: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 16,
  },
  contextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextTitle: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  contextDot: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  contextMeta: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 999,
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
