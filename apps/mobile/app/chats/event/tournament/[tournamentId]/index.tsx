import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../../../../src/components/AppBottomSheet'
import { ChatComposer } from '../../../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../../src/components/ChatThreadRoot'
import type { ChatMessage } from '../../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, LoadingBlock, Screen } from '../../../../../src/components/ui'
import { trpc } from '../../../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../../src/providers/AuthProvider'

/** Как в клубном чате: `CLUB_COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMPOSER_IDLE_BOTTOM_EXTRA = 24

export default function TournamentChatScreen() {
  const params = useLocalSearchParams<{ tournamentId: string; title?: string; divisionId?: string }>()
  const tournamentId = params.tournamentId
  const title = params.title || 'Event chat'
  const activeDivisionId = typeof params.divisionId === 'string' && params.divisionId ? params.divisionId : null
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const scrollRef = useRef<ScrollView>(null)
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])

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

  const messagesLen = ((activeDivisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []).length
  useEffect(() => {
    scrollToBottom(true)
  }, [messagesLen, activeDivisionId, scrollToBottom])

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
        keyboardShouldPersistTaps="handled"
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
              <Text
                style={[styles.topicPillText, activeDivisionId === d.id && styles.topicPillTextActive]}
                numberOfLines={1}
              >
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
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitle={title}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
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

        <ChatThreadRoot
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, (isEmpty || messagesLoading) && styles.messagesEmpty]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messagesLoading ? (
            <Text style={styles.emptyTitle}>Loading…</Text>
          ) : isEmpty ? (
            <EmptyState
              title="No messages yet"
              body="Say hi to other players or ask the organizer a question."
            />
          ) : (
            <ChatThreadMessageList
              messages={messages as ChatMessage[]}
              currentUserId={user?.id}
              canDelete={(m) => {
                const mine = Boolean(user?.id && m.userId === user?.id)
                return Boolean((mine || canModerate) && !m.isDeleted)
              }}
              onRequestDelete={(m) => setDeleteTargetId(m.id)}
              deleteDisabled={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
            />
          )}
        </ChatThreadRoot>

        {canPost ? (
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${activeLabel}...`}
            onSend={() =>
              activeDivisionId
                ? sendDivisionMessage.mutate({ divisionId: activeDivisionId, text: draft.trim() })
                : sendMessage.mutate({ tournamentId, text: draft.trim() })
            }
            sendDisabled={
              (activeDivisionId ? sendDivisionMessage.isPending : sendMessage.isPending) || draft.trim().length === 0
            }
            paddingHorizontal={16}
            paddingBottom={16 + (keyboardVisible ? 0 : COMPOSER_IDLE_BOTTOM_EXTRA)}
            multiline={false}
          />
        ) : null}
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
            confirmLabel={
              (activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending)
                ? 'Deleting…'
                : 'Delete'
            }
            onCancel={() => setDeleteTargetId(null)}
            onConfirm={() => {
              if (!deleteTargetId) return
              const run = activeDivisionId
                ? deleteDivisionMessage.mutateAsync({ messageId: deleteTargetId })
                : deleteMessage.mutateAsync({ messageId: deleteTargetId })
              void run.then(() => setDeleteTargetId(null)).catch(() => setDeleteTargetId(null))
            }}
            confirmLoading={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
          />
        }
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
  topicBarWrap: {
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  topicBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
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
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 12,
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 72,
    gap: 12,
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingBottom: 0,
  },
  emptyTitle: {
    color: '#6B7280',
    fontSize: 18,
    fontWeight: '800',
  },
})
