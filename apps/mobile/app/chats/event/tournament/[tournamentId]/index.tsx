import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../../../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../../../../src/components/AuthRequiredCard'
import { ChatScreenLoading } from '../../../../../src/components/ChatScreenLoading'
import { ChatComposer } from '../../../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../../../src/components/ChatThreadMessageList'
import { ChatThreadRoot } from '../../../../../src/components/ChatThreadRoot'
import type { ChatMessage } from '../../../../../src/lib/chatMessages'
import { PageLayout } from '../../../../../src/components/navigation/PageLayout'
import { UnreadIndicatorDot } from '../../../../../src/components/UnreadIndicatorDot'
import { ActionButton, EmptyState, LoadingBlock, Screen } from '../../../../../src/components/ui'
import { realtimeAwareQueryOptions } from '../../../../../src/lib/realtimePoll'
import { trpc } from '../../../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../../../src/lib/theme'
import { useChatKeyboardVerticalOffset } from '../../../../../src/hooks/useChatKeyboardVerticalOffset'
import { useAuth } from '../../../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../../../src/providers/ThemeProvider'
import { useToast } from '../../../../../src/providers/ToastProvider'

/** Как в клубном чате: `CLUB_COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMPOSER_IDLE_BOTTOM_EXTRA = 24

export default function TournamentChatScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ tournamentId: string; title?: string; divisionId?: string }>()
  const tournamentId = params.tournamentId
  const title = params.title || 'Event chat'
  const paramDivisionId = typeof params.divisionId === 'string' && params.divisionId ? params.divisionId : null
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(paramDivisionId)

  useEffect(() => {
    setSelectedDivisionId(paramDivisionId)
  }, [tournamentId, paramDivisionId])

  const activeDivisionId = selectedDivisionId
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const scrollRef = useRef<ScrollView>(null)
  const [draft, setDraft] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const threadContentOpacity = useRef(new Animated.Value(1)).current
  const skipThreadTopicFadeRef = useRef(true)

  useEffect(() => {
    skipThreadTopicFadeRef.current = true
  }, [tournamentId])

  useEffect(() => {
    if (skipThreadTopicFadeRef.current) {
      skipThreadTopicFadeRef.current = false
      return
    }
    threadContentOpacity.setValue(0.78)
    Animated.timing(threadContentOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [activeDivisionId, threadContentOpacity])

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }, [])

  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: Boolean(tournamentId) && isAuthenticated,
    ...realtimeAwareQueryOptions,
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
    {
      enabled: Boolean(tournamentId) && isAuthenticated && !activeDivisionId,
      ...realtimeAwareQueryOptions,
    }
  )
  const divisionMessagesQuery = trpc.tournamentChat.listDivision.useQuery(
    { divisionId: activeDivisionId || '', limit: 100 },
    { enabled: Boolean(activeDivisionId) && isAuthenticated, ...realtimeAwareQueryOptions }
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
    onSuccess: async (data: { wasFiltered?: boolean }) => {
      setDraft('')
      await Promise.all([
        tournamentMessagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (e) => toast.error(e.message || 'Failed to send message'),
  })
  const sendDivisionMessage = trpc.tournamentChat.sendDivision.useMutation({
    onSuccess: async (data: { wasFiltered?: boolean }) => {
      setDraft('')
      await Promise.all([
        divisionMessagesQuery.refetch(),
        utils.tournamentChat.listMyEventChats.invalidate(),
      ])
      if (data?.wasFiltered) {
        toast.success('Some words were filtered.', 'Filtered')
      }
    },
    onError: (e) => toast.error(e.message || 'Failed to send message'),
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
        <AuthRequiredCard
          title="Authentication required"
          body="Tournament chat is restricted to participants and admins."
        />
      </Screen>
    )
  }

  const messagesLoading = activeDivisionId
    ? divisionMessagesQuery.isLoading
    : tournamentMessagesQuery.isLoading

  if (permissionsQuery.isLoading) {
    return <ChatScreenLoading title={title} />
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
            onPress={() => setSelectedDivisionId(null)}
            style={[styles.topicPill, !activeDivisionId && styles.topicPillActive]}
          >
            <Feather name="award" size={16} color={!activeDivisionId ? colors.white : colors.textMuted} />
            <Text style={[styles.topicPillText, !activeDivisionId && styles.topicPillTextActive]}>General Chat</Text>
          </Pressable>
          {eventMeta?.unreadCount ? (
            <View style={styles.topicUnreadDotWrap} accessibilityLabel="Unread messages">
              <UnreadIndicatorDot />
            </View>
          ) : null}
        </View>

        {divisions.map((d: any) => (
          <View key={d.id} style={styles.topicBarItem}>
            <Pressable
              onPress={() => setSelectedDivisionId(d.id)}
              style={[styles.topicPill, activeDivisionId === d.id && styles.topicPillActive]}
            >
              <Feather name="hash" size={16} color={activeDivisionId === d.id ? colors.white : colors.textMuted} />
              <Text
                style={[styles.topicPillText, activeDivisionId === d.id && styles.topicPillTextActive]}
                numberOfLines={1}
              >
                {d.name}
              </Text>
            </Pressable>
            {d.unreadCount ? (
              <View style={styles.topicUnreadDotWrap} accessibilityLabel="Unread messages">
                <UnreadIndicatorDot />
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
      onTopBarTitlePress={() => {
        if (!tournamentId) return
        router.push(`/tournaments/${tournamentId}`)
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {topicBar}
        <Animated.View style={[styles.threadFadeWrap, { opacity: threadContentOpacity }]}>
          <View style={styles.contextRow}>
            <View style={styles.contextLeft}>
              <Feather name={activeDivisionId ? 'hash' : 'award'} size={16} color={colors.textMuted} />
              <Text style={styles.contextTitle}>{activeLabel}</Text>
              <Text style={styles.contextDot}>·</Text>
              <Feather name="users" size={16} color={colors.textMuted} />
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
              <LoadingBlock label="Loading messages…" />
            ) : isEmpty ? (
              <EmptyState
                title="No messages yet"
                body="Say hi to other players or ask the organizer a question."
              />
            ) : (
              <ChatThreadMessageList
                messages={messages as ChatMessage[]}
                currentUserId={user?.id}
                onPressAvatar={(m) => {
                  if (!m.userId) return
                  router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
                }}
                canDelete={(m) => {
                  const mine = Boolean(user?.id && m.userId === user?.id)
                  return Boolean((mine || canModerate) && !m.isDeleted)
                }}
                onRequestDelete={(m) => setDeleteTargetId(m.id)}
                deleteDisabled={activeDivisionId ? deleteDivisionMessage.isPending : deleteMessage.isPending}
              />
            )}
          </ChatThreadRoot>
        </Animated.View>

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

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  threadFadeWrap: {
    flex: 1,
    minHeight: 0,
  },
  topicBarWrap: {
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 220,
    flexDirection: 'row',
    gap: 10,
  },
  topicPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  topicPillText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  topicPillTextActive: {
    color: colors.white,
  },
  topicUnreadDotWrap: {
    marginLeft: 8,
    justifyContent: 'center',
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
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  contextDot: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  contextMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
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
})
