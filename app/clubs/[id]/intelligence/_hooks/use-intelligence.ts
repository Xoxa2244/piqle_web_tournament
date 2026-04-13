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
  mockSessionsCalendar,
  mockMemberHealth,
  mockCampaignAnalytics,
  mockMemberOutreach,
  mockVariantAnalytics,
  mockSequenceAnalytics,
  mockWeeklySummary,
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
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000, keepPreviousData: true }
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
export function useDashboardV2(clubId: string, dateFrom?: string, dateTo?: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getDashboardV2.useQuery(
    { clubId, dateFrom, dateTo },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000, keepPreviousData: true }
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
export function useSlotFillerRecommendations(sessionId: string | null, limit: number = 15, clubId?: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getSlotFillerRecommendations.useQuery(
    {
      sessionId: sessionId!,
      limit,
      ...(sessionId?.startsWith('csv-') && clubId ? { clubId } : {}),
    },
    { enabled: !!sessionId && !isDemo, staleTime: 2 * 60 * 1000, keepPreviousData: true }
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
    { clubId, inactivityDays, limit: 5000 },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
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
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
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
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
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
      mutate: (input: any, opts?: any) => {
        const count = input?.candidates?.length || 0
        setTimeout(() => opts?.onSuccess?.({ sent: count, failed: 0, csvSkipped: 0, results: [] }), 500)
      },
      isPending: false,
      data: { sent: 3, failed: 0, csvSkipped: 0, results: [] },
    } as any
  }

  return mutation
}

// ── Send event invites (personalized per player) ──
export function useSendEventInvites() {
  const isDemo = useIsDemo()
  const mutation = trpc.intelligence.sendEventInvites.useMutation()

  if (isDemo) {
    return {
      mutate: (input: any, opts?: any) => {
        const count = input?.candidates?.length || 0
        setTimeout(() => opts?.onSuccess?.({ sent: count, failed: 0, csvSkipped: 0, results: [] }), 500)
      },
      isPending: false,
    } as any
  }

  return mutation
}

// ── Sessions Calendar ──
export function useSessionsCalendar(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getSessionsCalendar.useQuery(
    { clubId },
    {
      enabled: !!clubId && !isDemo,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      keepPreviousData: true,
      refetchOnMount: false,       // Don't refetch when navigating back — serve from cache
      refetchOnWindowFocus: false,
    }
  )

  if (isDemo) {
    return {
      data: mockSessionsCalendar(),
      isLoading: false,
      error: null,
    }
  }

  return query
}

// ── Member Health ──
export function useMemberHealth(clubId: string) {
  const isDemo = useIsDemo()

  const query = trpc.intelligence.getMemberHealth.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )

  if (isDemo) {
    return {
      data: mockMemberHealth(),
      isLoading: false,
      error: null,
    }
  }

  return query
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

// ── Send health-based outreach (CHECK_IN / RETENTION_BOOST) ──
export function useSendOutreach() {
  const isDemo = useIsDemo()
  const mutation = trpc.intelligence.sendOutreachMessage.useMutation()

  if (isDemo) {
    return {
      mutate: (_input: any, opts?: any) => {
        setTimeout(() => opts?.onSuccess?.({ sent: 1, failed: 0, skipped: 0, results: [{ channel: 'email', status: 'sent' }] }), 500)
      },
      mutateAsync: async (_input: any) => {
        await new Promise(r => setTimeout(r, 500))
        return { sent: 1, failed: 0, skipped: 0, results: [{ channel: 'email', status: 'sent' }] }
      },
      isPending: false,
    } as any
  }

  return mutation
}

// ── Intelligence Settings ──
export function useIntelligenceSettings(clubId: string) {
  return trpc.intelligence.getIntelligenceSettings.useQuery(
    { clubId },
    { enabled: !!clubId }
  )
}

export function useSaveIntelligenceSettings() {
  return trpc.intelligence.saveIntelligenceSettings.useMutation()
}

// ── Automation Settings (campaign triggers) ──
export function useAutomationSettings(clubId: string) {
  return trpc.intelligence.getAutomationSettings.useQuery(
    { clubId },
    { enabled: !!clubId }
  )
}

export function useSaveAutomationSettings() {
  return trpc.intelligence.saveAutomationSettings.useMutation()
}

// ── Campaign Analytics ──
export function useCampaignAnalytics(clubId: string, days: number = 30) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getCampaignAnalytics.useQuery(
    { clubId, days },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) {
    return { data: mockCampaignAnalytics, isLoading: false, error: null } as any
  }
  return query
}

// ── Member Outreach History ──
export function useMemberOutreachHistory(clubId: string, userId: string | null) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getMemberOutreachHistory.useQuery(
    { clubId, userId: userId! },
    { enabled: !!clubId && !!userId && !isDemo }
  )
  if (isDemo && userId) {
    return { data: mockMemberOutreach, isLoading: false, error: null } as any
  }
  return query
}

// ── Variant Performance Analytics ──
export function useVariantAnalytics(clubId: string, days: number = 30) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getVariantAnalytics.useQuery(
    { clubId, days },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) {
    return { data: mockVariantAnalytics, isLoading: false, error: null } as any
  }
  return query
}

