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
  useOpsTeammates,
  useAgentDecisionRecords,
  usePromoteOpsSessionDraft,
  useCreateFillSessionDraftFromSchedule,
  usePrepareOpsSessionDraftPublish,
  usePublishOpsSessionDraftToSchedule,
  useUpdatePublishedOpsSessionDraft,
  useRollbackPublishedOpsSessionDraft,
  useUpdateOpsSessionDraftWorkflow,
  useIntelligenceSettings,
  useShadowBackOutreachRolloutAction,
} from '../_hooks/use-intelligence'

export default function AgentPage() {
  const params = useParams()
  const clubId = params.id as string

  const { data: activity, isLoading: activityLoading } = useAgentActivity(clubId)
  const { data: pending, isLoading: pendingLoading } = usePendingActions(clubId)
  const { data: advisorDrafts, isLoading: draftsLoading } = useAdvisorDrafts(clubId, 16)
  const { data: opsSessionDrafts, isLoading: opsDraftsLoading } = useOpsSessionDrafts(clubId, 24)
  const { data: opsTeammates, isLoading: opsTeammatesLoading } = useOpsTeammates(clubId)
  const { data: decisionRecords, isLoading: decisionRecordsLoading } = useAgentDecisionRecords(clubId, 10)
  const { data: settings } = useIntelligenceSettings(clubId)
  const approveAction = useApproveAction()
  const skipAction = useSkipAction()
  const snoozeAction = useSnoozeAction()
  const promoteOpsSessionDraft = usePromoteOpsSessionDraft()
  const createFillSessionDraftFromSchedule = useCreateFillSessionDraftFromSchedule()
  const prepareOpsSessionDraftPublish = usePrepareOpsSessionDraftPublish()
  const publishOpsSessionDraftToSchedule = usePublishOpsSessionDraftToSchedule()
  const updatePublishedOpsSessionDraft = useUpdatePublishedOpsSessionDraft()
  const rollbackPublishedOpsSessionDraft = useRollbackPublishedOpsSessionDraft()
  const updateOpsSessionDraftWorkflow = useUpdateOpsSessionDraftWorkflow()
  const shadowBackOutreachRolloutAction = useShadowBackOutreachRolloutAction()

  const brand = useBrand()
  if (brand.key === 'iqsport') {
    return (
      <AgentIQ
        clubId={clubId}
        activity={activity}
        pending={pending}
        advisorDrafts={advisorDrafts || []}
        opsSessionDrafts={opsSessionDrafts || []}
        opsTeammates={opsTeammates || []}
        decisionRecords={decisionRecords || []}
        isLoading={activityLoading || pendingLoading || draftsLoading || opsDraftsLoading || opsTeammatesLoading || decisionRecordsLoading}
        agentLive={!!(settings?.settings as any)?.agentLive}
        intelligenceSettings={settings?.settings || null}
        outreachRolloutStatus={(settings as any)?.outreachRolloutStatus || null}
        approveAction={approveAction}
        skipAction={skipAction}
        snoozeAction={snoozeAction}
        promoteOpsSessionDraft={promoteOpsSessionDraft}
        createFillSessionDraftFromSchedule={createFillSessionDraftFromSchedule}
        prepareOpsSessionDraftPublish={prepareOpsSessionDraftPublish}
        publishOpsSessionDraftToSchedule={publishOpsSessionDraftToSchedule}
        updatePublishedOpsSessionDraft={updatePublishedOpsSessionDraft}
        rollbackPublishedOpsSessionDraft={rollbackPublishedOpsSessionDraft}
        updateOpsSessionDraftWorkflow={updateOpsSessionDraftWorkflow}
        shadowBackOutreachRolloutAction={shadowBackOutreachRolloutAction}
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
