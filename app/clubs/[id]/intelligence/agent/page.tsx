'use client'

import { useParams } from 'next/navigation'
import { useBrand } from '@/components/BrandProvider'
import { AgentIQ } from '../_components/iq-pages/AgentIQ'
import {
  useAgentActivity,
  usePendingActions,
  useApproveAction,
  useSkipAction,
  useSnoozeAction,
  useAdvisorDrafts,
  useOpsSessionDrafts,
  usePromoteOpsSessionDraft,
  useIntelligenceSettings,
} from '../_hooks/use-intelligence'

export default function AgentPage() {
  const params = useParams()
  const clubId = params.id as string

  const { data: activity, isLoading: activityLoading } = useAgentActivity(clubId)
  const { data: pending, isLoading: pendingLoading } = usePendingActions(clubId)
  const { data: advisorDrafts, isLoading: draftsLoading } = useAdvisorDrafts(clubId, 16)
  const { data: opsSessionDrafts, isLoading: opsDraftsLoading } = useOpsSessionDrafts(clubId, 24)
  const { data: settings } = useIntelligenceSettings(clubId)
  const approveAction = useApproveAction()
  const skipAction = useSkipAction()
  const snoozeAction = useSnoozeAction()
  const promoteOpsSessionDraft = usePromoteOpsSessionDraft()

  const brand = useBrand()
  if (brand.key === 'iqsport') {
    return (
      <AgentIQ
        clubId={clubId}
        activity={activity}
        pending={pending}
        advisorDrafts={advisorDrafts || []}
        opsSessionDrafts={opsSessionDrafts || []}
        isLoading={activityLoading || pendingLoading || draftsLoading || opsDraftsLoading}
        agentLive={!!(settings?.settings as any)?.agentLive}
        intelligenceSettings={settings?.settings || null}
        approveAction={approveAction}
        skipAction={skipAction}
        snoozeAction={snoozeAction}
        promoteOpsSessionDraft={promoteOpsSessionDraft}
      />
    )
  }

  // Non-IQ brand fallback (not implemented yet)
  return (
    <div className="p-8 text-center text-muted-foreground">
      AI Agent dashboard coming soon.
    </div>
  )
}
