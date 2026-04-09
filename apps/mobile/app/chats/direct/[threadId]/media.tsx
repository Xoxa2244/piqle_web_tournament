import { useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'

import { ChatAttachmentGalleryScreen } from '../../../../src/components/ChatAttachmentGalleryScreen'
import { useMessageThreadRealtimeQueryOptions } from '../../../../src/lib/realtimePoll'
import { trpc } from '../../../../src/lib/trpc'
import { useAuth } from '../../../../src/providers/AuthProvider'

export default function DirectChatMediaScreen() {
  const params = useLocalSearchParams<{ threadId: string; title?: string }>()
  const threadId = params.threadId
  const title = params.title || 'Chat media'
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const messageThreadRealtimeQueryOptions = useMessageThreadRealtimeQueryOptions()

  const messagesQuery = trpc.directChat.list.useQuery(
    { threadId, limit: 200 },
    { enabled: Boolean(threadId) && isAuthenticated, ...messageThreadRealtimeQueryOptions }
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
