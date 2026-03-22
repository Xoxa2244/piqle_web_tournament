import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { ChatPreviewCard } from '../../src/components/ChatPreviewCard'
import { EventChatListItemActive, EventChatListItemArchived, type EventChatListEvent } from '../../src/components/EventChatListItem'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ActionButton, EmptyState, LoadingBlock, SearchField, SurfaceCard } from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette, radius, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

type Segment = 'clubs' | 'events'

export default function ChatsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<Segment>('clubs')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [expandedArchiveEventIds, setExpandedArchiveEventIds] = useState<Set<string>>(new Set())

  const clubChatsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, { enabled: isAuthenticated })

  const filteredClubChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clubChatsQuery.data ?? []
    return ((clubChatsQuery.data ?? []) as { id: string; name: string }[]).filter((club) =>
      club.name.toLowerCase().includes(term)
    )
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

  const clubTotal = (clubChatsQuery.data ?? []).length
  const eventTotal = (eventChatsQuery.data ?? []).length

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
    await Promise.all([clubChatsQuery.refetch(), eventChatsQuery.refetch()])
  }, [clubChatsQuery, eventChatsQuery])

  const pullToRefresh = usePullToRefresh(onRefreshChats)

  const showFullChatLoading =
    isAuthenticated &&
    clubChatsQuery.data === undefined &&
    eventChatsQuery.data === undefined &&
    (clubChatsQuery.isLoading || eventChatsQuery.isLoading)

  const noDataAtAll =
    !showFullChatLoading &&
    clubTotal === 0 &&
    eventTotal === 0 &&
    !clubChatsQuery.isError &&
    !eventChatsQuery.isError

  const clubsTabEmpty = segment === 'clubs' && filteredClubChats.length === 0 && !clubChatsQuery.isError
  const eventsTabEmpty = segment === 'events' && filteredEventChats.length === 0 && !eventChatsQuery.isError

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <SurfaceCard tone="hero">
          <Text style={{ color: palette.text, fontWeight: '700', fontSize: 18 }}>Sign in to open chats</Text>
          <Text style={{ marginTop: 8, color: palette.textMuted, lineHeight: 20 }}>
            Club chat, tournament chat, and division chat all use the same backend membership rules as the web app.
          </Text>
        </SurfaceCard>
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </PageLayout>
    )
  }

  return (
    <PageLayout contentStyle={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }} pullToRefresh={pullToRefresh}>
      <View style={styles.searchGutter}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search messages..." />
      </View>

      <View style={styles.segmentWrap}>
        <Pressable
          onPress={() => setSegment('clubs')}
          style={({ pressed }) => [
            styles.segmentBtn,
            segment === 'clubs' && styles.segmentBtnActive,
            pressed && styles.segmentBtnPressed,
          ]}
        >
          <Text style={[styles.segmentLabel, segment === 'clubs' && styles.segmentLabelActive]}>
            Club chats{clubTotal > 0 ? ` (${clubTotal})` : ''}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSegment('events')}
          style={({ pressed }) => [
            styles.segmentBtn,
            segment === 'events' && styles.segmentBtnActive,
            pressed && styles.segmentBtnPressed,
          ]}
        >
          <Text style={[styles.segmentLabel, segment === 'events' && styles.segmentLabelActive]}>
            Event chats{eventTotal > 0 ? ` (${eventTotal})` : ''}
          </Text>
        </Pressable>
      </View>

      {showFullChatLoading ? (
        <View style={styles.bodyGutter}>
          <LoadingBlock label="Loading chats…" />
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
          <EmptyState title="No chats yet" body="Join clubs or register for tournaments to unlock chat access." />
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
              {filteredClubChats.map((club) => (
                <ChatPreviewCard
                  key={`club-${club.id}`}
                  title={club.name}
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
                  activeEventChats.map((event) => (
                    <EventChatListItemActive
                      key={`event-active-${event.id}`}
                      event={event as EventChatListEvent}
                      onOpenGeneral={() => openEventGeneral(event)}
                      onOpenDivision={(divisionId) => openEventDivision(event, divisionId)}
                    />
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
                      color={palette.textMuted}
                      style={{ transform: [{ rotate: archiveOpen ? '90deg' : '0deg' }] }}
                    />
                  </Pressable>

                  {archiveOpen ? (
                    <View style={styles.eventStack}>
                      {archivedEventChats.map((event) => (
                        <EventChatListItemArchived
                          key={`event-arch-${event.id}`}
                          event={event as EventChatListEvent}
                          expanded={expandedArchiveEventIds.has(event.id)}
                          onToggleExpand={() => toggleArchiveEventExpanded(event.id)}
                          onOpenGeneral={() => openEventGeneral(event)}
                          onOpenDivision={(divisionId) => openEventDivision(event, divisionId)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  searchGutter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: palette.secondary,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentBtnPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textMuted,
    textAlign: 'center',
  },
  segmentLabelActive: {
    color: palette.text,
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
    color: palette.textMuted,
  },
  tabContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    color: palette.textMuted,
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
    borderColor: palette.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  dashedBoxText: {
    fontSize: 12,
    color: palette.textMuted,
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
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
})
