'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Loader2, Mail, PauseCircle, PencilLine, Send, Sparkles, Users, XCircle } from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import type { AdvisorAction, AdvisorActionCore } from '@/lib/ai/advisor-actions'
import { getAdvisorActionRuntimeState, type AdvisorActionRuntimeState } from '@/lib/ai/advisor-action-state'
import type { AdvisorOutcomeMemory } from '@/lib/ai/advisor-outcomes'
import { useExecuteAdvisorAction, useUpdateAdvisorActionState } from '../../_hooks/use-intelligence'

type CampaignAction = Extract<AdvisorActionCore, { kind: 'create_campaign' }>
type FillSessionAction = Extract<AdvisorActionCore, { kind: 'fill_session' }>
type ReactivationAction = Extract<AdvisorActionCore, { kind: 'reactivate_members' }>
type TrialFollowUpAction = Extract<AdvisorActionCore, { kind: 'trial_follow_up' }>
type RenewalReactivationAction = Extract<AdvisorActionCore, { kind: 'renewal_reactivation' }>
type MembershipLifecycleAction = TrialFollowUpAction | RenewalReactivationAction
type ContactPolicyAction = Extract<AdvisorActionCore, { kind: 'update_contact_policy' }>
type AutonomyPolicyAction = Extract<AdvisorActionCore, { kind: 'update_autonomy_policy' }>
type SandboxRoutingAction = Extract<AdvisorActionCore, { kind: 'update_sandbox_routing' }>
type CohortAction = Extract<AdvisorActionCore, { kind: 'create_cohort' }>

function getRefinePrompt(action: AdvisorAction) {
  if (action.kind === 'create_campaign') return 'Make this campaign shorter and sharper.'
  if (action.kind === 'fill_session') return 'Use SMS instead and keep only the top 3 players.'
  if (action.kind === 'reactivate_members') return 'Use SMS instead and keep only the top 5 inactive members.'
  if (action.kind === 'trial_follow_up') return 'Use SMS instead and keep only the top 3 trial members.'
  if (action.kind === 'renewal_reactivation') return 'Use SMS instead and keep only the top 5 renewal candidates.'
  if (action.kind === 'update_contact_policy') return 'Tighten these messaging rules a bit.'
  if (action.kind === 'update_autonomy_policy') return 'Make this autopilot policy a bit safer.'
  if (action.kind === 'update_sandbox_routing') return 'Keep sandbox preview only and trim the test recipient list.'
  return 'Narrow this audience a bit.'
}

function buildCampaignSummary(action: CampaignAction, execution: { mode: 'save_draft' | 'send_now' | 'send_later' }) {
  const modeLabel = execution.mode === 'send_now'
    ? 'outreach'
    : execution.mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  return `${action.campaign.channel.toUpperCase()} ${modeLabel} for ${action.audience.count || 0} members`
}

function buildMembershipLifecycleSummary(
  action: MembershipLifecycleAction,
  execution: { mode: 'save_draft' | 'send_now' | 'send_later' },
) {
  const modeLabel = execution.mode === 'send_now'
    ? 'outreach'
    : execution.mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  const flowLabel = action.kind === 'trial_follow_up' ? 'trial follow-up' : 'renewal outreach'
  return `${action.lifecycle.channel.toUpperCase()} ${modeLabel} for ${action.lifecycle.candidateCount || 0} ${flowLabel} members`
}

function buildQuickScheduleOption(hoursFromNow: number, hourOfDay: number, label: string) {
  const scheduled = new Date()
  scheduled.setDate(scheduled.getDate() + hoursFromNow)
  scheduled.setHours(hourOfDay, 0, 0, 0)
  return {
    label,
    scheduledFor: scheduled.toISOString(),
  }
}

function getActionAdaptiveDefaults(action: AdvisorAction) {
  if (action.kind === 'create_campaign') return action.defaultsApplied || null
  if (action.kind === 'fill_session') return action.defaultsApplied || null
  if (action.kind === 'reactivate_members') return action.defaultsApplied || null
  if (action.kind === 'trial_follow_up') return action.defaultsApplied || null
  if (action.kind === 'renewal_reactivation') return action.defaultsApplied || null
  return null
}

function getActionDecisionSummary(action: AdvisorAction) {
  if (action.summary) return action.summary
  return action.title
}

function getActionDecisionHighlights(action: AdvisorAction) {
  if (action.kind === 'create_campaign') {
    return [
      action.campaign.channel === 'both' ? 'Email + SMS' : action.campaign.channel.toUpperCase(),
      action.campaign.execution.mode === 'send_later'
        ? 'Scheduled'
        : action.campaign.execution.mode === 'send_now'
          ? 'Send now'
          : 'Draft',
    ]
  }

  if (action.kind === 'fill_session') {
    return [
      action.outreach.channel === 'both' ? 'Email + SMS' : action.outreach.channel.toUpperCase(),
      `${action.outreach.candidateCount} candidates`,
    ]
  }

  if (action.kind === 'reactivate_members') {
    return [
      action.reactivation.channel === 'both' ? 'Email + SMS' : action.reactivation.channel.toUpperCase(),
      `${action.reactivation.candidateCount} inactive members`,
    ]
  }

  if (action.kind === 'trial_follow_up' || action.kind === 'renewal_reactivation') {
    return [
      action.lifecycle.channel === 'both' ? 'Email + SMS' : action.lifecycle.channel.toUpperCase(),
      action.lifecycle.execution.mode === 'send_later'
        ? 'Scheduled'
        : action.lifecycle.execution.mode === 'send_now'
          ? 'Send now'
          : 'Draft',
    ]
  }

  return []
}

