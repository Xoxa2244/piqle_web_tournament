import type { IntegrationAnomalyItem } from './integration-anomalies'

export type DailyOwnershipView = 'team' | 'mine'
export type DailyAdminTodoBucket = 'today' | 'tomorrow' | 'waiting' | 'blocked' | 'recommended'

export interface DailyAdminTodoItem {
  id: string
  title: string
  description: string
  ctaLabel: string
  href: string
  tone: 'default' | 'warn' | 'danger' | 'success'
  count?: string | number | null
  decisionBucket?: string
  decisionMetadata?: Record<string, unknown>
}

export interface DailyAdminTodoSection {
  key: DailyAdminTodoBucket
  label: string
  description: string
  color: string
  items: DailyAdminTodoItem[]
}

interface PendingLifecycleOpportunityLike {
  id: string
  title: string
  description: string
  pendingCount: number
  blockedCount: number
  ctaLabel: string
  advisorPrompt?: string
}

interface MembershipLifecycleCardLike {
  id: string
  title: string
  blockedCount: number
  topReasons: Array<{ label: string; count: number }>
  advisorPrompt: string
}

interface PolicyScenarioLike {
  action: string
  autoGain: number
  stillBlocked: number
}

interface ProgrammingIdeaLike {
  id: string
  primary: {
    title: string
    dayOfWeek: string
    projectedOccupancy: number
  }
}

interface ProgrammingCockpitLike {
  strongest?: ProgrammingIdeaLike | null
}

interface OpsSessionDraftLike {
  id: string
  title: string
  dayOfWeek: string
  status: string
  projectedOccupancy: number
  estimatedInterestedMembers: number
  confidence: number
}

interface OpsSessionDraftStageLike {
  key: string
  drafts: OpsSessionDraftLike[]
}

interface SandboxDraftLike {
  id: string
  title: string
  updatedAt: string | Date
  metadata?: {
    sandboxPreview?: {
      recipientCount?: number | null
    } | null
  } | null
}

interface AutopilotSummaryLike {
  counts: {
    auto: number
    pending: number
    blocked: number
  }
  membershipHeldCount: number
  topBlockedReasons: Array<{ label: string; count: number }>
}

interface OpsEscalationsLike {
  topMineOverdueDraft?: OpsSessionDraftLike | null
  mineOverdueDrafts: OpsSessionDraftLike[]
  topUnassignedOverdueDraft?: OpsSessionDraftLike | null
  unassignedOverdueDrafts: OpsSessionDraftLike[]
  topMineDueSoonDraft?: OpsSessionDraftLike | null
  mineDueSoonDrafts: OpsSessionDraftLike[]
  topNeedsReassignmentDraft?: OpsSessionDraftLike | null
  needsReassignmentDrafts: OpsSessionDraftLike[]
}

interface OpsWorkflowMetaLike {
  ownerLabel?: string | null
}

interface PublishedLiveFeedbackMetaLike {
  summary?: string | null
  status?: string | null
  actualOccupancy?: number | null
}

interface PublishedSignalsLike {
  topAtRiskDraft?: OpsSessionDraftLike | null
  topHealthyDraft?: OpsSessionDraftLike | null
}

interface BuildDailyAdminTodoSectionsArgs<
  TOpsDraft extends OpsSessionDraftLike,
  TScenario extends PolicyScenarioLike,
