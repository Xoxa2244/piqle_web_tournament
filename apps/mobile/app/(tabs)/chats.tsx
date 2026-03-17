import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'

import { Feather } from '@expo/vector-icons'
import { ChatPreviewCard } from '../../src/components/ChatPreviewCard'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SurfaceCard,
} from '../../src/components/ui'
import { formatDateTime } from '../../src/lib/formatters'
import { trpc } from '../../src/lib/trpc'
import { palette, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ChatsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [search, setSearch] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [expandedArchiveEventIds, setExpandedArchiveEventIds] = useState<Set<string>>(new Set())
  const api = trpc as any

  const clubChatsQuery = api.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
  const eventChatsQuery = api.tournamentChat.listMyEventChats.useQuery(undefined, { enabled: isAuthenticated })

  const filteredClubChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clubChatsQuery.data ?? []
    return ((clubChatsQuery.data ?? []) as any[]).filter((club) => club.name.toLowerCase().includes(term))
  }, [clubChatsQuery.data, search])

  const filteredEventChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return eventChatsQuery.data ?? []

    return ((eventChatsQuery.data ?? []) as any[])
      .map((event) => ({
        ...event,
        divisions: event.divisions.filter((division) => division.name.toLowerCase().includes(term)),
      }))
      .filter((event) => event.title.toLowerCase().includes(term) || event.divisions.length > 0)
  }, [eventChatsQuery.data, search])

  const activeEventChats = useMemo(() => {
    const now = Date.now()
    return (filteredEventChats ?? []).filter((event: any) => {
      const endMs = new Date(event.endDate).getTime()
      return !Number.isFinite(endMs) || endMs >= now
    })
  }, [filteredEventChats])

  const archivedEventChats = useMemo(() => {
    const now = Date.now()
    return (filteredEventChats ?? [])
      .filter((event: any) => {
        const endMs = new Date(event.endDate).getTime()
        return Number.isFinite(endMs) && endMs < now
      })
      .sort((a: any, b: any) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
  }, [filteredEventChats])

  const toggleArchiveEventExpanded = (eventId: string) => {
    setExpandedArchiveEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

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
    <PageLayout contentStyle={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md }}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search messages..." />
      </View>

      {clubChatsQuery.isLoading || eventChatsQuery.isLoading ? <LoadingBlock label="Loading chats…" /> : null}

      {filteredClubChats.length === 0 && filteredEventChats.length === 0 ? (
        <EmptyState title="No chats yet" body="Join clubs or register for tournaments to unlock chat access." />
      ) : null}

      {filteredClubChats.length > 0 ? (
        <View>
          <Text style={styles.sectionLabel}>Club chats</Text>
          {filteredClubChats.map((club) => (
            <ChatPreviewCard
              key={`club-${club.id}`}
              title={club.name}
              subtitle={club.city || club.state || 'Club chat'}
              unreadCount={club.unreadCount}
              onPress={() =>
                router.push({
                  pathname: '/chats/club/[clubId]',
                  params: { clubId: club.id, name: club.name },
                })
              }
            />
          ))}
        </View>
      ) : null}

      {filteredEventChats.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={styles.sectionLabel}>Event chats</Text>
          {activeEventChats.map((event: any) => (
            <ChatPreviewCard
              key={`event-${event.id}`}
              title={event.title}
              subtitle={`${formatDateTime(event.startDate)} · ${event.club?.name || 'Event chat'}`}
              unreadCount={event.unreadCount}
              onPress={() =>
                router.push({
                  pathname: '/chats/event/tournament/[tournamentId]',
                  params: { tournamentId: event.id, title: event.title },
                })
              }
            />
          ))}

          {archivedEventChats.length > 0 ? (
            <View style={{ paddingTop: spacing.sm }}>
              <Pressable
                onPress={() => setArchiveOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.archiveHeader,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.archiveHeaderText}>Archive ({archivedEventChats.length})</Text>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={palette.textMuted}
                  style={{ transform: [{ rotate: archiveOpen ? '90deg' : '0deg' }] }}
                />
              </Pressable>

              {archiveOpen
                ? archivedEventChats.map((event: any) => {
                    const hasDivisions = (event.divisions?.length ?? 0) > 0
                    const isExpanded = expandedArchiveEventIds.has(event.id)
                    return (
                      <View key={`archived-${event.id}`}>
                        <View style={styles.archiveCardWrap}>
                          <ChatPreviewCard
                            title={event.title}
                            subtitle={`${formatDateTime(event.startDate)} · ${event.club?.name || 'Event chat'}`}
                            unreadCount={event.unreadCount}
                            onPress={() =>
                              router.push({
                                pathname: '/chats/event/tournament/[tournamentId]',
                                params: { tournamentId: event.id, title: event.title },
                              })
                            }
                          />
                          {hasDivisions ? (
                            <Pressable
                              onPress={() => toggleArchiveEventExpanded(event.id)}
                              style={styles.archiveChevronBtn}
                              hitSlop={12}
                            >
                              <Feather
                                name="chevron-right"
                                size={18}
                                color={palette.textMuted}
                                style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                        {hasDivisions && isExpanded
                          ? (event.divisions ?? []).map((division: any) => (
                              <ChatPreviewCard
                                key={`archived-${event.id}-div-${division.id}`}
                                title={division.name}
                                subtitle={`${event.title} · ${event.club?.name || 'Division'}`}
                                unreadCount={division.unreadCount}
                                onPress={() =>
                                  router.push({
                                    pathname: '/chats/event/tournament/[tournamentId]',
                                    params: {
                                      tournamentId: event.id,
                                      title: event.title,
                                      divisionId: division.id,
                                    },
                                  })
                                }
                              />
                            ))
                          : null}
                      </View>
                    )
                  })
                : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </PageLayout>
  )
}

const styles = {}

styles.sectionLabel = {
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xs,
  paddingBottom: spacing.xs,
  color: palette.textMuted,
  fontSize: 12,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
}

styles.archiveHeader = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.lg,
}

styles.archiveHeaderText = {
  color: palette.textMuted,
  fontSize: 12,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
}

styles.archiveCardWrap = {
  position: 'relative' as const,
}

styles.archiveChevronBtn = {
  position: 'absolute' as const,
  right: spacing.lg,
  top: 0,
  bottom: 0,
  justifyContent: 'center' as const,
  paddingVertical: 14,
}

