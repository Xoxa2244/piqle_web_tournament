'use client'

import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import {
  mockDashboard,
  mockDashboardV2,
  mockSlotFillerRecommendations,
  mockReactivationCandidates,
  mockSessions,
  mockEventRecommendations,
} from '../_data/mock'

// ── Hook: detect demo mode from ?demo=true ──
export function useIsDemo() {
  const searchParams = useSearchParams()
  return searchParams.get('demo') === 'true'
}

// ── Dashboard ──
export function useDashboard(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getDashboard.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo }
  )

  if (isDemo) {
    return {
      data: mockDashboard,
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Dashboard V2 ──
export function useDashboardV2(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getDashboardV2.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo }
  )

  if (isDemo) {
    return {
      data: mockDashboardV2,
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Slot Filler Recommendations ──
export function useSlotFillerRecommendations(sessionId: string | null, limit: number = 15) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getSlotFillerRecommendations.useQuery(
    { sessionId: sessionId!, limit },
    { enabled: !!sessionId && !isDemo }
  )

  if (isDemo && sessionId) {
    return {
      data: mockSlotFillerRecommendations(sessionId),
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Reactivation ──
export function useReactivationCandidates(clubId: string, inactivityDays: number) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getReactivationCandidates.useQuery(
    { clubId, inactivityDays, limit: 20 },
    { enabled: !!clubId && !isDemo }
  )

  if (isDemo) {
    return {
      data: mockReactivationCandidates(inactivityDays),
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Sessions list (for revenue) ──
export function useListSessions(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.listSessions.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo }
  )

  if (isDemo) {
    return {
      data: mockSessions,
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Event Recommendations ──
export function useEventRecommendations(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getEventRecommendations.useQuery(
    { clubId, limit: 5 },
    { enabled: !!clubId && !isDemo }
  )

  if (isDemo) {
    return {
      data: mockEventRecommendations(),
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Send invites (works in demo as fake success) ──
export function useSendInvites() {
  const isDemo = useIsDemo()
  const mutation = trpc.intelligence.sendInvites.useMutation()

  if (isDemo) {
    return {
      mutate: (_input: any, opts?: any) => {
        // Simulate success after brief delay
        setTimeout(() => opts?.onSuccess?.({ invitedCount: 3 }), 500)
      },
      isPending: false,
      data: { invitedCount: 3 },
    } as any
  }

  return mutation
}

// ── Send reactivation messages (email/SMS) ──
export function useSendReactivation() {
  const isDemo = useIsDemo()
  const mutation = trpc.intelligence.sendReactivationMessages.useMutation()

  if (isDemo) {
    return {
      mutate: (_input: any, opts?: any) => {
        setTimeout(() => opts?.onSuccess?.({ sent: 1, failed: 0, results: [{ memberId: 'demo', channel: 'email', status: 'sent' }] }), 500)
      },
      isPending: false,
    } as any
  }

  return mutation
}
