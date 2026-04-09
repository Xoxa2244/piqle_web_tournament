import { useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'

import { ChatAttachmentGalleryScreen } from '../../../../src/components/ChatAttachmentGalleryScreen'
import { useMessageThreadRealtimeQueryOptions } from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { useAuth } from '../../../../src/providers/AuthProvider'

export default function ClubChatMediaScreen() {
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const title = params.name ? `${params.name} media` : 'Club chat media'
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const queryOptions = useMessageThreadRealtimeQueryOptions()

  const messagesQuery = trpc.clubChat.list.useQuery(
    { clubId, limit: 200 },
    { enabled: Boolean(clubId) && isAuthenticated, ...queryOptions }
  )

  const messages = useMemo(() => (messagesQuery.data ?? []) as any[], [messagesQuery.data])

  return (
    <ChatAttachmentGalleryScreen
      title={title}
      messages={messages}
      loading={messagesQuery.isLoading}
      error={messagesQuery.error?.message ?? null}
    />
  )
}
