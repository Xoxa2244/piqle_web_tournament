import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'

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
    <PageLayout>
      <SurfaceCard tone="soft">
        <SearchField value={search} onChangeText={setSearch} placeholder="Search messages or rooms" />
      </SurfaceCard>

      {clubChatsQuery.isLoading || eventChatsQuery.isLoading ? <LoadingBlock label="Loading chats…" /> : null}

      {filteredClubChats.length === 0 && filteredEventChats.length === 0 ? (
        <EmptyState title="No chats yet" body="Join clubs or register for tournaments to unlock chat access." />
      ) : null}

      {filteredClubChats.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Club chats</Text>
          {filteredClubChats.map((club) => (
            <ChatPreviewCard
              key={club.id}
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
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Event chats</Text>
          {filteredEventChats.map((event) => (
            <SurfaceCard key={event.id} tone="soft">
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
              {event.divisions.length > 0 ? (
                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  <Text style={{ color: palette.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Division threads
                  </Text>
                  {event.divisions.map((division) => (
                    <ChatPreviewCard
                      key={division.id}
                      title={division.name}
                      subtitle={division.permission.isParticipant ? 'Participant access' : 'Admin access'}
                      unreadCount={division.unreadCount}
                      onPress={() =>
                        router.push({
                          pathname: '/chats/event/division/[divisionId]',
                          params: {
                            divisionId: division.id,
                            tournamentId: event.id,
                            title: division.name,
                            eventTitle: event.title,
                          },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </SurfaceCard>
          ))}
        </View>
      ) : null}
    </PageLayout>
  )
}

const styles = {
  sectionTitle: {
    color: palette.text,
    fontWeight: '700' as const,
    fontSize: 18,
  },
}

