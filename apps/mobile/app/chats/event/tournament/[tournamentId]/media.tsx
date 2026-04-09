import { useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'

import { ChatAttachmentGalleryScreen } from '../../../../../src/components/ChatAttachmentGalleryScreen'
import { useMessageThreadRealtimeQueryOptions } from '../../../../../src/lib/realtimePoll'
import { trpc } from '../../../../../src/lib/trpc'
import { useAuth } from '../../../../../src/providers/AuthProvider'

export default function TournamentChatMediaScreen() {
  const params = useLocalSearchParams<{ tournamentId: string; title?: string; divisionId?: string }>()
  const tournamentId = params.tournamentId
  const divisionId = typeof params.divisionId === 'string' && params.divisionId ? params.divisionId : null
  const title = params.title ? `${params.title} media` : 'Event chat media'
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const queryOptions = useMessageThreadRealtimeQueryOptions()

  const tournamentMessagesQuery = trpc.tournamentChat.listTournament.useQuery(
    { tournamentId, limit: 300 },
    { enabled: Boolean(tournamentId) && isAuthenticated && !divisionId, ...queryOptions }
  )
  const divisionMessagesQuery = trpc.tournamentChat.listDivision.useQuery(
    { divisionId: divisionId || '', limit: 300 },
    { enabled: Boolean(divisionId) && isAuthenticated, ...queryOptions }
  )

  const messages = useMemo(
    () => ((divisionId ? divisionMessagesQuery.data : tournamentMessagesQuery.data) ?? []) as any[],
    [divisionId, divisionMessagesQuery.data, tournamentMessagesQuery.data]
  )
  const loading = divisionId ? divisionMessagesQuery.isLoading : tournamentMessagesQuery.isLoading
  const error = divisionId ? divisionMessagesQuery.error?.message : tournamentMessagesQuery.error?.message

  return (
    <ChatAttachmentGalleryScreen
      title={title}
      messages={messages}
      loading={loading}
      error={error ?? null}
    />
  )
}