> {
  clubId: string
  pendingActionsCount: number
  autopilotSummary: AutopilotSummaryLike
  pendingLifecycleOpportunity?: PendingLifecycleOpportunityLike | null
  blockedLifecycleCard?: MembershipLifecycleCardLike | null
  bestScenario?: TScenario | null
  programmingCockpit: ProgrammingCockpitLike
  readyOpsDraft?: TOpsDraft | null
  sessionDraft?: TOpsDraft | null
  newestSandboxDraft?: SandboxDraftLike | null
  opsEscalations: {
    topMineOverdueDraft?: TOpsDraft | null
    mineOverdueDrafts: TOpsDraft[]
    topUnassignedOverdueDraft?: TOpsDraft | null
    unassignedOverdueDrafts: TOpsDraft[]
    topMineDueSoonDraft?: TOpsDraft | null
    mineDueSoonDrafts: TOpsDraft[]
    topNeedsReassignmentDraft?: TOpsDraft | null
    needsReassignmentDrafts: TOpsDraft[]
  }
  publishedSignals: {
    topAtRiskDraft?: TOpsDraft | null
    topHealthyDraft?: TOpsDraft | null
  }
  ownershipView: DailyOwnershipView
  topIntegrationAtRisk?: IntegrationAnomalyItem | null
  topIntegrationWatch?: IntegrationAnomalyItem | null
  buildAgentFocusHref: (options: {
    focus: 'programming-cockpit' | 'ops-board' | 'ops-queue' | 'preview-inbox' | 'pending-queue'
    day?: string
    draftId?: string
    opsDraftId?: string
  }) => string
  buildPublishedSessionRepeatHref: (draft: TOpsDraft) => string
  buildIntegrationTodoItem: (args: {
    anomaly: IntegrationAnomalyItem
    title: string
    description: string
  }) => DailyAdminTodoItem
  getPublishedLiveFeedbackMeta: (draft: TOpsDraft) => PublishedLiveFeedbackMetaLike | null
  getOpsWorkflowMeta: (draft: TOpsDraft) => OpsWorkflowMetaLike | null
  buildAdvisorPolicyPrompt: (scenario: TScenario) => string
  actionLabel: (action: string) => string
}

export function buildDailyAdminTodoSections<
  TOpsDraft extends OpsSessionDraftLike,
  TScenario extends PolicyScenarioLike,
