import { useEffect, useRef } from 'react'

import { trpc } from '../lib/trpc'
import { useAuth } from '../providers/AuthProvider'

/**
 * После входа подгружает основные списки в фоне, чтобы вкладки открывались из кэша,
 * а не с пустым экраном и ожиданием сети.
 */
export function TabDataWarmup() {
  const { token } = useAuth()
  const utils = (trpc as any).useUtils()
  const ranForToken = useRef<string | null>(null)

  useEffect(() => {
    if (!token) {
      ranForToken.current = null
      return
    }
    if (ranForToken.current === token) return
    ranForToken.current = token

    const run = (fn: () => Promise<unknown>) => fn().catch(() => undefined)

    void Promise.all([
      run(() => utils.club.list.fetch(undefined)),
      run(() => utils.user.getProfile.fetch()),
      run(() => utils.club.listMyChatClubs.fetch()),
      run(() => utils.tournamentChat.listMyEventChats.fetch()),
      run(() => utils.public.listBoards.fetch()),
      run(() => utils.tournament.list.fetch()),
    ])
  }, [token, utils])

  return null
}