// ── Sequence Chain Analytics ──
export function useSequenceAnalytics(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getSequenceAnalytics.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) {
    return { data: mockSequenceAnalytics, isLoading: false, error: null } as any
  }
  return query
}

// ── Weekly AI Summary ──
export function useWeeklySummary(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getWeeklySummary.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) {
    return {
      data: {
        summary: mockWeeklySummary,
        weekStart: null,
        weekEnd: null,
        generatedAt: new Date().toISOString(),
        modelUsed: 'gpt-4o-mini',
      },
      isLoading: false,
      error: null,
    } as any
  }
  return query
}

export function useGenerateWeeklySummary() {
  const isDemo = useIsDemo()
  const mutation = trpc.intelligence.generateWeeklySummary.useMutation()
  if (isDemo) {
    return {
      mutate: (_input: any, opts?: any) => {
        setTimeout(() => opts?.onSuccess?.({ summary: mockWeeklySummary }), 800)
      },
      isPending: false,
    } as any
  }
  return mutation
}

// ══════ NEW HOOKS (Tier 1 endpoints) ══════

export function useRevenueAnalytics(clubId: string, days = 30) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getRevenueAnalytics.useQuery(
    { clubId, days },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useCampaignList(clubId: string, days = 90) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getCampaignList.useQuery(
    { clubId, days },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useOccupancyHeatmap(clubId: string, days = 90) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getOccupancyHeatmap.useQuery(
    { clubId, days },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useMemberGrowth(clubId: string, months = 6) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getMemberGrowth.useQuery(
    { clubId, months },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useChurnTrend(clubId: string, months = 6) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getChurnTrend.useQuery(
    { clubId, months },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useEventsList(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getEventsList.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useUploadHistory(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getUploadHistory.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function usePricingOpportunities(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getPricingOpportunities.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

export function useRevenueForecast(clubId: string) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getRevenueForecast.useQuery(
    { clubId },
    { enabled: !!clubId && !isDemo, staleTime: 5 * 60 * 1000 }
  )
  if (isDemo) return { data: null, isLoading: false, error: null }
  return query
}

// ── Regenerate Member AI Profiles (fire-and-forget mutation) ──
export function useRegenerateMemberProfiles() {
  return trpc.intelligence.regenerateMemberProfiles.useMutation()
}

// ── Session Interest Requests ──
export function useInterestRequests(clubId: string, status?: string) {
  return trpc.intelligence.getInterestRequests.useQuery(
    { clubId, status },
    { enabled: !!clubId, staleTime: 2 * 60 * 1000 }
  )
}

export function useNotifyInterestedMembers() {
  return trpc.intelligence.notifyInterestedMembers.useMutation()
}

// ── Generate Notify Me Link ──
export function useGenerateNotifyMeLink() {
  return trpc.intelligence.generateNotifyMeLink.useMutation()
}

// ── Member AI Profiles ──
export function useMemberAiProfiles(clubId: string, userIds?: string[], refetchInterval?: number) {
  const isDemo = useIsDemo()
  const query = trpc.intelligence.getMemberAiProfiles.useQuery(
    { clubId, userIds },
    {
      enabled: !!clubId && !isDemo,
      staleTime: 10 * 60 * 1000,
      refetchInterval: refetchInterval ?? false,
    }
  )
  if (isDemo) return { data: undefined as any, isLoading: false, error: null }
  return query
}

// ── Generate Campaign Message (LLM) ──
export function useGenerateCampaignMessage() {
  return trpc.intelligence.generateCampaignMessage.useMutation()
}

// ── Create Campaign (send to members) ──
export function useCreateCampaign() {
  return trpc.intelligence.createCampaign.useMutation()
}

// ── Underfilled Sessions ──
export function useUnderfilledSessions(clubId: string) {
  return trpc.intelligence.getUnderfilledSessions.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 2 * 60 * 1000 }
  )
}

// ── New Members ──
export function useNewMembers(clubId: string, days: number = 14) {
  return trpc.intelligence.getNewMembers.useQuery(
    { clubId, joinedWithinDays: days },
    { enabled: !!clubId, staleTime: 5 * 60 * 1000 }
  )
}

// ══════ AI Agent Dashboard ══════

export function useAgentActivity(clubId: string, days = 7) {
  return trpc.intelligence.getAgentActivity.useQuery(
    { clubId, days },
    { enabled: !!clubId, refetchInterval: 30000 }
  )
}

export function usePendingActions(clubId: string) {
  return trpc.intelligence.getPendingActions.useQuery(
    { clubId },
    { enabled: !!clubId, refetchInterval: 15000 }
  )
}

export function useApproveAction() {
  return trpc.intelligence.approveAction.useMutation()
}

export function useSkipAction() {
  return trpc.intelligence.skipAction.useMutation()
}

export function useSnoozeAction() {
  return trpc.intelligence.snoozeAction.useMutation()
}

export function useExecuteAdvisorAction() {
  return trpc.intelligence.executeAdvisorAction.useMutation()
}

export function useUpdateAdvisorActionState() {
  return trpc.intelligence.updateAdvisorActionState.useMutation()
}
