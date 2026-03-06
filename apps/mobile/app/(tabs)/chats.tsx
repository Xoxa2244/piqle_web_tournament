import { Text, View } from 'react-native'
import { router } from 'expo-router'

import { ChatPreviewCard } from '../../src/components/ChatPreviewCard'
import { ActionButton, EmptyState, LoadingBlock, Screen, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { formatDateTime } from '../../src/lib/formatters'
import { trpc } from '../../src/lib/trpc'
import { palette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

export default function ChatsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)

  const clubChatsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, { enabled: isAuthenticated })

  if (!isAuthenticated) {
    return (
      <Screen title="Chats" subtitle="Club and event messages live here once you sign in.">
        <EmptyState
          title="Sign in to open chats"
          body="Club chat, tournament chat, and division chat all use the same backend membership rules as the web app."
        />
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  return (
    <Screen title="Chats" subtitle="One inbox for club chat, event chat, and division-specific threads.">
      {clubChatsQuery.isLoading || eventChatsQuery.isLoading ? <LoadingBlock label="Loading chats…" /> : null}

      {(clubChatsQuery.data?.length ?? 0) === 0 && (eventChatsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="No chats yet" body="Join clubs or register for tournaments to unlock chat access." />
      ) : null}

      {(clubChatsQuery.data?.length ?? 0) > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Club chats" subtitle="Visible when you follow or moderate a club." />
          {clubChatsQuery.data?.map((club) => (
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

      {(eventChatsQuery.data?.length ?? 0) > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Event chats" subtitle="Tournament-wide and division-specific conversations." />
          {eventChatsQuery.data?.map((event) => (
            <SurfaceCard key={event.id}>
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
                <View style={{ marginTop: 12, gap: 8 }}>
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
    </Screen>
  )
}

