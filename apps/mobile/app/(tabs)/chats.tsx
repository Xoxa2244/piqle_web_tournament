import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'

import { Feather } from '@expo/vector-icons'
import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { ChatPreviewCard } from '../../src/components/ChatPreviewCard'
import { EventChatListItemActive, EventChatListItemArchived, type EventChatListEvent } from '../../src/components/EventChatListItem'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { StaggeredReveal } from '../../src/components/StaggeredReveal'
import { SegmentedControl } from '../../src/components/SegmentedControl'
import { ActionButton, EmptyState, LoadingBlock, SearchField, SegmentedContentFade } from '../../src/components/ui'
import { realtimeAwareQueryOptions } from '../../src/lib/realtimePoll'
import { trpc } from '../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

type Segment = 'direct' | 'clubs' | 'events'

export default function ChatsTab() {
  const { token, user } = useAuth()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<Segment>('direct')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [expandedArchiveEventIds, setExpandedArchiveEventIds] = useState<Set<string>>(new Set())
  const [revealEpoch, setRevealEpoch] = useState(0)

  const directChatsQuery = trpc.directChat.listMyChats.useQuery(undefined, {
    enabled: isAuthenticated,
    ...realtimeAwareQueryOptions,
  })
  const clubChatsQuery = trpc.club.listMyChatClubs.useQuery(undefined, {
    enabled: isAuthenticated,
    ...realtimeAwareQueryOptions,
  })
  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: isAuthenticated,
    ...realtimeAwareQueryOptions,
  })

  const filteredDirectChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = directChatsQuery.data ?? []
    if (!term) return list
    return list.filter((chat) => {
      const name = String(chat.otherUser?.name ?? '').toLowerCase()
      const city = String(chat.otherUser?.city ?? '').toLowerCase()
      const text = String(chat.lastMessage?.text ?? '').toLowerCase()
      return name.includes(term) || city.includes(term) || text.includes(term)
    })
  }, [directChatsQuery.data, search])

  const filteredClubChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = clubChatsQuery.data ?? []
    if (!term) return list
    return list.filter((club) => club.name.toLowerCase().includes(term))
  }, [clubChatsQuery.data, search])

  const filteredEventChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return eventChatsQuery.data ?? []

    return ((eventChatsQuery.data ?? []) as EventChatListEvent[])
      .map((event) => ({
        ...event,
        divisions: event.divisions.filter((division) => division.name.toLowerCase().includes(term)),
      }))
      .filter((event) => event.title.toLowerCase().includes(term) || event.divisions.length > 0)
  }, [eventChatsQuery.data, search])

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

  const directTotal = (directChatsQuery.data ?? []).length
  const clubTotal = (clubChatsQuery.data ?? []).length
  const eventTotal = (eventChatsQuery.data ?? []).length

  const directSegmentHasUnread = useMemo(() => {
    const list = directChatsQuery.data ?? []
    return list.some((chat) => (chat.unreadCount ?? 0) > 0)
  }, [directChatsQuery.data])

  const clubsSegmentHasUnread = useMemo(() => {
    const list = clubChatsQuery.data ?? []
    return list.some((c: { unreadCount?: number }) => (c.unreadCount ?? 0) > 0)
  }, [clubChatsQuery.data])

  const eventsSegmentHasUnread = useMemo(() => {
    const list = (eventChatsQuery.data ?? []) as EventChatListEvent[]
    return list.some((e) => {
      const divSum = (e.divisions ?? []).reduce((s, d) => s + (d.unreadCount ?? 0), 0)
      return (e.unreadCount ?? 0) + divSum > 0
    })
  }, [eventChatsQuery.data])

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

  const pullToRefresh = usePullToRefresh(onRefreshChats)

  useFocusEffect(
    useCallback(() => {
      setRevealEpoch((v) => v + 1)
    }, [])
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
    <PageLayout scroll={false} contentStyle={styles.pageLayout}>
      <View style={styles.page}>
        <View style={styles.searchGutter}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search messages..." />
        </View>

        <SegmentedControl<Segment>
          options={[
            {
              value: 'direct',
              label: `Chats${directTotal > 0 ? ` (${directTotal})` : ''}`,
              showDot: directSegmentHasUnread,
            },
            {
              value: 'clubs',
              label: `Club chats${clubTotal > 0 ? ` (${clubTotal})` : ''}`,
              showDot: clubsSegmentHasUnread,
            },
            {
              value: 'events',
              label: `Event chats${eventTotal > 0 ? ` (${eventTotal})` : ''}`,
              showDot: eventsSegmentHasUnread,
            },
          ]}
          value={segment}
          onChange={setSegment}
          trackStyle={styles.segmentTrack}
        />

        <SegmentedContentFade activeKey={segment} segmentOrder={['direct', 'clubs', 'events']} opacityOnly style={styles.listScroll}>
          <PickleRefreshScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listScrollContent}
            showsVerticalScrollIndicator={false}
            refreshing={pullToRefresh.refreshing}
            onRefresh={pullToRefresh.onRefresh}
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

      {!showFullChatLoading && !noDataAtAll && segment === 'direct' ? (
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
              <Text style={styles.sectionLabel}>Chats</Text>
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
                    ? `${lastMessagePrefix}${chat.lastMessage.text}`
                    : chat.lastMessage?.isDeleted
                    ? 'Message removed'
                    : chat.otherUser?.city || 'Personal chat'

                return (
                  <StaggeredReveal key={`direct-${chat.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`}>
                    <ChatPreviewCard
                      title={otherUserName}
                      imageUri={chat.otherUser?.image}
                      subtitle={subtitle}
                      unreadCount={chat.unreadCount}
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
                  </StaggeredReveal>
                )
              })}
            </>
          )}
        </View>
      ) : null}

      {!showFullChatLoading && !noDataAtAll && segment === 'clubs' ? (
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
              <Text style={styles.sectionLabel}>Your club chats</Text>
              {filteredClubChats.map((club, index) => (
                <StaggeredReveal key={`club-${club.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`}>
                  <ChatPreviewCard
                    title={club.name}
                    imageUri={club.logoUrl}
                    subtitle={
                      [club.city, club.state].filter(Boolean).join(', ') || 'Club chat'
                    }
                    unreadCount={club.unreadCount}
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

      {!showFullChatLoading && !noDataAtAll && segment === 'events' ? (
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
              <Text style={styles.sectionLabel}>Active</Text>
              <View style={styles.eventStack}>
                {activeEventChats.length > 0 ? (
                  activeEventChats.map((event, index) => (
                    <StaggeredReveal key={`event-active-${event.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}`}>
                      <EventChatListItemActive
                        event={event as EventChatListEvent}
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
                        <StaggeredReveal key={`event-arch-${event.id}`} index={index} triggerKey={`${revealEpoch}-${segment}-${search.trim()}-archive-${archiveOpen ? 1 : 0}`}>
                          <EventChatListItemArchived
                            event={event as EventChatListEvent}
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
          </PickleRefreshScrollView>
        </SegmentedContentFade>
      </View>
    </PageLayout>
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
  segmentTrack: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
})
