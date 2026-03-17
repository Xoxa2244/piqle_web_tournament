import { useEffect } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

export default function DivisionChatScreen() {
  const params = useLocalSearchParams<{
    divisionId: string
    tournamentId: string
    title?: string
    eventTitle?: string
  }>()

  useEffect(() => {
    if (!params.tournamentId || !params.divisionId) return
    router.replace({
      pathname: '/chats/event/tournament/[tournamentId]',
      params: {
        tournamentId: params.tournamentId,
        title: params.eventTitle || params.title || 'Event chat',
        divisionId: params.divisionId,
      },
    })
  }, [params.tournamentId, params.divisionId, params.eventTitle, params.title])

  return null
}
