import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'

import { Feather } from '@expo/vector-icons'
import { AppBottomSheet, AppConfirmActions } from '../../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { ChatPreviewCard } from '../../src/components/ChatPreviewCard'
import { EventChatListItemActive, EventChatListItemArchived, type EventChatListEvent } from '../../src/components/EventChatListItem'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { StaggeredReveal } from '../../src/components/StaggeredReveal'
import { SwipeDismissNotificationRow } from '../../src/components/SwipeDismissNotificationRow'
import { ActionButton, EmptyState, LoadingBlock, SearchField, SegmentedContentFade } from '../../src/components/ui'
import { buildWebUrl } from '../../src/lib/config'
import { buildMentionCountMaps } from '../../src/lib/chatMentionNotifications'
import { getChatSpecialPreviewText } from '../../src/lib/chatSpecialMessages'
import { useChatRealtimeQueryOptions, useRealtimeAwareQueryOptions } from '../../src/lib/realtimePoll'
import { trpc } from '../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useNotificationSwipeHidden } from '../../src/providers/NotificationSwipeHiddenProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

type Segment = 'direct' | 'clubs' | 'events'

export default function ChatsTab() {
  const { token, user } = useAuth()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const chatRealtimeQueryOptions = useChatRealtimeQueryOptions()
  const realtimeAwareQueryOptions = useRealtimeAwareQueryOptions()
  const api = trpc as any
  const utils = (trpc as any).useUtils()
  const { swipeHiddenIds } = useNotificationSwipeHidden()
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<Segment>('direct')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [expandedArchiveEventIds, setExpandedArchiveEventIds] = useState<Set<string>>(new Set())
  const [revealEpoch, setRevealEpoch] = useState(0)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [directSwipeActive, setDirectSwipeActive] = useState(false)
  const [pendingDirectDelete, setPendingDirectDelete] = useState<{ threadId: string; name: string } | null>(null)
  const createPlusSpin = useRef(new Animated.Value(0)).current
  const createSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const createLongPressTriggeredRef = useRef(false)
  const directChatsQuery = api.directChat.listMyChats.useQuery(undefined, {
    enabled: isAuthenticated,
    ...chatRealtimeQueryOptions,
  })
  const deleteDirectThread = api.directChat.deleteThread.useMutation()
  const clubChatsQuery = api.club.listMyChatClubs.useQuery(undefined, {
    enabled: isAuthenticated,
    ...chatRealtimeQueryOptions,
  })
  const eventChatsQuery = api.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: isAuthenticated,
    ...chatRealtimeQueryOptions,
  })
  const notificationMentionsQuery = api.notification.list.useQuery(
    { limit: 100 },
    {
      enabled: isAuthenticated,
      ...realtimeAwareQueryOptions,
    }
  )
  const directChats = useMemo(() => ((directChatsQuery.data ?? []) as any[]), [directChatsQuery.data])
  const clubChats = useMemo(() => ((clubChatsQuery.data ?? []) as any[]), [clubChatsQuery.data])
  const eventChats = useMemo(
    () => ((eventChatsQuery.data ?? []) as EventChatListEvent[]),
    [eventChatsQuery.data]
  )
  const mentionNotificationItems = useMemo(
    () =>
      (((notificationMentionsQuery.data?.items ?? []) as any[]).filter(
        (item) => String(item?.type ?? '') === 'CHAT_MENTION' && !swipeHiddenIds.has(String(item?.id ?? ''))
      )),
    [notificationMentionsQuery.data?.items, swipeHiddenIds]
  )
  const mentionCountMaps = useMemo(
    () => buildMentionCountMaps(mentionNotificationItems),
    [mentionNotificationItems]
  )

  const filteredDirectChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = directChats
    if (!term) return list
    return list.filter((chat) => {
      const name = String(chat.otherUser?.name ?? '').toLowerCase()
      const city = String(chat.otherUser?.city ?? '').toLowerCase()
      const text = String(chat.lastMessage?.text ?? '').toLowerCase()
      return name.includes(term) || city.includes(term) || text.includes(term)
    })
  }, [directChats, search])

  const triggerCreateHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {})
  }, [])

  const createPlusRotate = createPlusSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const startCreateHoldAnimation = useCallback(() => {
    if (!createSpinLoopRef.current) {
      createPlusSpin.setValue(0)
      createSpinLoopRef.current = Animated.loop(
        Animated.timing(createPlusSpin, {
          toValue: 1,
          duration: 680,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      createSpinLoopRef.current.start()
    }
  }, [createPlusSpin])

  const stopCreateHoldAnimation = useCallback(() => {
    createSpinLoopRef.current?.stop()
    createSpinLoopRef.current = null
    Animated.timing(createPlusSpin, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [createPlusSpin])

  useEffect(() => {
    return () => {
      createSpinLoopRef.current?.stop()
    }
  }, [])

  const filteredClubChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = clubChats
    if (!term) return list
    return list.filter((club) => club.name.toLowerCase().includes(term))
  }, [clubChats, search])

  const filteredEventChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return eventChats

    return eventChats
      .map((event) => ({
        ...event,
        divisions: event.divisions.filter((division) => division.name.toLowerCase().includes(term)),
      }))
      .filter((event) => event.title.toLowerCase().includes(term) || event.divisions.length > 0)
  }, [eventChats, search])

  const activeEventChats = useMemo(() => {
    const now = Date.now()
    return (filteredEventChats ?? []).filter((event) => {
      const endMs = new Date(event.endDate).getTime()
      return !Number.isFinite(endMs) || endMs >= now
    })
  }, [filteredEventChats])

  const archivedEventChats = useMemo(() => {
    const now = Date.now()
    return (filteredEventChats ?? [])
      .filter((event) => {
        const endMs = new Date(event.endDate).getTime()
        return Number.isFinite(endMs) && endMs < now
      })
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
  }, [filteredEventChats])

  const directTotal = directChats.length
  const clubTotal = clubChats.length
  const eventTotal = eventChats.length
  const directSegmentHasUnread = useMemo(() => {
    const list = directChats
    return list.some((chat) => (chat.unreadCount ?? 0) > 0)
  }, [directChats])

  const clubsSegmentHasUnread = useMemo(() => {
    const list = clubChats
    return list.some((c: { unreadCount?: number }) => (c.unreadCount ?? 0) > 0)
  }, [clubChats])

  const eventsSegmentHasUnread = useMemo(() => {
    const list = eventChats
    return list.some((e) => {
      const divSum = (e.divisions ?? []).reduce((s, d) => s + (d.unreadCount ?? 0), 0)
      return (e.unreadCount ?? 0) + divSum > 0
    })
  }, [eventChats])

  const toggleArchiveEventExpanded = (eventId: string) => {
    setExpandedArchiveEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  const openEventGeneral = (event: Pick<EventChatListEvent, 'id' | 'title'>) => {
    router.push({
      pathname: '/chats/event/tournament/[tournamentId]',
      params: { tournamentId: event.id, title: event.title },
    })
  }

  const openEventDivision = (event: Pick<EventChatListEvent, 'id' | 'title'>, divisionId: string) => {
    router.push({
      pathname: '/chats/event/tournament/[tournamentId]',
      params: { tournamentId: event.id, title: event.title, divisionId },
    })
  }

  const onRefreshChats = useCallback(async () => {
    await Promise.all([directChatsQuery.refetch(), clubChatsQuery.refetch(), eventChatsQuery.refetch()])
  }, [clubChatsQuery, directChatsQuery, eventChatsQuery])

  const appInviteUrl = buildWebUrl('/')

  const handleInviteToApp = useCallback(async () => {
    try {
      await Share.share({
        message: `Join me on Piqle\n${appInviteUrl}`,
        url: appInviteUrl,
      })
    } catch {
      // silent on dismiss/cancel
    }
  }, [appInviteUrl])

  const handleCopyInviteToApp = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(appInviteUrl)
      toast.success('Invite link copied to clipboard.', 'Copied')
    } catch {
      toast.error('Could not copy invite link.')
    }
  }, [appInviteUrl, toast])

  const pullToRefresh = usePullToRefresh(onRefreshChats)

  const dismissDirectChat = useCallback(
    async (threadId: string) => {
      const previous = (utils.directChat.listMyChats.getData(undefined) ?? []) as any[]
      utils.directChat.listMyChats.setData(undefined, (current: any[] | undefined) =>
        (current ?? []).filter((chat) => chat.id !== threadId)
      )

      try {
        await deleteDirectThread.mutateAsync({ threadId })
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        toast.success('Chat removed.')
      } catch (error: any) {
        utils.directChat.listMyChats.setData(undefined, previous)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.error(error?.message || 'Could not remove chat.')
        throw error
      }
    },
    [deleteDirectThread, toast, utils.directChat.listMyChats]
  )

  useFocusEffect(
    useCallback(() => {
      void onRefreshChats()
    }, [onRefreshChats])
  )

  const showFullChatLoading =
    isAuthenticated &&
    directChatsQuery.data === undefined &&
    clubChatsQuery.data === undefined &&
    eventChatsQuery.data === undefined &&
    (directChatsQuery.isLoading || clubChatsQuery.isLoading || eventChatsQuery.isLoading)

  const noDataAtAll =
    !showFullChatLoading &&
    directTotal === 0 &&
    clubTotal === 0 &&
    eventTotal === 0 &&
    !directChatsQuery.isError &&
    !clubChatsQuery.isError &&
    !eventChatsQuery.isError

  const directTabEmpty = segment === 'direct' && filteredDirectChats.length === 0 && !directChatsQuery.isError
  const clubsTabEmpty = segment === 'clubs' && filteredClubChats.length === 0 && !clubChatsQuery.isError
  const eventsTabEmpty = segment === 'events' && filteredEventChats.length === 0 && !eventChatsQuery.isError

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <AuthRequiredCard
          title="Sign in to open chats"
          body="Personal messages, club chats, tournament chats, and division chats are available after sign in."
        />
      </PageLayout>
    )
  }

  return (
    <>
      <PageLayout scroll={false} contentStyle={styles.pageLayout}>
        <View style={styles.page}>
        <View style={styles.searchGutter}>
          <View style={styles.searchRow}>
            <View style={styles.searchFieldWrap}>
              <SearchField value={search} onChangeText={setSearch} placeholder="Search messages..." />
            </View>
            <Pressable
              onPress={() => {
                if (createLongPressTriggeredRef.current) {
                  createLongPressTriggeredRef.current = false
                  return
                }
                setCreateSheetOpen(true)
              }}
              onPressIn={() => {
                triggerCreateHaptic()
                startCreateHoldAnimation()
              }}
              onPressOut={() => {
                stopCreateHoldAnimation()
                if (createLongPressTriggeredRef.current) {
                  createLongPressTriggeredRef.current = false
                  setCreateSheetOpen(true)
                }
              }}
              onLongPress={() => {
                createLongPressTriggeredRef.current = true
                startCreateHoldAnimation()
              }}
              style={({ pressed, hovered }) => [
                styles.createButton,
                hovered && styles.createButtonHovered,
                pressed && styles.createButtonPressed,
              ]}
            >
              <Animated.View
                style={[styles.createIconCircle, { transform: [{ rotate: createPlusRotate }] }]}
              >
                <Feather name="plus" size={14} color={colors.primary} />
              </Animated.View>
              <Text style={styles.createButtonText}>Invite</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroller}
        >
          {[
            {
              value: 'direct' as const,
              label: 'Chats',
              showDot: directSegmentHasUnread,
            },
            {
              value: 'clubs' as const,
              label: 'Clubs',
              showDot: clubsSegmentHasUnread,
            },
            {
              value: 'events' as const,
              label: 'Events',
              showDot: eventsSegmentHasUnread,
            },
          ].map((chip) => {
            const active = segment === chip.value
            return (
              <Pressable
                key={chip.value}
                onPress={() => setSegment(chip.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.filterChipPressed,
                ]}
              >
                <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
                  {chip.label}
                </Text>
                {chip.showDot ? <View style={[styles.filterChipDot, active && styles.filterChipDotActive]} /> : null}
              </Pressable>
            )
          })}
        </ScrollView>

        <PickleRefreshScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listScrollContent}
          showsVerticalScrollIndicator={false}
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          scrollEnabled={!directSwipeActive}
          bounces
        >
      {showFullChatLoading ? (
        <View style={styles.bodyGutter}>
          <LoadingBlock label="Loading chats…" />
        </View>
      ) : null}

      {directChatsQuery.isError ? (
        <View style={styles.hintGutter}>
          <Text style={styles.hint}>Personal chats could not be loaded. Pull to retry.</Text>
        </View>
      ) : null}

      {clubChatsQuery.isError ? (
        <View style={styles.hintGutter}>
          <Text style={styles.hint}>Club chats could not be loaded. Pull to retry.</Text>
        </View>
      ) : null}

      {eventChatsQuery.isError ? (
        <View style={styles.hintGutter}>
          <Text style={styles.hint}>Event chats could not be loaded. Pull to retry.</Text>
        </View>
      ) : null}

      {noDataAtAll ? (
        <View style={styles.bodyGutter}>
          <EmptyState title="No chats yet" body="Open a player profile to start a personal chat, or join clubs and events to unlock group conversations." />
        </View>
      ) : null}

      {!showFullChatLoading && !noDataAtAll ? (
        <SegmentedContentFade activeKey={segment} segmentOrder={['direct', 'clubs', 'events']} style={styles.listScroll}>
          <>
            {segment === 'direct' ? (
              <View style={styles.tabContent}>
                {directTabEmpty ? (
                  <View style={styles.bodyGutter}>
                    <EmptyState
                      title="No personal chats"
                      body="Open any player profile and tap Message to start a conversation."
                    />
                  </View>
                ) : (
                  <>
                    {filteredDirectChats.map((chat, index) => {
                      const otherUserName = chat.otherUser?.name?.trim() || 'Player'
                      const lastMessagePrefix =
                        chat.lastMessage && !chat.lastMessage.isDeleted
                          ? chat.lastMessage.userId === user?.id
                            ? 'You: '
                            : ''
                          : ''
                      const subtitle =
                        chat.lastMessage && !chat.lastMessage.isDeleted && chat.lastMessage.text
                          ? `${lastMessagePrefix}${getChatSpecialPreviewText(chat.lastMessage.text) ?? chat.lastMessage.text}`
                          : chat.lastMessage?.isDeleted
                          ? 'Message removed'
                          : chat.otherUser?.city || 'Personal chat'

                      return (
                        <StaggeredReveal key={`direct-${chat.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`} distance={0}>
                          <SwipeDismissNotificationRow
                            disabled={deleteDirectThread.isPending}
                            onSwipeActiveChange={setDirectSwipeActive}
                            onRequestDismiss={async () => {
                              setPendingDirectDelete({ threadId: chat.id, name: otherUserName })
                            }}
                            onDismiss={async () => {}}
                          >
                            <ChatPreviewCard
                              title={otherUserName}
                              imageUri={chat.otherUser?.image}
                              subtitle={subtitle}
                              unreadCount={chat.unreadCount}
                              trailingTime={chat.lastMessage?.createdAt ?? chat.updatedAt}
                              onPress={() =>
                                router.push({
                                  pathname: '/chats/direct/[threadId]',
                                  params: {
                                    threadId: chat.id,
                                    title: otherUserName,
                                    userId: chat.otherUser.id,
                                  },
                                })
                              }
                            />
                          </SwipeDismissNotificationRow>
                        </StaggeredReveal>
                      )
                    })}
                  </>
                )}
              </View>
            ) : null}

            {segment === 'clubs' ? (
              <View style={styles.tabContent}>
                {clubsTabEmpty ? (
                  <View style={styles.bodyGutter}>
                    <EmptyState
                      title="No club chats"
                      body="You are not in any clubs yet. Browse clubs to join and unlock club chat."
                    />
                    <ActionButton label="Browse clubs" onPress={() => router.push('/clubs')} />
                  </View>
                ) : (
                  <>
                    {filteredClubChats.map((club, index) => (
                      <StaggeredReveal key={`club-${club.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`} distance={0}>
                        <ChatPreviewCard
                          title={club.name}
                          imageUri={club.logoUrl}
                          subtitle={[club.city, club.state].filter(Boolean).join(', ') || 'Club chat'}
                          unreadCount={club.unreadCount}
                          mentionCount={mentionCountMaps.clubCounts.get(club.id) ?? 0}
                          trailingTime={club.lastMessageAt}
                          onPress={() =>
                            router.push({
                              pathname: '/chats/club/[clubId]',
                              params: { clubId: club.id, name: club.name },
                            })
                          }
                        />
                      </StaggeredReveal>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            {segment === 'events' ? (
              <View style={styles.tabContent}>
                {eventsTabEmpty ? (
                  <View style={styles.bodyGutter}>
                    <EmptyState
                      title="No event chats"
                      body="You do not have access to event chats yet. Register for events or join as staff to see threads here."
                    />
                  </View>
                ) : (
                  <>
                    <View style={styles.eventStack}>
                      {activeEventChats.length > 0 ? (
                        activeEventChats.map((event, index) => (
                          <StaggeredReveal key={`event-active-${event.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`} distance={0}>
                            <EventChatListItemActive
                              event={{
                                ...(event as EventChatListEvent),
                                mentionCount:
                                  (mentionCountMaps.tournamentCounts.get(event.id) ?? 0) +
                                  (event.divisions ?? []).reduce(
                                    (sum, division) => sum + (mentionCountMaps.divisionCounts.get(division.id) ?? 0),
                                    0
                                  ),
                              }}
                              onOpenGeneral={() => openEventGeneral(event)}
                              onOpenDivision={(divisionId) => openEventDivision(event, divisionId)}
                            />
                          </StaggeredReveal>
                        ))
                      ) : (
                        <View style={styles.dashedBox}>
                          <Text style={styles.dashedBoxText}>No active events.</Text>
                        </View>
                      )}
                    </View>

                    {archivedEventChats.length > 0 ? (
                      <View style={styles.archiveBlock}>
                        <Pressable
                          onPress={() => setArchiveOpen((prev) => !prev)}
                          style={({ pressed }) => [styles.archiveHeader, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.archiveHeaderText}>Archive ({archivedEventChats.length})</Text>
                          <Feather
                            name="chevron-right"
                            size={18}
                            color={colors.textMuted}
                            style={{ transform: [{ rotate: archiveOpen ? '90deg' : '0deg' }] }}
                          />
                        </Pressable>

                        {archiveOpen ? (
                          <View style={styles.eventStack}>
                            {archivedEventChats.map((event, index) => (
                              <StaggeredReveal key={`event-arch-${event.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}-archive-${archiveOpen ? 1 : 0}`} distance={0}>
                                <EventChatListItemArchived
                                  event={{
                                    ...(event as EventChatListEvent),
                                    mentionCount:
                                      (mentionCountMaps.tournamentCounts.get(event.id) ?? 0) +
                                      (event.divisions ?? []).reduce(
                                        (sum, division) => sum + (mentionCountMaps.divisionCounts.get(division.id) ?? 0),
                                        0
                                      ),
                                  }}
                                  expanded={expandedArchiveEventIds.has(event.id)}
                                  onToggleExpand={() => toggleArchiveEventExpanded(event.id)}
                                  onOpenGeneral={() => openEventGeneral(event)}
                                  onOpenDivision={(divisionId) => openEventDivision(event, divisionId)}
                                />
                              </StaggeredReveal>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </>
        </SegmentedContentFade>
      ) : null}
        </PickleRefreshScrollView>
        </View>
      </PageLayout>
      <AppBottomSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="Invite"
        subtitle="Share this link on social media or copy it into a message."
      >
        <View style={styles.shareSheetBlock}>
          <Text style={styles.shareSheetLabel}>Invite link</Text>
          <View style={styles.shareLinkRow}>
            <Text style={styles.shareLinkText} numberOfLines={1}>
                {appInviteUrl}
            </Text>
            <Pressable
              onPress={() => {
                void handleCopyInviteToApp()
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.shareCopyButton, pressed && styles.shareCopyButtonPressed]}
            >
              <Feather name="copy" size={18} color={colors.text} />
            </Pressable>
          </View>
          <ActionButton
            label="Share"
            onPress={() => {
              void handleInviteToApp()
            }}
          />
        </View>
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(pendingDirectDelete)}
        onClose={() => setPendingDirectDelete(null)}
        title="Delete this chat?"
        subtitle={
          pendingDirectDelete
            ? `This chat with ${pendingDirectDelete.name} will be removed from your list.`
            : 'This chat will be removed from your list.'
        }
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={deleteDirectThread.isPending ? 'Deleting…' : 'Delete'}
            onCancel={() => setPendingDirectDelete(null)}
            onConfirm={() => {
              if (!pendingDirectDelete) return
              void dismissDirectChat(pendingDirectDelete.threadId)
                .then(() => setPendingDirectDelete(null))
                .catch(() => setPendingDirectDelete(null))
            }}
            confirmLoading={deleteDirectThread.isPending}
          />
        }
      />
    </>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  pageLayout: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  page: {
    flex: 1,
    gap: 0,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    gap: 0,
    paddingBottom: spacing.xxl,
  },
  searchGutter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchFieldWrap: {
    flex: 1,
    minWidth: 0,
  },
  chipsScroller: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexGrow: 0,
  },
  chipsRow: {
    gap: 8,
    paddingRight: spacing.lg,
    alignItems: 'center',
  },
  bodyGutter: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  hintGutter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
  },
  tabContent: {
    paddingBottom: spacing.xxl,
    gap: 0,
  },
  sectionLabel: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filterChip: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipPressed: {
    opacity: 0.88,
  },
  filterChipLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipLabelActive: {
    color: colors.white,
  },
  filterChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  filterChipDotActive: {
    backgroundColor: colors.white,
  },
  eventStack: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  dashedBox: {
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  dashedBoxText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  archiveBlock: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  archiveHeaderText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  createButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createButtonHovered: {
    backgroundColor: colors.brandPrimaryTint,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createButtonPressed: {
    opacity: 0.9,
  },
  createIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimaryTint,
  },
  createButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  shareSheetBlock: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  shareSheetLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  shareLinkRow: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingLeft: spacing.md,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shareLinkText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  shareCopyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareCopyButtonPressed: {
    opacity: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
})