export function AdvisorActionCard({
  clubId,
  messageId,
  action,
  sandboxMode,
  draftStatus,
  actionState,
  persistedOutcome,
  onDraftPrompt,
}: {
  clubId: string
  messageId?: string
  action: AdvisorAction
  sandboxMode?: boolean
  draftStatus?: string | null
  actionState?: AdvisorActionRuntimeState | null
  persistedOutcome?: AdvisorOutcomeMemory | null
  onDraftPrompt?: (prompt: string) => void
}) {
  const { isDark } = useTheme()
  const executeAction = useExecuteAdvisorAction()
  const updateActionState = useUpdateAdvisorActionState()
  const [result, setResult] = useState<any | null>(null)
  const [localActionState, setLocalActionState] = useState<AdvisorActionRuntimeState | null>(actionState || null)
  const [campaignExecutionOverride, setCampaignExecutionOverride] = useState<CampaignAction['campaign']['execution'] | null>(null)
  const [lifecycleExecutionOverride, setLifecycleExecutionOverride] = useState<MembershipLifecycleAction['lifecycle']['execution'] | null>(null)
  const [showScheduleOptions, setShowScheduleOptions] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'requested' | 'recommended'>('requested')
  const recommendation = action.recommendation || null
  const selectedBaseAction = selectedPlan === 'recommended' && recommendation
    ? recommendation.action as AdvisorAction
    : action
  const isCampaign = selectedBaseAction.kind === 'create_campaign'
  const isFillSession = selectedBaseAction.kind === 'fill_session'
  const isReactivation = selectedBaseAction.kind === 'reactivate_members'
  const isTrialFollowUp = selectedBaseAction.kind === 'trial_follow_up'
  const isRenewalReactivation = selectedBaseAction.kind === 'renewal_reactivation'
  const isMembershipLifecycle = isTrialFollowUp || isRenewalReactivation
  const isContactPolicy = selectedBaseAction.kind === 'update_contact_policy'
  const isAutonomyPolicy = selectedBaseAction.kind === 'update_autonomy_policy'
  const isSandboxRouting = selectedBaseAction.kind === 'update_sandbox_routing'
  const baseCampaignAction = isCampaign ? selectedBaseAction as CampaignAction : null
  const baseMembershipLifecycleAction = isMembershipLifecycle ? selectedBaseAction as MembershipLifecycleAction : null

  const currentAction = useMemo<AdvisorAction>(() => {
    if (baseCampaignAction && campaignExecutionOverride) {
      const nextDefaultsApplied = baseCampaignAction.defaultsApplied
        ? { ...baseCampaignAction.defaultsApplied }
        : undefined

      if (nextDefaultsApplied?.scheduledSend) {
        const scheduledChanged = campaignExecutionOverride.mode !== 'send_later'
          || campaignExecutionOverride.scheduledFor !== nextDefaultsApplied.scheduledSend.scheduledFor

        if (scheduledChanged) {
          delete nextDefaultsApplied.scheduledSend
        }
      }

      return {
        ...baseCampaignAction,
        summary: buildCampaignSummary(baseCampaignAction, campaignExecutionOverride),
        campaign: {
          ...baseCampaignAction.campaign,
          execution: campaignExecutionOverride,
        },
        defaultsApplied: nextDefaultsApplied?.channel || nextDefaultsApplied?.scheduledSend
          ? nextDefaultsApplied
          : undefined,
      } as AdvisorAction
    }

    if (baseMembershipLifecycleAction && lifecycleExecutionOverride) {
      const nextDefaultsApplied = baseMembershipLifecycleAction.defaultsApplied
        ? { ...baseMembershipLifecycleAction.defaultsApplied }
        : undefined

      if (nextDefaultsApplied?.scheduledSend) {
        const scheduledChanged = lifecycleExecutionOverride.mode !== 'send_later'
          || lifecycleExecutionOverride.scheduledFor !== nextDefaultsApplied.scheduledSend.scheduledFor

        if (scheduledChanged) {
          delete nextDefaultsApplied.scheduledSend
        }
      }

      return (
        baseMembershipLifecycleAction.kind === 'trial_follow_up'
          ? {
              ...baseMembershipLifecycleAction,
              summary: buildMembershipLifecycleSummary(baseMembershipLifecycleAction, lifecycleExecutionOverride),
              lifecycle: {
                ...baseMembershipLifecycleAction.lifecycle,
                execution: lifecycleExecutionOverride,
              },
              defaultsApplied: nextDefaultsApplied?.channel || nextDefaultsApplied?.scheduledSend
                ? nextDefaultsApplied
                : undefined,
            }
          : {
              ...baseMembershipLifecycleAction,
              summary: buildMembershipLifecycleSummary(baseMembershipLifecycleAction, lifecycleExecutionOverride),
              lifecycle: {
                ...baseMembershipLifecycleAction.lifecycle,
                execution: lifecycleExecutionOverride,
              },
              defaultsApplied: nextDefaultsApplied?.channel || nextDefaultsApplied?.scheduledSend
                ? nextDefaultsApplied
                : undefined,
            }
      ) as AdvisorAction
    }

    return selectedBaseAction
  }, [baseCampaignAction, baseMembershipLifecycleAction, campaignExecutionOverride, lifecycleExecutionOverride, selectedBaseAction])
  const currentCampaignAction = isCampaign ? currentAction as CampaignAction : null
  const currentFillAction = isFillSession ? currentAction as FillSessionAction : null
  const currentReactivationAction = isReactivation ? currentAction as ReactivationAction : null
  const currentMembershipLifecycleAction = isMembershipLifecycle ? currentAction as MembershipLifecycleAction : null
  const currentContactPolicyAction = isContactPolicy ? currentAction as ContactPolicyAction : null
  const currentAutonomyPolicyAction = isAutonomyPolicy ? currentAction as AutonomyPolicyAction : null
  const currentSandboxRoutingAction = isSandboxRouting ? currentAction as SandboxRoutingAction : null
  const currentCohortAction = currentAction.kind === 'create_cohort' ? currentAction as CohortAction : null

  const title = currentAction.title
  const summary = currentAction.summary
  const performanceSignals = currentAction.kind === 'create_campaign'
    ? currentAction.signals
    : currentAction.kind === 'fill_session'
      ? currentAction.signals
      : currentAction.kind === 'reactivate_members'
        ? currentAction.signals
        : currentAction.kind === 'trial_follow_up'
          ? currentAction.signals
          : currentAction.kind === 'renewal_reactivation'
        ? currentAction.signals
        : null
  const defaultsApplied = getActionAdaptiveDefaults(currentAction)

  const quickScheduleOptions = useMemo(() => ([
    buildQuickScheduleOption(1, 9, 'Tomorrow 9 AM'),
    buildQuickScheduleOption(1, 18, 'Tomorrow 6 PM'),
  ]), [])

  const channelLabel = useMemo(() => {
    const channel = isCampaign
      ? currentCampaignAction?.campaign.channel
      : isFillSession
        ? currentFillAction?.outreach.channel
        : isReactivation
          ? currentReactivationAction?.reactivation.channel
          : isMembershipLifecycle
            ? currentMembershipLifecycleAction?.lifecycle.channel
        : null
    if (!channel) return null
    if (channel === 'both') return 'Email + SMS'
    if (channel === 'sms') return 'SMS'
    return 'Email'
  }, [currentCampaignAction, currentFillAction, currentReactivationAction, currentMembershipLifecycleAction, isCampaign, isFillSession, isMembershipLifecycle, isReactivation])

  const deliveryModeLabel = useMemo(() => {
    const execution = currentCampaignAction?.campaign.execution || currentMembershipLifecycleAction?.lifecycle.execution
    if (!execution) return null
    if (execution.mode === 'send_now') return 'Send Now'
    if (execution.mode === 'send_later') return 'Schedule Send'
    return 'Save Draft'
  }, [currentCampaignAction, currentMembershipLifecycleAction])

  const scheduledLabel = useMemo(() => {
    const execution = currentCampaignAction?.campaign.execution || currentMembershipLifecycleAction?.lifecycle.execution
    if (!execution || execution.mode !== 'send_later') return null
    if (!execution.scheduledFor) return null

    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: execution.timeZone || undefined,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: execution.timeZone ? 'short' : undefined,
      }).format(new Date(execution.scheduledFor))
    } catch {
      return execution.scheduledFor
    }
  }, [currentCampaignAction, currentMembershipLifecycleAction])

  const recipientRuleLabels = useMemo(() => {
    if (!currentCampaignAction) return []
    const rules = currentCampaignAction.campaign.execution.recipientRules
    if (!rules) return []

    return [
      rules.requireEmail ? 'Require email' : null,
      rules.requirePhone ? 'Require phone' : null,
      rules.smsOptInOnly ? 'SMS opt-in only' : null,
    ].filter(Boolean) as string[]
  }, [currentCampaignAction])

  const adaptiveDefaultBadges = useMemo(() => {
    if (!defaultsApplied) return []
    return [
      defaultsApplied.channel ? `Agent defaulted ${defaultsApplied.channel.label}` : null,
      defaultsApplied.scheduledSend ? `Agent defaulted ${defaultsApplied.scheduledSend.label}` : null,
    ].filter(Boolean) as string[]
  }, [defaultsApplied])

  const targetCount = currentCohortAction
    ? currentCohortAction.cohort.count ?? 0
    : isCampaign
      ? currentCampaignAction?.audience.count ?? 0
      : isFillSession
        ? currentFillAction?.outreach.candidateCount ?? 0
        : isReactivation
          ? currentReactivationAction?.reactivation.candidateCount ?? 0
          : isMembershipLifecycle
            ? currentMembershipLifecycleAction?.lifecycle.candidateCount ?? 0
          : 0
  const contactGuardrails = isCampaign
    ? currentCampaignAction?.campaign.guardrails
    : isFillSession
      ? currentFillAction?.outreach.guardrails
      : isReactivation
        ? currentReactivationAction?.reactivation.guardrails
        : isMembershipLifecycle
          ? currentMembershipLifecycleAction?.lifecycle.guardrails
        : null
  const recipientRuleExcludedCount = isCampaign && contactGuardrails
    ? Math.max(0, targetCount - contactGuardrails.eligibleCount - contactGuardrails.excludedCount)
    : 0
  const isSandboxPreview = !!result?.sandboxed || draftStatus === 'sandboxed'
  const isDone = !!result?.ok || !!persistedOutcome
  const approvalHelperText = isCampaign
    ? currentCampaignAction?.campaign.execution.mode === 'save_draft'
      ? 'Choose how the platform should handle this draft, then confirm the action.'
      : currentCampaignAction?.campaign.execution.mode === 'send_later'
        ? (sandboxMode ? 'Pick a send time, then run the draft in sandbox preview mode.' : 'Pick a send time, then approve the scheduling decision.')
        : (sandboxMode ? 'Choose the sandbox path first. The platform will prepare a preview and will not message live members yet.' : 'Choose the live send path, or park this draft for later.')
    : isMembershipLifecycle
      ? currentMembershipLifecycleAction?.lifecycle.execution.mode === 'save_draft'
        ? 'Choose how the platform should handle this membership flow, then confirm the action.'
        : currentMembershipLifecycleAction?.lifecycle.execution.mode === 'send_later'
          ? (sandboxMode ? 'Pick a send time, then run the membership flow in sandbox preview mode.' : 'Pick a send time, then approve the scheduling decision.')
          : (sandboxMode ? 'Choose the sandbox path for this membership flow. The platform will prepare a preview and will not message live members yet.' : 'Choose the live send path for this membership flow, or park it for later.')
    : isAutonomyPolicy
      ? 'Review these autopilot changes, then apply, refine, snooze, or decline them.'
      : isSandboxRouting
        ? 'Review the sandbox preview routing, then decide whether to apply or park it.'
      : isContactPolicy
        ? 'Review the messaging guardrails, then decide whether to apply or park them.'
        : isFillSession
          ? (sandboxMode ? 'This session-fill action will run in sandbox only and create a preview inbox entry.' : 'This session-fill action is ready to go. Approve it, refine it, or park it.')
          : isReactivation
            ? (sandboxMode ? 'This reactivation draft will run in sandbox only and create a preview inbox entry.' : 'This reactivation draft is ready. Approve, refine, snooze, or decline it.')
            : 'Review the draft and decide how the agent should proceed.'
  const primaryApproveLabel = isDone
    ? (isSandboxPreview ? 'Preview Ready' : 'Approved')
    : isCampaign
      ? currentCampaignAction?.campaign.execution.mode === 'save_draft'
        ? 'Save Draft'
        : currentCampaignAction?.campaign.execution.mode === 'send_later'
          ? (sandboxMode ? 'Schedule Sandbox' : 'Schedule Send')
          : (sandboxMode ? 'Run Sandbox' : 'Send Now')
      : isMembershipLifecycle
        ? currentMembershipLifecycleAction?.lifecycle.execution.mode === 'save_draft'
          ? 'Save Draft'
          : currentMembershipLifecycleAction?.lifecycle.execution.mode === 'send_later'
            ? (sandboxMode ? 'Schedule Sandbox' : 'Schedule Send')
            : (sandboxMode ? 'Run Sandbox' : 'Send Now')
      : isFillSession
        ? (sandboxMode ? 'Run Sandbox' : 'Send Invites')
      : isReactivation
        ? (sandboxMode ? 'Run Sandbox' : 'Send Reactivation')
      : isAutonomyPolicy
        ? 'Apply Autopilot Rules'
        : isSandboxRouting
          ? 'Apply Sandbox Routing'
        : 'Approve'

  const handleApprove = () => {
    executeAction.mutate(
      { clubId, messageId, action: currentAction },
      {
        onSuccess: (data) => {
          setResult(data)
          setLocalActionState({
            status: 'active',
            updatedAt: new Date().toISOString(),
          })
        },
      }
    )
  }

  const handleRefine = () => {
    onDraftPrompt?.(getRefinePrompt(currentAction))
  }

  const handleSelectPlan = (plan: 'requested' | 'recommended') => {
    setSelectedPlan(plan)
    setCampaignExecutionOverride(null)
    setLifecycleExecutionOverride(null)
    setShowScheduleOptions(false)
  }

  const handleSetExecutionMode = (mode: CampaignAction['campaign']['execution']['mode']) => {
    if (mode === 'send_later') {
      setShowScheduleOptions(true)
      return
    }

    setShowScheduleOptions(false)

    if (baseCampaignAction) {
      setCampaignExecutionOverride({
        ...baseCampaignAction.campaign.execution,
        mode,
        scheduledFor: undefined,
      })
      return
    }

    if (baseMembershipLifecycleAction) {
      setLifecycleExecutionOverride({
        ...baseMembershipLifecycleAction.lifecycle.execution,
        mode,
        scheduledFor: undefined,
      })
    }
  }

  const handlePickSchedule = (scheduledFor: string) => {
    setShowScheduleOptions(false)

    if (baseCampaignAction) {
      setCampaignExecutionOverride({
        ...baseCampaignAction.campaign.execution,
        mode: 'send_later',
        scheduledFor,
        timeZone: baseCampaignAction.campaign.execution.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      return
    }

    if (baseMembershipLifecycleAction) {
      setLifecycleExecutionOverride({
        ...baseMembershipLifecycleAction.lifecycle.execution,
        mode: 'send_later',
        scheduledFor,
        timeZone: baseMembershipLifecycleAction.lifecycle.execution.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    }
  }

  const runtimeState = localActionState || actionState || getAdvisorActionRuntimeState(undefined)
  const isDeclined = runtimeState.status === 'declined'
  const isSnoozed = runtimeState.status === 'snoozed'
  const snoozedLabel = useMemo(() => {
    if (!isSnoozed || !runtimeState.snoozedUntil) return null
    try {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(runtimeState.snoozedUntil))
    } catch {
      return runtimeState.snoozedUntil
    }
  }, [isSnoozed, runtimeState.snoozedUntil])

  const handleDecline = () => {
    if (!messageId) return
    updateActionState.mutate(
      { clubId, messageId, disposition: 'declined' },
      {
        onSuccess: (data) => {
          setLocalActionState({
            status: 'declined',
            updatedAt: new Date().toISOString(),
          })
        },
      },
    )
  }

  const handleSnooze = () => {
    if (!messageId) return
    updateActionState.mutate(
      { clubId, messageId, disposition: 'snoozed', snoozeHours: 24 },
      {
        onSuccess: (data) => {
          setLocalActionState({
            status: 'snoozed',
            snoozedUntil: data.snoozedUntil || undefined,
            updatedAt: new Date().toISOString(),
          })
        },
      },
    )
  }

  if ((isDeclined || isSnoozed) && !isDone) {
    return (
      <div
        className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
        style={{
          background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.08)',
          border: '1px solid rgba(148,163,184,0.16)',
        }}
      >
        <div className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.5 }}>
          {isDeclined
            ? 'Draft declined for this conversation. The agent will stop treating it as the active next step.'
            : `Draft snoozed until ${snoozedLabel || 'later'}. The agent will stop using it until that window ends.`}
        </div>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
          style={{ background: 'var(--subtle)', color: 'var(--t2)', fontWeight: 600 }}
        >
          {isDeclined ? <XCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
          {isDeclined ? 'Declined' : 'Snoozed'}
        </div>
      </div>
    )
  }

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{
        background: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
        border: '1px solid rgba(139,92,246,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: '#A78BFA', fontWeight: 700 }}>
            {action.kind === 'create_cohort'
              ? 'Audience Draft'
              : isCampaign
                ? 'Campaign Draft'
                : isFillSession
                  ? 'Session Fill Draft'
                  : isReactivation
                    ? 'Reactivation Draft'
                    : isTrialFollowUp
                      ? 'Trial Follow-up Draft'
                    : isRenewalReactivation
                      ? 'Renewal Outreach Draft'
                    : isSandboxRouting
                      ? 'Sandbox Routing Draft'
                    : isAutonomyPolicy
                      ? 'Autonomy Policy Draft'
                      : 'Contact Policy Draft'}
          </div>
          <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            {title}
          </div>
          {summary && (
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {summary}
            </p>
          )}
        </div>
        <div
          className="text-[10px] px-2 py-1 rounded-full"
          style={{
            background: isDone
              ? (isSandboxPreview ? 'rgba(244,114,182,0.14)' : 'rgba(16,185,129,0.14)')
              : 'rgba(245,158,11,0.12)',
            color: isDone ? (isSandboxPreview ? '#F9A8D4' : '#10B981') : '#F59E0B',
            fontWeight: 700,
          }}
        >
          {isDone ? (isSandboxPreview ? 'Preview ready' : 'Approved') : 'Needs approval'}
        </div>
      </div>

      {sandboxMode && !isDone && (
        <div
          className="mt-4 rounded-xl px-3 py-2 text-xs"
          style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.16)', color: 'var(--t2)', lineHeight: 1.6 }}
        >
          Live delivery is locked. Approving this draft will create a sandbox preview only, so we can test the full flow without messaging real members.
        </div>
      )}

      {recommendation && (
        <div
          className="rounded-xl p-3 mt-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#A78BFA', fontWeight: 700 }}>
            <Sparkles className="w-3.5 h-3.5" />
            Agent Plan Check
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            Your request is workable. The agent sees a stronger option below and you can choose either path.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div
              className="rounded-xl p-3"
              style={{
                background: selectedPlan === 'requested' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                border: selectedPlan === 'requested' ? '1px solid rgba(148,163,184,0.22)' : '1px solid transparent',
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--t3)', fontWeight: 700 }}>
                Your Request
              </div>
              <div className="text-sm mt-2" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                {getActionDecisionSummary(action)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {getActionDecisionHighlights(action).map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="rounded-xl p-3"
              style={{
                background: selectedPlan === 'recommended' ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.05)',
                border: '1px solid rgba(16,185,129,0.18)',
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: '#10B981', fontWeight: 700 }}>
                Agent Recommendation
              </div>
              <div className="text-sm mt-2" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                {recommendation.title}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                {recommendation.summary || getActionDecisionSummary(recommendation.action as AdvisorAction)}
              </p>
              {recommendation.highlights.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {recommendation.highlights.map((label: string) => (
                    <span
                      key={label}
                      className="text-[11px] px-2 py-1 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 space-y-2">
                {recommendation.why.map((reason: string) => (
                  <p key={reason} className="text-xs" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                    {reason}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => handleSelectPlan('recommended')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{
                background: selectedPlan === 'recommended' ? 'linear-gradient(135deg, rgba(16,185,129,0.24), rgba(6,182,212,0.18))' : 'rgba(16,185,129,0.08)',
                border: selectedPlan === 'recommended' ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(16,185,129,0.18)',
                color: selectedPlan === 'recommended' ? 'var(--heading)' : '#10B981',
                fontWeight: 700,
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedPlan === 'recommended' ? 'Using Agent Plan' : 'Use Agent Plan'}
            </button>
            <button
              type="button"
              onClick={() => handleSelectPlan('requested')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{
                background: selectedPlan === 'requested' ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '1px solid var(--card-border)',
                color: selectedPlan === 'requested' ? 'var(--heading)' : 'var(--t3)',
                fontWeight: 600,
              }}
            >
              {selectedPlan === 'requested' ? 'Keeping My Version' : 'Keep My Version'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              {isFillSession ? <CalendarDays className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {isFillSession ? 'Session' : isContactPolicy || isAutonomyPolicy || isSandboxRouting ? 'Policy' : isMembershipLifecycle ? 'Member Flow' : 'Audience'}
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {currentCohortAction
                ? currentCohortAction.cohort.name
                : isCampaign
                  ? currentCampaignAction?.audience.name
                  : isFillSession
                    ? currentFillAction?.session.title
                    : isReactivation
                      ? currentReactivationAction?.reactivation.segmentLabel
                      : isMembershipLifecycle
                        ? currentMembershipLifecycleAction?.lifecycle.label
                      : isAutonomyPolicy
                        ? 'Club autopilot rules'
                      : isSandboxRouting
                        ? 'Sandbox preview routing'
                      : 'Club messaging guardrails'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {isFillSession
                ? `${currentFillAction?.session.date} · ${currentFillAction?.session.startTime}${currentFillAction?.session.endTime ? `-${currentFillAction.session.endTime}` : ''}`
                : isReactivation
                  ? `${targetCount} inactive member${targetCount === 1 ? '' : 's'}`
                  : isMembershipLifecycle
                    ? `${targetCount} lifecycle candidate${targetCount === 1 ? '' : 's'}`
                  : isContactPolicy
                    ? currentContactPolicyAction?.policy.timeZone
                    : isAutonomyPolicy
                      ? `${currentAutonomyPolicyAction?.policy.changes.length} pending change${currentAutonomyPolicyAction?.policy.changes.length === 1 ? '' : 's'}`
                    : isSandboxRouting
                      ? `${currentSandboxRoutingAction?.policy.changes.length} pending change${currentSandboxRoutingAction?.policy.changes.length === 1 ? '' : 's'}`
                    : `${targetCount} matching member${targetCount === 1 ? '' : 's'}`}
            </div>
            {isFillSession ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {currentFillAction?.session.court ? `${currentFillAction.session.court} · ` : ''}
                {currentFillAction?.session.format || 'Session'} · {currentFillAction?.session.spotsRemaining} spot{currentFillAction?.session.spotsRemaining === 1 ? '' : 's'} left
              </p>
            ) : isReactivation ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                Inactive for at least {currentReactivationAction?.reactivation.inactivityDays} days
              </p>
            ) : isMembershipLifecycle ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {currentMembershipLifecycleAction?.kind === 'trial_follow_up'
                  ? 'Recent trial members who still need a first confirmed booking'
                  : 'Recently active members whose membership now needs renewal outreach'}
              </p>
            ) : isContactPolicy ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                Quiet hours {currentContactPolicyAction?.policy.quietHours.startHour}:00-{currentContactPolicyAction?.policy.quietHours.endHour}:00
              </p>
            ) : isAutonomyPolicy ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                Welcome {currentAutonomyPolicyAction?.policy.welcome.mode} · Slot filler {currentAutonomyPolicyAction?.policy.slotFiller.mode} · Reactivation {currentAutonomyPolicyAction?.policy.reactivation.mode} · Trial {currentAutonomyPolicyAction?.policy.trialFollowUp.mode} · Renewal {currentAutonomyPolicyAction?.policy.renewalReactivation.mode}
              </p>
            ) : isSandboxRouting ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {currentSandboxRoutingAction?.policy.mode === 'preview_only'
                  ? 'Live delivery stays locked and sandbox runs only create preview inbox entries.'
                  : `Sandbox runs route to ${currentSandboxRoutingAction?.policy.emailRecipients.length || 0} email test and ${currentSandboxRoutingAction?.policy.smsRecipients.length || 0} SMS test recipients.`}
              </p>
            ) : (
              (currentCohortAction ? currentCohortAction.cohort.description : currentCampaignAction?.audience.description) && (
                <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                  {currentCohortAction ? currentCohortAction.cohort.description : currentCampaignAction?.audience.description}
                </p>
              )
            )}
          </div>

        {isCampaign ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              Campaign
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {currentCampaignAction?.campaign.type.replace(/_/g, ' ')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {deliveryModeLabel}
            </div>
            {contactGuardrails && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {contactGuardrails.eligibleCount} eligible now · {recipientRuleExcludedCount + contactGuardrails.excludedCount} excluded
              </div>
            )}
            {scheduledLabel && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {scheduledLabel}
              </div>
            )}
            {currentCampaignAction?.campaign.subject && (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--heading)' }}>Subject:</strong> {currentCampaignAction?.campaign.subject}
              </p>
            )}
            {recipientRuleLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {recipientRuleLabels.map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            {adaptiveDefaultBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {adaptiveDefaultBadges.map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : isMembershipLifecycle ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              {isTrialFollowUp ? 'Trial Follow-up' : 'Renewal Outreach'}
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {deliveryModeLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {currentMembershipLifecycleAction?.lifecycle.candidateCount} candidate{currentMembershipLifecycleAction?.lifecycle.candidateCount === 1 ? '' : 's'}
            </div>
            {contactGuardrails && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {contactGuardrails.eligibleCount} eligible now · {contactGuardrails.excludedCount} excluded
              </div>
            )}
            {scheduledLabel && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {scheduledLabel}
              </div>
            )}
            {currentMembershipLifecycleAction?.lifecycle.subject && (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--heading)' }}>Subject:</strong> {currentMembershipLifecycleAction.lifecycle.subject}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {currentMembershipLifecycleAction?.lifecycle.candidates.slice(0, 4).map((candidate: MembershipLifecycleAction['lifecycle']['candidates'][number]) => (
                <span
                  key={candidate.memberId}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {candidate.name} · {candidate.membershipStatus}
                </span>
              ))}
            </div>
            {currentMembershipLifecycleAction?.lifecycle.candidates[0]?.topReason && (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {currentMembershipLifecycleAction.lifecycle.candidates[0].topReason}
              </p>
            )}
            {adaptiveDefaultBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {adaptiveDefaultBadges.map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : isFillSession ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              Outreach
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {currentFillAction?.outreach.candidateCount} matched player{currentFillAction?.outreach.candidateCount === 1 ? '' : 's'}
            </div>
            {contactGuardrails && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {contactGuardrails.eligibleCount} eligible now · {contactGuardrails.excludedCount} excluded
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {currentFillAction?.outreach.candidates.slice(0, 4).map((candidate: FillSessionAction['outreach']['candidates'][number]) => (
                <span
                  key={candidate.memberId}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {candidate.name} · {candidate.score}
                </span>
              ))}
            </div>
            {adaptiveDefaultBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {adaptiveDefaultBadges.map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : isReactivation ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              Reactivation
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {currentReactivationAction?.reactivation.candidateCount} inactive member{currentReactivationAction?.reactivation.candidateCount === 1 ? '' : 's'}
            </div>
            {contactGuardrails && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {contactGuardrails.eligibleCount} eligible now · {contactGuardrails.excludedCount} excluded
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {currentReactivationAction?.reactivation.candidates.slice(0, 4).map((candidate: ReactivationAction['reactivation']['candidates'][number]) => (
                <span
                  key={candidate.memberId}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {candidate.name} · {candidate.daysSinceLastActivity}d
                </span>
              ))}
            </div>
            {currentReactivationAction?.reactivation.candidates[0]?.topReason && (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {currentReactivationAction?.reactivation.candidates[0].topReason}
              </p>
            )}
            {adaptiveDefaultBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {adaptiveDefaultBadges.map((label: string) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : isContactPolicy ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Guardrails
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {currentContactPolicyAction?.policy.max24h}/day · {currentContactPolicyAction?.policy.max7d}/week
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {currentContactPolicyAction?.policy.cooldownHours}h cooldown · {currentContactPolicyAction?.policy.recentBookingLookbackDays}d recent booking window
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentContactPolicyAction?.policy.changes.slice(0, 4).map((change: string) => (
                <span
                  key={change}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {change}
                </span>
              ))}
            </div>
          </div>
        ) : isAutonomyPolicy ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Autopilot Rules
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              Welcome {currentAutonomyPolicyAction?.policy.welcome.mode} · Slot filler {currentAutonomyPolicyAction?.policy.slotFiller.mode}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              Check-in {currentAutonomyPolicyAction?.policy.checkIn.mode} · Retention {currentAutonomyPolicyAction?.policy.retentionBoost.mode} · Reactivation {currentAutonomyPolicyAction?.policy.reactivation.mode}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              Trial follow-up {currentAutonomyPolicyAction?.policy.trialFollowUp.mode} · Renewal outreach {currentAutonomyPolicyAction?.policy.renewalReactivation.mode}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentAutonomyPolicyAction?.policy.changes.slice(0, 5).map((change: string) => (
                <span
                  key={change}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {change}
                </span>
              ))}
            </div>
          </div>
        ) : isSandboxRouting ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sandbox Routing
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {currentSandboxRoutingAction?.policy.mode === 'preview_only' ? 'Preview only' : 'Test recipients'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {currentSandboxRoutingAction?.policy.emailRecipients.length || 0} email test recipient{currentSandboxRoutingAction?.policy.emailRecipients.length === 1 ? '' : 's'} · {currentSandboxRoutingAction?.policy.smsRecipients.length || 0} SMS test recipient{currentSandboxRoutingAction?.policy.smsRecipients.length === 1 ? '' : 's'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentSandboxRoutingAction?.policy.changes.slice(0, 5).map((change: string) => (
                <span
                  key={change}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {change}
                </span>
              ))}
            </div>
            {(currentSandboxRoutingAction?.policy.emailRecipients.length || 0) > 0 && (
              <div className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                Email test: {currentSandboxRoutingAction?.policy.emailRecipients.join(', ')}
              </div>
            )}
            {(currentSandboxRoutingAction?.policy.smsRecipients.length || 0) > 0 && (
              <div className="text-xs mt-1" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                SMS test: {currentSandboxRoutingAction?.policy.smsRecipients.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Filters
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentCohortAction?.cohort.filters.slice(0, 4).map((filter: CohortAction['cohort']['filters'][number], index: number) => (
                <span
                  key={`${filter.field}-${index}`}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {filter.field} {filter.op} {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {defaultsApplied && (
        <div
          className="rounded-xl p-3 mt-3"
          style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#06B6D4', fontWeight: 700 }}>
            Agent Defaults Applied
          </div>
          <div className="mt-2 space-y-2">
            {defaultsApplied.channel && (
              <div className="text-xs" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                <span style={{ color: 'var(--heading)', fontWeight: 600 }}>Channel:</span> {defaultsApplied.channel.label}. {defaultsApplied.channel.reason}
              </div>
            )}
            {defaultsApplied.scheduledSend && (
              <div className="text-xs" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                <span style={{ color: 'var(--heading)', fontWeight: 600 }}>Send time:</span> {defaultsApplied.scheduledSend.label}. {defaultsApplied.scheduledSend.reason}
              </div>
            )}
          </div>
        </div>
      )}

      {performanceSignals && (
        <div
          className="rounded-xl p-3 mt-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#10B981', fontWeight: 700 }}>
            Why this is recommended
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--heading)', lineHeight: 1.6, fontWeight: 600 }}>
            {performanceSignals.headline}
          </div>
          {performanceSignals.bullets.length > 0 && (
            <div className="mt-2 space-y-2">
              {performanceSignals.bullets.map((bullet: string) => (
                <p key={bullet} className="text-xs" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                  {bullet}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {(isCampaign || isFillSession || isReactivation || isMembershipLifecycle || isContactPolicy || isAutonomyPolicy || isSandboxRouting) && (
        <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
            <Send className="w-3.5 h-3.5" />
            {isContactPolicy || isAutonomyPolicy || isSandboxRouting ? 'Policy Preview' : 'Message Preview'}
          </div>
          <div className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            {isCampaign
              ? currentCampaignAction?.campaign.body
              : isFillSession
                ? currentFillAction?.outreach.message
                : isReactivation
                ? currentReactivationAction?.reactivation.message
                : isMembershipLifecycle
                  ? currentMembershipLifecycleAction?.lifecycle.message
                  : (currentContactPolicyAction?.policy.changes || currentAutonomyPolicyAction?.policy.changes || currentSandboxRoutingAction?.policy.changes || []).join('\n')}
          </div>
        </div>
      )}

      {contactGuardrails && (contactGuardrails.excludedCount > 0 || contactGuardrails.warnings.length > 0 || recipientRuleExcludedCount > 0) && (
        <div className="rounded-xl p-3 mt-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: '#F59E0B', fontWeight: 700 }}>
            Contact Guardrails
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            Eligible now: {contactGuardrails.eligibleCount}. Excluded by guardrails: {contactGuardrails.excludedCount}.
          </div>
          {recipientRuleExcludedCount > 0 && (
            <div className="text-xs mt-2" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
              Excluded by recipient rules: {recipientRuleExcludedCount}.
            </div>
          )}
          {contactGuardrails.deliveryBreakdown && (
            <div className="text-xs mt-2" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
              Delivery mix: {contactGuardrails.deliveryBreakdown.email} email, {contactGuardrails.deliveryBreakdown.sms} SMS, {contactGuardrails.deliveryBreakdown.both} email+SMS.
            </div>
          )}
          {contactGuardrails.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {contactGuardrails.reasons.map((reason: NonNullable<typeof contactGuardrails>['reasons'][number]) => (
                <span
                  key={reason.code}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}
                >
                  {reason.count} {reason.label}
                </span>
              ))}
            </div>
          )}
          {contactGuardrails.warnings.length > 0 && (
            <div className="mt-2 space-y-2">
              {contactGuardrails.warnings.map((warning: string) => (
                <p key={warning} className="text-xs" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!isDone ? (
        <div className="rounded-xl p-3 mt-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 700 }}>
            <Send className="w-3.5 h-3.5" />
            Decision Rail
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            {approvalHelperText}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {channelLabel && (
              <span
                className="text-[11px] px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
              >
                {channelLabel}
              </span>
            )}
            {deliveryModeLabel && (
              <span
                className="text-[11px] px-2 py-1 rounded-full"
                style={{ background: 'rgba(139,92,246,0.14)', color: '#C4B5FD' }}
              >
                {deliveryModeLabel}
              </span>
            )}
            {scheduledLabel && (
              <span
                className="text-[11px] px-2 py-1 rounded-full"
                style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
              >
                {scheduledLabel}
              </span>
            )}
            {adaptiveDefaultBadges.map((label: string) => (
              <span
                key={label}
                className="text-[11px] px-2 py-1 rounded-full"
                style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}
              >
                {label}
              </span>
            ))}
          </div>

          {(isCampaign || isMembershipLifecycle) && (
            <div className="mt-4">
              <div className="text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                Execution Path
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {([
                  { key: 'save_draft', label: 'Save Draft' },
                  { key: 'send_now', label: 'Send Now' },
                  { key: 'send_later', label: 'Schedule' },
                ] as const).map((option) => {
                  const isActive = (currentCampaignAction?.campaign.execution.mode || currentMembershipLifecycleAction?.lifecycle.execution.mode) === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleSetExecutionMode(option.key)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                      style={{
                        background: isActive ? 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(6,182,212,0.16))' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(139,92,246,0.28)' : '1px solid var(--card-border)',
                        color: isActive ? 'var(--heading)' : 'var(--t2)',
                        fontWeight: 600,
                      }}
                    >
                      {option.key === 'send_later' ? <CalendarDays className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {option.label}
                    </button>
                  )
                })}
              </div>

              {(showScheduleOptions || currentCampaignAction?.campaign.execution.mode === 'send_later' || currentMembershipLifecycleAction?.lifecycle.execution.mode === 'send_later') && (
                <div className="mt-3">
                  <div className="text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                    Pick a send time
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {quickScheduleOptions.map((option) => {
                      const isActive =
                        (currentCampaignAction?.campaign.execution.mode === 'send_later' && currentCampaignAction?.campaign.execution.scheduledFor === option.scheduledFor) ||
                        (currentMembershipLifecycleAction?.lifecycle.execution.mode === 'send_later' && currentMembershipLifecycleAction?.lifecycle.execution.scheduledFor === option.scheduledFor)
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => handlePickSchedule(option.scheduledFor)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                          style={{
                            background: isActive ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.04)',
                            border: isActive ? '1px solid rgba(6,182,212,0.28)' : '1px solid var(--card-border)',
                            color: isActive ? 'var(--heading)' : 'var(--t2)',
                            fontWeight: 600,
                          }}
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                          {option.label}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => onDraftPrompt?.(
                        isCampaign
                          ? 'Schedule this campaign for Friday at 9am.'
                          : isTrialFollowUp
                            ? 'Schedule this trial follow-up for Friday at 9am.'
                            : 'Schedule this renewal outreach for Friday at 9am.',
                      )}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--card-border)',
                        color: 'var(--t3)',
                        fontWeight: 600,
                      }}
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                      Custom Time
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
              <div className="text-[11px]" style={{ color: 'var(--t3)', fontWeight: 600 }}>
                Final Decision
              </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={handleApprove}
                disabled={executeAction.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
                  fontWeight: 600,
                  opacity: executeAction.isPending ? 0.75 : 1,
                }}
              >
                {executeAction.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {primaryApproveLabel}
              </button>
              <button
                type="button"
                onClick={handleRefine}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: 'var(--subtle)',
                  color: 'var(--t2)',
                  border: '1px solid var(--card-border)',
                  fontWeight: 600,
                }}
              >
                <PencilLine className="w-3.5 h-3.5" />
                Refine
              </button>
              <button
                type="button"
                onClick={handleSnooze}
                disabled={!messageId || updateActionState.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: 'transparent',
                  color: 'var(--t3)',
                  border: '1px solid var(--card-border)',
                  fontWeight: 600,
                  opacity: !messageId ? 0.55 : 1,
                }}
              >
                <PauseCircle className="w-3.5 h-3.5" />
                Snooze 24h
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={!messageId || updateActionState.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: 'transparent',
                  color: '#F87171',
                  border: '1px solid rgba(248,113,113,0.25)',
                  fontWeight: 600,
                  opacity: !messageId ? 0.55 : 1,
                }}
              >
                <XCircle className="w-3.5 h-3.5" />
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
            {result
              ? result.kind === 'create_cohort'
              ? `Audience created: ${result.name} (${result.memberCount} members)`
              : result.kind === 'update_contact_policy'
                ? `Contact policy updated${result.changedFields?.length ? `: ${result.changedFields.length} changes applied` : ''}`
              : result.kind === 'update_autonomy_policy'
                ? `Autonomy policy updated${result.changedFields?.length ? `: ${result.changedFields.length} changes applied` : ''}`
              : result.kind === 'update_sandbox_routing'
                ? `Sandbox routing updated${result.changedFields?.length ? `: ${result.changedFields.length} changes applied` : ''}`
              : result.kind === 'fill_session'
                ? result.sandboxed
                  ? `Sandbox preview ready for ${result.sessionTitle}: ${result.previewRecipientCount} eligible recipients${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
                  : `Invites sent for ${result.sessionTitle} to ${result.sent} recipients${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
              : result.kind === 'reactivate_members'
                ? result.sandboxed
                  ? `Sandbox preview ready for ${result.previewRecipientCount} reactivation recipients${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
                  : `Reactivation sent to ${result.sent} members${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
              : result.kind === 'trial_follow_up'
                ? result.savedAsDraft
                  ? `Trial follow-up draft saved for ${result.memberCount} eligible members${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                  : result.sandboxed
                    ? `Sandbox preview ready for ${result.previewRecipientCount} trial members${result.scheduledLabel ? ` at ${result.scheduledLabel}` : ''}${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                  : result.deliveryMode === 'send_later'
                    ? `Trial follow-up scheduled for ${result.scheduledLabel || scheduledLabel || 'later'} with ${result.memberCount} eligible members${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                    : `Trial follow-up sent to ${result.sent} members${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
              : result.kind === 'renewal_reactivation'
                ? result.savedAsDraft
                  ? `Renewal outreach draft saved for ${result.memberCount} eligible members${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                  : result.sandboxed
                    ? `Sandbox preview ready for ${result.previewRecipientCount} renewal recipients${result.scheduledLabel ? ` at ${result.scheduledLabel}` : ''}${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                  : result.deliveryMode === 'send_later'
                    ? `Renewal outreach scheduled for ${result.scheduledLabel || scheduledLabel || 'later'} with ${result.memberCount} eligible members${result.guardrails?.excludedCount ? `, ${result.guardrails.excludedCount} excluded by guardrails` : ''}`
                    : `Renewal outreach sent to ${result.sent} members${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped by guardrails` : ''}`
              : result.savedAsDraft
                ? `Draft saved for ${result.memberCount} eligible members${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}${result.excludedByGuardrails ? `, ${result.excludedByGuardrails} excluded by guardrails` : ''}`
                : result.sandboxed
                  ? `Sandbox preview ready for ${result.previewRecipientCount} campaign recipients${result.scheduledLabel ? ` at ${result.scheduledLabel}` : ''}${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}${result.excludedByGuardrails ? `, ${result.excludedByGuardrails} excluded by guardrails` : ''}`
                : result.deliveryMode === 'send_later'
                  ? `Campaign scheduled for ${result.scheduledLabel || scheduledLabel || 'later'} with ${result.memberCount} eligible members${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}${result.excludedByGuardrails ? `, ${result.excludedByGuardrails} excluded by guardrails` : ''}`
                : `Campaign sent to ${result.sent} members${result.emailSent ? `, ${result.emailSent} email` : ''}${result.smsSent ? `, ${result.smsSent} SMS` : ''}${result.failed ? `, ${result.failed} failed` : ''}${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}${result.excludedByGuardrails ? `, ${result.excludedByGuardrails} skipped by guardrails` : ''}`
              : persistedOutcome?.summary || 'Approved'}
          </div>
          <div
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: isSandboxPreview ? 'rgba(244,114,182,0.14)' : 'rgba(16,185,129,0.14)',
              color: isSandboxPreview ? '#F9A8D4' : '#10B981',
              fontWeight: 700,
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isSandboxPreview ? 'Preview Ready' : 'Approved'}
          </div>
        </div>
      )}

      {result?.sandboxed && Array.isArray(result.previewRecipients) && result.previewRecipients.length > 0 && (
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.16)' }}
        >
          <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: '#F9A8D4', fontWeight: 700 }}>
            Preview Inbox
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            The platform prepared this delivery in sandbox mode only. No live members were contacted.
          </div>
          <div className="space-y-2 mt-3">
            {result.previewRecipients.slice(0, 5).map((recipient: any) => (
              <div
                key={recipient.memberId}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <div className="min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--heading)', fontWeight: 700 }}>
                    {recipient.name}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--t3)' }}>
                    {recipient.email || recipient.phone || recipient.memberId}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {typeof recipient.score === 'number' && (
                    <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
                      {recipient.score}/100
                    </span>
                  )}
                  <span
                    className="px-2 py-1 rounded-full text-[10px]"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)', fontWeight: 700 }}
                  >
                    {recipient.channel === 'both' ? 'Email + SMS' : recipient.channel.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(executeAction.error || updateActionState.error) && !isDone && (
        <div className="text-xs mt-3" style={{ color: '#F87171' }}>
          {executeAction.error?.message || updateActionState.error?.message}
        </div>
      )}
    </div>
  )
}
