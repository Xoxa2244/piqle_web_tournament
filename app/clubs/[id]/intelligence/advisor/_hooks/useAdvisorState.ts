'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'

export type AdvisorState =
  | 'loading'
  | 'onboarding'
  | 'chat_ready'
  | 'file_preview'
  | 'importing'
  | 'import_done'

export type ClubDataStatus = {
  hasData: boolean
  totalEmbeddings: number
  lastImportAt: string | null
  sessionCount: number
  playerCount: number
  sourceFileName: string | null
}

export type AdvisorStateResult = {
  state: AdvisorState
  dataStatus: ClubDataStatus | null
  isLoadingStatus: boolean
  setState: (state: AdvisorState) => void
  refetchStatus: () => void
}

export function useAdvisorState(clubId: string): AdvisorStateResult {
  const [state, setStateInternal] = useState<AdvisorState>('loading')

  const {
    data: dataStatus,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = trpc.intelligence.getClubDataStatus.useQuery(
    { clubId },
    { enabled: !!clubId }
  )

  // Determine initial state when data status loads
  useEffect(() => {
    if (isLoadingStatus) return
    if (!dataStatus) {
      setStateInternal('onboarding')
      return
    }

    if (state === 'loading') {
      setStateInternal(dataStatus.hasData ? 'chat_ready' : 'onboarding')
    }
  }, [dataStatus, isLoadingStatus, state])

  const setState = useCallback((newState: AdvisorState) => {
    setStateInternal(newState)
  }, [])

  return {
    state,
    dataStatus: dataStatus ?? null,
    isLoadingStatus,
    setState,
    refetchStatus: () => { refetchStatus() },
  }
}