>(args: BuildDailyAdminTodoSectionsArgs<TOpsDraft, TScenario>): DailyAdminTodoSection[] {
  const {
    clubId,
    pendingActionsCount,
    autopilotSummary,
    pendingLifecycleOpportunity,
    blockedLifecycleCard,
    bestScenario,
    programmingCockpit,
    readyOpsDraft,
    sessionDraft,
    newestSandboxDraft,
    opsEscalations,
    publishedSignals,
    ownershipView,
    topIntegrationAtRisk,
    topIntegrationWatch,
    buildAgentFocusHref,
    buildPublishedSessionRepeatHref,
    buildIntegrationTodoItem,
    getPublishedLiveFeedbackMeta,
    getOpsWorkflowMeta,
    buildAdvisorPolicyPrompt,
    actionLabel,
  } = args

  const topPublishedAtRisk = publishedSignals.topAtRiskDraft || null
  const topPublishedHealthy = publishedSignals.topHealthyDraft || null

  return [
    {
      key: 'today',
      label: 'Today',
      description: 'Operational work to clear right now.',
      color: '#10B981',
      items: [
        topIntegrationAtRisk ? buildIntegrationTodoItem({
          anomaly: topIntegrationAtRisk,
          title: 'Stabilize a live integration risk',
          description: `${topIntegrationAtRisk.summary} ${topIntegrationAtRisk.nextBestMove}`.trim(),
        }) : null,
        pendingActionsCount > 0 ? {
          id: 'today-pending',
          title: 'Clear the approval queue',
          description: `${pendingActionsCount} action${pendingActionsCount === 1 ? '' : 's'} are waiting for manual review right now.`,
          ctaLabel: 'Open pending actions',
          href: buildAgentFocusHref({ focus: 'pending-queue' }),
          tone: 'warn',
          count: pendingActionsCount,
        } : null,
        ownershipView === 'mine' && opsEscalations.topMineOverdueDraft ? {
          id: `today-my-overdue-${opsEscalations.topMineOverdueDraft.id}`,
          title: 'One of your ops drafts is overdue',
          description: `${opsEscalations.topMineOverdueDraft.title} is already past due and needs your call before it drifts further.`,
          ctaLabel: 'Open my draft',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: opsEscalations.topMineOverdueDraft.dayOfWeek,
            opsDraftId: opsEscalations.topMineOverdueDraft.id,
          }),
          tone: 'danger',
          count: opsEscalations.mineOverdueDrafts.length,
        } : null,
        ownershipView === 'team' && opsEscalations.topUnassignedOverdueDraft ? {
          id: `today-unassigned-overdue-${opsEscalations.topUnassignedOverdueDraft.id}`,
          title: 'An overdue ops draft still has no owner',
          description: `${opsEscalations.topUnassignedOverdueDraft.title} is overdue and still unassigned, so it is likely to keep slipping.`,
          ctaLabel: 'Claim in ops queue',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: opsEscalations.topUnassignedOverdueDraft.dayOfWeek,
            opsDraftId: opsEscalations.topUnassignedOverdueDraft.id,
          }),
          tone: 'danger',
          count: opsEscalations.unassignedOverdueDrafts.length,
        } : null,
        topPublishedAtRisk ? {
          id: `today-published-risk-${topPublishedAtRisk.id}`,
          title: 'A published session is now trailing plan',
          description: getPublishedLiveFeedbackMeta(topPublishedAtRisk)?.summary
            || `${topPublishedAtRisk.title} is now behind its publish projection and may want a same-week fill check.`,
          ctaLabel: 'Review live feedback',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: topPublishedAtRisk.dayOfWeek,
            opsDraftId: topPublishedAtRisk.id,
          }),
          tone: getPublishedLiveFeedbackMeta(topPublishedAtRisk)?.status === 'at_risk' ? 'danger' : 'warn',
          count: `${getPublishedLiveFeedbackMeta(topPublishedAtRisk)?.actualOccupancy || 0}%`,
        } : null,
        readyOpsDraft ? {
          id: `today-ops-${readyOpsDraft.id}`,
          title: 'Move a ready ops draft forward',
          description: `${readyOpsDraft.title} is ready for scheduling ops review and can be converted into a session draft.`,
          ctaLabel: 'Open ops queue',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: readyOpsDraft.dayOfWeek,
            opsDraftId: readyOpsDraft.id,
          }),
          tone: 'success',
          count: `${readyOpsDraft.projectedOccupancy}%`,
        } : null,
        newestSandboxDraft ? {
          id: `today-sandbox-${newestSandboxDraft.id}`,
          title: 'Review the latest sandbox preview',
          description: `${newestSandboxDraft.title} has a safe preview ready before anything reaches real members.`,
          ctaLabel: 'Open preview inbox',
          href: buildAgentFocusHref({ focus: 'preview-inbox' }),
          tone: 'default',
          count: newestSandboxDraft.metadata?.sandboxPreview?.recipientCount || null,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
    {
      key: 'tomorrow',
      label: 'Tomorrow',
      description: 'The next planning moves the agent wants lined up.',
      color: '#06B6D4',
      items: [
        programmingCockpit.strongest ? {
          id: `tomorrow-programming-${programmingCockpit.strongest.id}`,
          title: 'Pressure-test the strongest programming idea',
          description: `${programmingCockpit.strongest.primary.title} is the strongest next schedule move based on current demand and occupancy.`,
          ctaLabel: 'Open programming cockpit',
          href: buildAgentFocusHref({
            focus: 'programming-cockpit',
            day: programmingCockpit.strongest.primary.dayOfWeek,
            draftId: programmingCockpit.strongest.id,
          }),
          tone: 'default',
          count: `${programmingCockpit.strongest.primary.projectedOccupancy}% fill`,
        } : null,
        sessionDraft ? {
          id: `tomorrow-session-draft-${sessionDraft.id}`,
          title: 'Finish the next internal session draft',
          description: `${sessionDraft.title} is already in session-draft mode and is the cleanest ops handoff for tomorrow.`,
          ctaLabel: 'Open session draft queue',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: sessionDraft.dayOfWeek,
            opsDraftId: sessionDraft.id,
          }),
          tone: 'success',
          count: sessionDraft.estimatedInterestedMembers,
        } : null,
        !topPublishedAtRisk && topPublishedHealthy ? {
          id: `tomorrow-live-winner-${topPublishedHealthy.id}`,
          title: 'Reuse a live winner as the next template',
          description: getPublishedLiveFeedbackMeta(topPublishedHealthy)?.summary
            || `${topPublishedHealthy.title} is tracking well enough to use as a reference for the next programming move.`,
          ctaLabel: 'Plan repeat slot',
          href: buildPublishedSessionRepeatHref(topPublishedHealthy),
          tone: 'success',
          count: `${getPublishedLiveFeedbackMeta(topPublishedHealthy)?.actualOccupancy || 0}%`,
        } : null,
        pendingLifecycleOpportunity && pendingActionsCount === 0 ? {
          id: `tomorrow-lifecycle-${pendingLifecycleOpportunity.id}`,
          title: 'Prepare the next lifecycle push',
          description: pendingLifecycleOpportunity.description,
          ctaLabel: pendingLifecycleOpportunity.ctaLabel,
          href: pendingLifecycleOpportunity.advisorPrompt
            ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(pendingLifecycleOpportunity.advisorPrompt)}`
            : buildAgentFocusHref({ focus: 'pending-queue' }),
          tone: 'default',
          count: pendingLifecycleOpportunity.pendingCount + pendingLifecycleOpportunity.blockedCount,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
    {
      key: 'waiting',
      label: 'Waiting On You',
      description: 'The agent is staged and needs a human decision.',
      color: '#F59E0B',
      items: [
        topIntegrationWatch ? buildIntegrationTodoItem({
          anomaly: topIntegrationWatch,
          title: 'An integration drift wants a same-day call',
          description: `${topIntegrationWatch.summary} ${topIntegrationWatch.nextBestMove}`.trim(),
        }) : null,
        pendingLifecycleOpportunity ? {
          id: `waiting-lifecycle-${pendingLifecycleOpportunity.id}`,
          title: pendingLifecycleOpportunity.title,
          description: pendingLifecycleOpportunity.description,
          ctaLabel: pendingLifecycleOpportunity.ctaLabel,
          href: pendingLifecycleOpportunity.pendingCount > 0
            ? buildAgentFocusHref({ focus: 'pending-queue' })
            : pendingLifecycleOpportunity.advisorPrompt
              ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(pendingLifecycleOpportunity.advisorPrompt)}`
              : buildAgentFocusHref({ focus: 'pending-queue' }),
          tone: 'warn',
          count: pendingLifecycleOpportunity.pendingCount || null,
        } : null,
        ownershipView === 'mine' && opsEscalations.topMineDueSoonDraft ? {
          id: `waiting-my-due-soon-${opsEscalations.topMineDueSoonDraft.id}`,
          title: 'One of your drafts is due soon',
          description: `${opsEscalations.topMineDueSoonDraft.title} is heating up in the next two hours and probably wants a same-day decision.`,
          ctaLabel: 'Open my draft',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: opsEscalations.topMineDueSoonDraft.dayOfWeek,
            opsDraftId: opsEscalations.topMineDueSoonDraft.id,
          }),
          tone: 'warn',
          count: opsEscalations.mineDueSoonDrafts.length,
        } : null,
        readyOpsDraft ? {
          id: `waiting-ready-ops-${readyOpsDraft.id}`,
          title: 'An ops draft is waiting for review',
          description: `${readyOpsDraft.title} is sitting in Ready For Ops until someone converts it into a session draft.`,
          ctaLabel: 'Review ops draft',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: readyOpsDraft.dayOfWeek,
            opsDraftId: readyOpsDraft.id,
          }),
          tone: 'warn',
          count: readyOpsDraft.confidence,
        } : null,
        newestSandboxDraft ? {
          id: `waiting-sandbox-${newestSandboxDraft.id}`,
          title: 'A sandbox run needs sign-off',
          description: `${newestSandboxDraft.title} is staged in preview so routing and audience can be reviewed safely.`,
          ctaLabel: 'Review preview',
          href: buildAgentFocusHref({ focus: 'preview-inbox' }),
          tone: 'warn',
          count: newestSandboxDraft.metadata?.sandboxPreview?.recipientCount || null,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
    {
      key: 'blocked',
      label: 'Blocked',
      description: 'Things the agent still cannot move without a fix.',
      color: '#EF4444',
      items: [
        autopilotSummary.counts.blocked > 0 ? {
          id: 'blocked-autopilot',
          title: 'Autopilot is blocking real volume',
          description: autopilotSummary.topBlockedReasons[0]
            ? `${autopilotSummary.topBlockedReasons[0].label} is the main blocker across recent actions.`
            : `${autopilotSummary.counts.blocked} actions are currently blocked by policy or confidence rules.`,
          ctaLabel: 'Open settings',
          href: `/clubs/${clubId}/intelligence/settings`,
          tone: 'danger',
          count: autopilotSummary.counts.blocked,
        } : null,
        ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft ? {
          id: `blocked-reassign-${opsEscalations.topNeedsReassignmentDraft.id}`,
          title: 'An owned ops draft may need reassignment',
          description: `${opsEscalations.topNeedsReassignmentDraft.title} has been sitting with ${getOpsWorkflowMeta(opsEscalations.topNeedsReassignmentDraft)?.ownerLabel || 'an owner'} for a while without fresh movement.`,
          ctaLabel: 'Check handoff',
          href: buildAgentFocusHref({
            focus: 'ops-queue',
            day: opsEscalations.topNeedsReassignmentDraft.dayOfWeek,
            opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          }),
          tone: 'danger',
          count: opsEscalations.needsReassignmentDrafts.length,
        } : null,
        blockedLifecycleCard && blockedLifecycleCard.blockedCount > 0 ? {
          id: `blocked-lifecycle-${blockedLifecycleCard.id}`,
          title: blockedLifecycleCard.title,
          description: `${blockedLifecycleCard.blockedCount} lifecycle cases are still held back. ${blockedLifecycleCard.topReasons[0]?.label || ''}`.trim(),
          ctaLabel: 'Tune in Advisor',
          href: `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(blockedLifecycleCard.advisorPrompt)}`,
          tone: 'danger',
          count: blockedLifecycleCard.blockedCount,
        } : null,
        autopilotSummary.membershipHeldCount > 0 ? {
          id: 'blocked-membership',
          title: 'Membership rules are holding actions',
          description: 'Weak or unknown membership signals are forcing the agent back into safer review-first paths.',
          ctaLabel: 'Open integrations',
          href: `/clubs/${clubId}/intelligence/integrations`,
          tone: 'danger',
          count: autopilotSummary.membershipHeldCount,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
    {
      key: 'recommended',
      label: 'Recommended Next',
      description: 'The strongest next move if the admin does one thing.',
      color: '#A78BFA',
      items: [
        bestScenario && bestScenario.autoGain > 0 ? {
          id: `recommended-policy-${bestScenario.action}`,
          title: `Consider moving ${actionLabel(bestScenario.action).toLowerCase()} to auto`,
          description: `${bestScenario.autoGain} recent actions would likely move into auto-run while ${bestScenario.stillBlocked} would still stay blocked.`,
          ctaLabel: 'Apply in Advisor',
          href: `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(buildAdvisorPolicyPrompt(bestScenario))}`,
          tone: 'default',
          count: bestScenario.autoGain,
        } : null,
        programmingCockpit.strongest ? {
          id: `recommended-programming-${programmingCockpit.strongest.id}`,
          title: 'Back the strongest schedule idea',
          description: `${programmingCockpit.strongest.primary.title} currently has the best projected fill and demand signal in the club.`,
          ctaLabel: 'Open programming cockpit',
          href: buildAgentFocusHref({
            focus: 'programming-cockpit',
            day: programmingCockpit.strongest.primary.dayOfWeek,
            draftId: programmingCockpit.strongest.id,
          }),
          tone: 'default',
          count: `${programmingCockpit.strongest.primary.projectedOccupancy}%`,
        } : null,
        autopilotSummary.counts.auto === 0 && autopilotSummary.counts.pending > 0 ? {
          id: 'recommended-advisor',
          title: 'Let Advisor reshape the bottleneck',
          description: 'The club is still review-heavy. Advisor can propose the safest next policy move based on recent outcomes.',
          ctaLabel: 'Open Advisor',
          href: `/clubs/${clubId}/intelligence/advisor`,
          tone: 'default',
          count: autopilotSummary.counts.pending,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
  ]
}
