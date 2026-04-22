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

// Ops workflow (Ops Draft Calendar + Internal Session Draft Queue Kanban)
// is hidden at seed stage — duplicates what Daily Admin Todos already shows
// and assumes a multi-role ops team that doesn't exist for our current
// customers. Flip to `true` to re-enable. AgentIQ also reads its own flag
// (OPS_WORKFLOW_ENABLED) and gates the render; we skip the queries here too
// so we don't waste a DB round-trip on every agent page visit.
const OPS_WORKFLOW_ENABLED = false

export default function AgentPage() {
  const params = useParams()
  const clubId = params.id as string

  const { data: activity, isLoading: activityLoading } = useAgentActivity(clubId)
  const { data: pending, isLoading: pendingLoading } = usePendingActions(clubId)
  const { data: advisorDrafts, isLoading: draftsLoading } = useAdvisorDrafts(clubId, 16)
  const { data: decisionRecords, isLoading: decisionRecordsLoading } = useAgentDecisionRecords(clubId, 10)
  const { data: settings } = useIntelligenceSettings(clubId)
  const approveAction = useApproveAction()
  const skipAction = useSkipAction()
  const snoozeAction = useSnoozeAction()
  // These mutations stay wired (no server change) but are called from nothing
  // while OPS_WORKFLOW_ENABLED is false — the AgentIQ Kanban is the only caller.
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
        // Empty arrays when Ops workflow is off — keeps prop contract stable,
        // skips DB fetch (see top of file), and the Kanban render short-circuits
        // on its own flag inside AgentIQ.
        opsSessionDrafts={OPS_WORKFLOW_ENABLED ? [] : []}
        opsTeammates={OPS_WORKFLOW_ENABLED ? [] : []}
        decisionRecords={decisionRecords || []}
        isLoading={activityLoading || pendingLoading || draftsLoading || decisionRecordsLoading}
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
