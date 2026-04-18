'use client'
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, useInView, AnimatePresence } from "motion/react"
import { useSession } from "next-auth/react"
import {
  Bot, Zap, TrendingUp, CheckCircle2, Clock, Send,
  XCircle, SkipForward, Timer, UserPlus, Heart, Puzzle,
  ArrowUpRight, Activity, Shield, CalendarDays,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { useTheme } from "../IQThemeProvider"
import { buildAgentPolicyScenarios } from "@/lib/ai/agent-policy-simulator"
import { resolveAgentAutonomyPolicy } from "@/lib/ai/agent-autonomy"
import {
  buildAgentControlPlaneSummary,
  getAgentControlPlaneAudit,
  resolveAgentControlPlane,
} from "@/lib/ai/agent-control-plane"
import {
  buildAgentPermissionSummary,
  evaluateAgentPermission,
  formatClubAdminRole,
  resolveAgentPermissions,
} from "@/lib/ai/agent-permissions"
import { buildAdvisorSandboxRoutingSummary } from "@/lib/ai/advisor-sandbox-routing"
import type {
  MembershipSignal,
  NormalizedMembershipStatus,
  NormalizedMembershipType,
} from "@/types/intelligence"
import type { AgentPolicyScenario } from "@/lib/ai/agent-policy-simulator"
import {
  useAdminTodoDecisions,
  useClearAdminTodoDecisions,
  useSetAdminTodoDecision,
  useUpdateOpsSessionDraftWorkflow,
} from "../../_hooks/use-intelligence"
import {
  buildIntegrationAnomalyTodoItem,
  getTopIntegrationAnomalies,
  IntegrationWatchlistCard,
  type IntegrationAnomalySnapshot,
} from "./agentiq/integration-anomalies"
import {
  buildDailyAdminTodoSections as buildDailyAdminTodoSectionsComposer,
  type DailyAdminTodoBucket,
  type DailyAdminTodoItem,
  type DailyAdminTodoSection,
  type DailyOwnershipView,
} from "./agentiq/daily-admin-todos"

// ── Types ──
interface AgentLog {
  id: string
  type: string
  status: string
  channel: string | null
  createdAt: string | Date
  memberName: string
  confidence?: number | null
  autoApproved?: boolean | null
  transition?: string | null
  sessionTitle?: string | null
  triggerSource?: string | null
  triggerOutcome?: string | null
  triggerConfiguredMode?: string | null
  triggerPolicyOutcome?: string | null
  triggerReasons?: string[]
  triggerRecipientCount?: number | null
  triggerMembershipSignal?: MembershipSignal | null
  triggerMembershipConfidence?: number | null
  membershipLifecycle?: string | null
  membershipStatus?: NormalizedMembershipStatus | null
  membershipType?: NormalizedMembershipType | null
  sequenceStep?: number | null
}

interface PendingAction {
  id: string
  type: string
  memberName: string
  confidence?: number | null
  description: string
  createdAt: string | Date
  triggerSource?: string | null
  triggerOutcome?: string | null
  triggerConfiguredMode?: string | null
  triggerPolicyOutcome?: string | null
  triggerReasons?: string[]
  triggerRecipientCount?: number | null
  triggerMembershipSignal?: MembershipSignal | null
  triggerMembershipConfidence?: number | null
  membershipLifecycle?: string | null
  membershipStatus?: NormalizedMembershipStatus | null
  membershipType?: NormalizedMembershipType | null
  sequenceStep?: number | null
}

interface AgentDecisionRecordItem {
  id: string
  action: string
  mode: string
  result: string
  summary: string
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, any> | null
  createdAt: string | Date
  user?: {
    id: string
    name?: string | null
    email?: string | null
  } | null
}

type AutopilotOutcome = "auto" | "pending" | "blocked" | "other"
type AutopilotSuggestionAction = "scroll_pending" | "open_settings" | "open_integrations" | "open_advisor"

interface AutopilotSuggestion {
  id: string
  title: string
  description: string
  ctaLabel: string
  action: AutopilotSuggestionAction
  tone: "default" | "warn" | "danger"
}

type ProactiveOpportunityKind = "trial_follow_up" | "renewal_reactivation"
type MembershipLifecycleAutonomyAction = "trialFollowUp" | "renewalReactivation"

interface ProactiveOpportunity {
  id: string
  kind: ProactiveOpportunityKind
  title: string
  description: string
  pendingCount: number
  blockedCount: number
  sampleMembers: string[]
  ctaLabel: string
  action: AutopilotSuggestionAction
  advisorPrompt?: string
}

interface MembershipLifecycleAutopilotCard {
  id: MembershipLifecycleAutonomyAction
  kind: ProactiveOpportunityKind
  title: string
  description: string
  currentMode: string
  autoCount: number
  pendingCount: number
  blockedCount: number
  topReasons: Array<{ label: string; count: number }>
  advisorPrompt: string
}

interface SandboxPreviewRouting {
  mode: 'preview_only' | 'test_recipients'
  configuredMode: 'preview_only' | 'test_recipients'
  emailRecipients: string[]
  smsRecipients: string[]
  label: string
  note: string
}

interface AdvisorDraftWorkspaceItem {
  id: string
  kind: string
  status: string
  title: string
  summary: string | null
  originalIntent: string | null
  selectedPlan: 'requested' | 'recommended'
  sandboxMode: boolean
  scheduledFor?: string | Date | null
  timeZone?: string | null
  conversationId?: string | null
  metadata?: {
    sandboxPreview?: {
      kind?: string
      channel?: 'email' | 'sms' | 'both'
      deliveryMode?: 'send_now' | 'send_later'
      recipientCount?: number
      skippedCount?: number
      scheduledLabel?: string
      note?: string
      routing?: SandboxPreviewRouting | null
      recipients?: Array<{
        memberId: string
        name: string
        channel: 'email' | 'sms' | 'both'
        score?: number
        email?: string
        phone?: string
      }>
    } | null
    slotFillerPreview?: {
      sessionId: string
      title: string
      date: string
      startTime: string
      endTime?: string | null
      format?: string | null
      skillLevel?: string | null
      occupancy: number
      spotsRemaining: number
      candidateCount: number
      channel: 'email' | 'sms' | 'both'
    } | null
    programmingPreview?: {
      goal: string
      publishMode: 'draft_only'
      primary: {
        id: string
        title: string
        dayOfWeek: string
        timeSlot: 'morning' | 'afternoon' | 'evening'
        startTime: string
        endTime: string
        format: string
        skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
        conflict?: {
          overlapRisk: 'low' | 'medium' | 'high'
          cannibalizationRisk: 'low' | 'medium' | 'high'
          courtPressureRisk: 'low' | 'medium' | 'high'
          overallRisk: 'low' | 'medium' | 'high'
          riskSummary: string
          warnings: string[]
          saferAlternativeId?: string
          saferAlternativeReason?: string
        } | null
      }
      alternatives?: Array<{
        id: string
        title: string
        dayOfWeek: string
        timeSlot: 'morning' | 'afternoon' | 'evening'
        startTime: string
        endTime: string
        format: string
        skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
        conflict?: {
          overlapRisk: 'low' | 'medium' | 'high'
          cannibalizationRisk: 'low' | 'medium' | 'high'
          courtPressureRisk: 'low' | 'medium' | 'high'
          overallRisk: 'low' | 'medium' | 'high'
          riskSummary: string
          warnings: string[]
          saferAlternativeId?: string
          saferAlternativeReason?: string
        } | null
      }>
      insights?: string[]
    } | null
    opsSessionDrafts?: Array<{
      id: string
      sourceProposalId: string
      origin: 'primary' | 'alternative'
      state: 'ready_for_ops' | 'session_draft' | 'rejected' | 'archived'
      title: string
      dayOfWeek: string
      timeSlot: 'morning' | 'afternoon' | 'evening'
      startTime: string
      endTime: string
      format: string
      skillLevel: string
      maxPlayers: number
      projectedOccupancy: number
      estimatedInterestedMembers: number
      confidence: number
      note: string
      conflict?: {
        overlapRisk: 'low' | 'medium' | 'high'
        cannibalizationRisk: 'low' | 'medium' | 'high'
        courtPressureRisk: 'low' | 'medium' | 'high'
        overallRisk: 'low' | 'medium' | 'high'
        riskSummary: string
        warnings: string[]
        saferAlternativeId?: string
        saferAlternativeReason?: string
      } | null
    }> | null
  } | null
  updatedAt: string | Date
  createdAt: string | Date
}

interface OutreachPilotActionSummary {
  actionKind: string
  label: string
  health: 'idle' | 'healthy' | 'watch' | 'at_risk'
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  failed: number
  unsubscribed: number
  deliveryRate: number
  openRate: number
  clickRate: number
  conversionRate: number
  failureRate: number
}

interface OutreachPilotHealthSnapshot {
  health: 'idle' | 'healthy' | 'watch' | 'at_risk'
  summary: string
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    converted: number
    failed: number
    bounced: number
    unsubscribed: number
  }
  actions: OutreachPilotActionSummary[]
  topAction?: OutreachPilotActionSummary | null
  atRiskAction?: OutreachPilotActionSummary | null
  recommendation?: {
    actionKind: string
    label: string
    health: 'watch' | 'at_risk'
    reason: string
  } | null
}

type ProgrammingPreview = NonNullable<NonNullable<AdvisorDraftWorkspaceItem['metadata']>['programmingPreview']>
type ProgrammingPreviewProposal = ProgrammingPreview['primary']

interface OpsSessionDraftItem {
  id: string
  sourceProposalId: string
  origin: 'primary' | 'alternative'
  status: 'ready_for_ops' | 'session_draft' | 'rejected' | 'archived'
  title: string
  description?: string | null
  dayOfWeek: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
  projectedOccupancy: number
  estimatedInterestedMembers: number
  confidence: number
  note: string
  conflict?: {
    overlapRisk: 'low' | 'medium' | 'high'
    cannibalizationRisk: 'low' | 'medium' | 'high'
    courtPressureRisk: 'low' | 'medium' | 'high'
    overallRisk: 'low' | 'medium' | 'high'
    riskSummary: string
    warnings: string[]
    saferAlternativeId?: string
    saferAlternativeReason?: string
  } | null
  metadata?: {
    timeline?: Array<{
      id?: string
      kind?: string
      label?: string
      detail?: string
      actorLabel?: string
      createdAt?: string
    }> | null
    handoff?: {
      summary?: string
      whyNow?: string
      nextStep?: string
      watchouts?: string[]
      ownerLabel?: string
      ownerUserId?: string
      ownerBrief?: string
    } | null
    sessionDraft?: {
      stage?: string
      createdAt?: string
      publishMode?: string
      nextStep?: string
      title?: string
      recommendedWindow?: string
      targetDate?: string
      targetDateIso?: string
      preparedAt?: string
      preparedBy?: string
      description?: string | null
      publishedAt?: string
      publishedBy?: string
      publishedPlaySessionId?: string
      lastLiveEditedAt?: string
      lastLiveEditedBy?: string
      lastRollbackAt?: string
      lastRollbackBy?: string
      liveSession?: {
        id?: string
        title?: string
        description?: string | null
        date?: string
        startTime?: string
        endTime?: string
        format?: string
        skillLevel?: string
        maxPlayers?: number
        status?: string
      } | null
      liveFeedback?: {
        status?: 'ahead' | 'tracking' | 'behind' | 'at_risk'
        actualOccupancy?: number
        projectedOccupancy?: number
        occupancyDelta?: number
        confirmedCount?: number
        spotsRemaining?: number
        waitlistCount?: number
        sessionDate?: string
        summary?: string
        recommendedAction?: string
      } | null
      review?: {
        status?: 'ready' | 'warn' | 'blocked'
        summary?: string
        blockers?: string[]
        warnings?: string[]
        recommendedAction?: string
        exactMatchSessionId?: string | null
        exactFormatSessionId?: string | null
        sameDaySessionCount?: number
        overlappingSessionCount?: number
        sameFormatOverlapCount?: number
        sameSkillOverlapCount?: number
        courtPressure?: 'low' | 'medium' | 'high'
        relatedSessions?: Array<{
          id?: string
          title?: string
          startTime?: string
          endTime?: string
          format?: string
          skillLevel?: string
          reason?: 'exact_duplicate' | 'format_duplicate' | 'overlap' | 'same_day'
        }>
      } | null
      aftercare?: {
        status?: 'aligned' | 'drifted' | 'missing'
        summary?: string
        recommendedAction?: string
        blockerCount?: number
        warningCount?: number
        blockers?: string[]
        warnings?: string[]
        rollbackStatus?: 'ready' | 'warn' | 'blocked'
        rollbackSummary?: string
        canEdit?: boolean
        canRollback?: boolean
        driftedFields?: Array<{
          field?: 'title' | 'description' | 'date' | 'startTime' | 'endTime' | 'format' | 'skillLevel' | 'maxPlayers'
          label?: string
          draftValue?: string
          liveValue?: string
        }>
      } | null
    } | null
    opsWorkflow?: {
      ownerLabel?: string
      ownerUserId?: string
      ownerAssignedAt?: string
      dueAt?: string
      dueLabel?: string
      blockedReason?: string
      blockedAt?: string
      archivedAt?: string
      lastAction?: string
      lastActionAt?: string
      lastNoteAt?: string
      lastNoteBy?: string
      lastEscalatedAt?: string
      lastEscalatedBy?: string
    } | null
  } | null
  sessionDraftedAt?: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
  agentDraft?: {
    id: string
    title: string
    conversationId?: string | null
    originalIntent?: string | null
    selectedPlan?: 'requested' | 'recommended'
    conversation?: {
      id: string
      title: string | null
    } | null
  } | null
}

type OpsDueState = 'overdue' | 'due_soon' | 'due_today' | 'due_tomorrow' | 'scheduled' | 'none'

interface ProgrammingDraftCard {
  id: string
  title: string
  summary: string | null
  status: string
  selectedPlan: 'requested' | 'recommended'
  conversationId?: string | null
  originalIntent: string | null
  updatedAt: string | Date
  primary: ProgrammingPreviewProposal
  alternatives: ProgrammingPreviewProposal[]
  insights: string[]
  opsSessionDrafts: NonNullable<NonNullable<AdvisorDraftWorkspaceItem['metadata']>['opsSessionDrafts']>
}

type ProgrammingOpsStageKey = 'new' | 'ready_for_ops' | 'paused' | 'rejected'
type OpsOwnershipFilter = 'all' | 'mine' | 'unassigned'
interface ProgrammingOpsStage {
  key: ProgrammingOpsStageKey
  label: string
  description: string
  color: string
  cards: ProgrammingDraftCard[]
}

type OpsSessionDraftStageKey = 'ready_for_ops' | 'session_draft' | 'rejected' | 'archived'
type AgentDeepLinkFocus = 'programming-cockpit' | 'ops-board' | 'ops-queue' | 'preview-inbox' | 'pending-queue'

type DailyAdminTodoDecision = 'accepted' | 'declined' | 'not_now'
type AdminReminderDeliveryMode = 'in_app' | 'email' | 'sms' | 'both'

interface AdminTodoDecisionRecord {
  dateKey: string
  itemId: string
  decision: string
  title: string
  bucket: string
  href: string
  metadata?: Record<string, unknown> | null
  updatedAt: string | Date
  createdAt: string | Date
}

interface OpsSessionDraftStage {
  key: OpsSessionDraftStageKey
  label: string
  description: string
  color: string
  drafts: OpsSessionDraftItem[]
}

interface DailyTodoReminderOption {
  id: string
  label: string
  description: string
  remindAt: string
  remindLabel: string
}

interface DailyTodoReminderChannelOption {
  id: AdminReminderDeliveryMode
  label: string
  description: string
  available: boolean
}

interface DailyOpsBriefCard {
  id: string
  eyebrow: string
  title: string
  description: string
  ctaLabel: string
  href: string
  tone: 'default' | 'warn' | 'danger' | 'success'
  count?: string | number | null
  bullets?: string[]
  secondaryActions?: Array<{
    label: string
    href: string
    tone?: 'default' | 'warn' | 'danger' | 'success'
  }>
  workflowActions?: Array<{
    label: string
    action:
      | 'promote'
      | 'create_fill_draft'
      | 'reject'
      | 'assign_self'
      | 'assign_teammate'
      | 'reassign_owner'
      | 'ping_owner'
      | 'due_today'
      | 'add_note'
      | 'prepare_publish'
      | 'publish_now'
    opsDraftId: string
    tone?: 'default' | 'warn' | 'danger' | 'success'
  }>
}

interface DailyOpsBrief {
  headline: string
  summary: string
  cards: DailyOpsBriefCard[]
}

interface DailyCommandCenterAction {
  label: string
  href: string
  tone?: 'default' | 'warn' | 'danger' | 'success'
}

interface DailyCommandCenter {
  headline: string
  summary: string
  modules: DailyOpsBriefCard[]
  quickActions: DailyCommandCenterAction[]
}

interface AdminReminderProfile {
  adminReminderEmail?: string | null
  adminReminderPhone?: string | null
  adminReminderChannel?: string | null
}

interface OpsTeammate {
  id: string
  role: string
  name: string
  email?: string | null
  label: string
}

type OpsActionPanelState =
  | {
      type: 'assign_teammate'
      draftId: string
      assigneeUserId: string
    }
  | {
      type: 'prepare_publish'
      draftId: string
      publishDate: string
      title: string
      description: string
    }
  | {
      type: 'edit_published_session'
      draftId: string
      publishDate: string
      title: string
      description: string
      startTime: string
      endTime: string
      maxPlayers: string
    }

interface AgentIQProps {
  clubId: string
  activity?: {
    logs: AgentLog[]
    stats: {
      actionsToday: number
      actionsWeek: number
      autoApprovedPct: number
      conversionRate: number
    }
  } | null
  pending?: PendingAction[] | null
  advisorDrafts?: AdvisorDraftWorkspaceItem[] | null
  opsSessionDrafts?: OpsSessionDraftItem[] | null
  opsTeammates?: OpsTeammate[] | null
  decisionRecords?: AgentDecisionRecordItem[] | null
  isLoading: boolean
  agentLive: boolean
  intelligenceSettings?: any
  outreachRolloutStatus?: any
  approveAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  skipAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  snoozeAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  promoteOpsSessionDraft: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  createFillSessionDraftFromSchedule?: { mutate: (input: any, opts?: any) => void; isPending?: boolean }
  prepareOpsSessionDraftPublish: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  publishOpsSessionDraftToSchedule: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  updatePublishedOpsSessionDraft: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  rollbackPublishedOpsSessionDraft: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  updateOpsSessionDraftWorkflow: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  shadowBackOutreachRolloutAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
}

// ── Card ──
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        backdropFilter: "var(--glass-blur)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {children}
    </div>
  )
}

// ── Status badge ──
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    sent:      { bg: "rgba(16,185,129,0.12)", text: "#10B981", label: "Sent" },
    delivered: { bg: "rgba(16,185,129,0.12)", text: "#10B981", label: "Delivered" },
    opened:    { bg: "rgba(59,130,246,0.12)", text: "#3B82F6", label: "Opened" },
    clicked:   { bg: "rgba(59,130,246,0.12)", text: "#3B82F6", label: "Clicked" },
    converted: { bg: "rgba(139,92,246,0.12)", text: "#A78BFA", label: "Converted" },
    pending:   { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", label: "Pending" },
    blocked:   { bg: "rgba(239,68,68,0.12)",  text: "#EF4444", label: "Blocked" },
    skipped:   { bg: "rgba(107,114,128,0.12)", text: "#9CA3AF", label: "Skipped" },
    bounced:   { bg: "rgba(239,68,68,0.12)",  text: "#EF4444", label: "Bounced" },
    snoozed:   { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", label: "Snoozed" },
  }
  const s = map[status] || { bg: "rgba(107,114,128,0.12)", text: "#9CA3AF", label: status }
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  )
}

function TriggerSourceBadge({ source }: { source?: string | null }) {
  if (!source) return null

  const map: Record<string, { label: string; bg: string; text: string }> = {
    event_detection: { label: "Event", bg: "rgba(6,182,212,0.12)", text: "#06B6D4" },
    slot_filler_automation: { label: "Slot Auto", bg: "rgba(16,185,129,0.12)", text: "#10B981" },
    campaign_engine: { label: "Campaign", bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
    sequence_engine: { label: "Sequence", bg: "rgba(139,92,246,0.12)", text: "#A78BFA" },
  }

  const item = map[source] || { label: source, bg: "rgba(107,114,128,0.12)", text: "#9CA3AF" }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: item.bg, color: item.text }}
    >
      {item.label}
    </span>
  )
}

function TriggerOutcomeBadge({ outcome }: { outcome?: string | null }) {
  if (!outcome) return null

  const map: Record<string, { label: string; bg: string; text: string }> = {
    auto: { label: "Auto", bg: "rgba(139,92,246,0.10)", text: "#A78BFA" },
    pending: { label: "Needs Review", bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
    blocked: { label: "Blocked", bg: "rgba(239,68,68,0.12)", text: "#EF4444" },
  }

  const item = map[outcome] || { label: outcome, bg: "rgba(107,114,128,0.12)", text: "#9CA3AF" }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: item.bg, color: item.text }}
    >
      {item.label}
    </span>
  )
}

function ControlPlaneModeBadge({ mode }: { mode: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    live: { label: 'Live', bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
    shadow: { label: 'Shadow', bg: 'rgba(59,130,246,0.12)', text: '#60A5FA' },
    disabled: { label: 'Locked', bg: 'rgba(239,68,68,0.12)', text: '#F87171' },
  }
  const item = map[mode] || { label: mode, bg: 'rgba(107,114,128,0.12)', text: '#9CA3AF' }
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: item.bg, color: item.text }}
    >
      {item.label}
    </span>
  )
}

function PilotHealthBadge({ health }: { health: 'idle' | 'healthy' | 'watch' | 'at_risk' }) {
  const map = {
    healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
    watch: { label: 'Watch', bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
    at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.12)', text: '#F87171' },
    idle: { label: 'Idle', bg: 'rgba(148,163,184,0.14)', text: '#CBD5E1' },
  } as const
  const item = map[health] || map.idle
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: item.bg, color: item.text }}
    >
      {item.label}
    </span>
  )
}

function ControlPlaneDecisionResultBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    executed: { label: 'Executed', bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
    shadowed: { label: 'Shadowed', bg: 'rgba(59,130,246,0.12)', text: '#60A5FA' },
    blocked: { label: 'Blocked', bg: 'rgba(239,68,68,0.12)', text: '#F87171' },
    reviewed: { label: 'Reviewed', bg: 'rgba(139,92,246,0.12)', text: '#A78BFA' },
    failed: { label: 'Failed', bg: 'rgba(239,68,68,0.12)', text: '#F87171' },
  }
  const item = map[result] || { label: result, bg: 'rgba(107,114,128,0.12)', text: '#9CA3AF' }
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: item.bg, color: item.text }}
    >
      {item.label}
    </span>
  )
}

function formatControlPlaneActionLabel(action: string) {
  const map: Record<string, string> = {
    outreachSend: 'Outreach send',
    schedulePublish: 'Schedule publish',
    scheduleLiveEdit: 'Live edit',
    scheduleLiveRollback: 'Live rollback',
    adminReminderExternal: 'Admin reminders',
  }
  return map[action] || action
}

// ── Type icon ──
function TypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: typeof Bot; color: string }> = {
    CHECK_IN:           { icon: Heart,    color: "#F472B6" },
    RETENTION_BOOST:    { icon: Shield,   color: "#F59E0B" },
    SLOT_FILLER:        { icon: Puzzle,   color: "#06B6D4" },
    NEW_MEMBER_WELCOME: { icon: UserPlus, color: "#10B981" },
    REACTIVATION:       { icon: Send,     color: "#8B5CF6" },
  }
  const entry = map[type] || { icon: Activity, color: "#9CA3AF" }
  const Icon = entry.icon
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: `${entry.color}15` }}
    >
      <Icon className="w-4 h-4" style={{ color: entry.color }} />
    </div>
  )
}

// ── Time ago ──
function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Describe action for feed ──
function describeAction(type: string, log: AgentLog): string {
  const sequencePrefix = log.sequenceStep !== null && log.sequenceStep !== undefined
    ? `Step ${log.sequenceStep}: `
    : ""

  if (log.membershipLifecycle === "trial_follow_up") {
    return `${sequencePrefix}Trial follow-up for first booking`
  }

  if (log.membershipLifecycle === "renewal_reactivation") {
    return `${sequencePrefix}Renewal outreach for recently active member`
  }

  switch (type) {
    case "CHECK_IN":           return `${sequencePrefix}Check-in for ${log.transition || "watch member"}`
    case "RETENTION_BOOST":    return `${sequencePrefix}Win-back for ${log.transition || "at-risk member"}`
    case "SLOT_FILLER":        return `Fill session: ${log.sessionTitle || "underfilled session"}`
    case "NEW_MEMBER_WELCOME": return "Welcome new member"
    case "REACTIVATION":       return "Reactivation outreach"
    default:                   return type
  }
}

function getPrimaryReason(reasons?: string[]) {
  if (!reasons || reasons.length === 0) return null
  return reasons[0]
}

function isMembershipReason(reason?: string | null) {
  return !!reason && /membership|trial|guest|renewal|reactivation flow|confidence/i.test(reason)
}

function membershipReasonLabel(reason?: string | null) {
  if (!reason) return null
  if (/confidence/i.test(reason)) return "Low membership confidence"
  if (/trial/i.test(reason)) return "Trial review gate"
  if (/guest/i.test(reason)) return "Guest review gate"
  if (/active memberships/i.test(reason)) return "Active member protection"
  if (/renewal\/reactivation flow/i.test(reason)) return "Renewal route required"
  if (/membership status/i.test(reason)) return "Membership status rule"
  return "Membership-aware rule"
}

function MembershipReasonBadge({ reason }: { reason?: string | null }) {
  const label = membershipReasonLabel(reason)
  if (!label) return null

  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA" }}
    >
      {label}
    </span>
  )
}

function resolveAutopilotOutcome(log: AgentLog): AutopilotOutcome {
  if (log.triggerOutcome === "auto" || log.triggerOutcome === "pending" || log.triggerOutcome === "blocked") {
    return log.triggerOutcome
  }

  if (log.status === "blocked") return "blocked"
  if (log.status === "pending") return "pending"
  if (log.autoApproved) return "auto"
  return "other"
}

function incrementCounter(map: Map<string, number>, key?: string | null) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + 1)
}

function topEntries(map: Map<string, number>, limit = 3) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))
}

function buildAutopilotSummary(logs: AgentLog[]) {
  const counts = { auto: 0, pending: 0, blocked: 0, other: 0 }
  const sourceCounts = new Map<string, number>()
  const blockedReasons = new Map<string, number>()
  const reviewReasons = new Map<string, number>()
  const membershipReasons = new Map<string, number>()
  let membershipHeldCount = 0

  for (const log of logs) {
    const outcome = resolveAutopilotOutcome(log)
    counts[outcome] += 1

    incrementCounter(sourceCounts, log.triggerSource)

    const reason = getPrimaryReason(log.triggerReasons)
    if (outcome === "blocked") incrementCounter(blockedReasons, reason)
    if (outcome === "pending") incrementCounter(reviewReasons, reason)
    if ((outcome === "blocked" || outcome === "pending") && isMembershipReason(reason)) {
      membershipHeldCount += 1
      incrementCounter(membershipReasons, reason)
    }
  }

  const mostActiveSource = topEntries(sourceCounts, 1)[0] || null

  return {
    counts,
    mostActiveSource,
    topBlockedReasons: topEntries(blockedReasons),
    topReviewReasons: topEntries(reviewReasons),
    membershipHeldCount,
    topMembershipReasons: topEntries(membershipReasons, 2),
  }
}

function isProactiveMembershipLifecycle(kind?: string | null): kind is ProactiveOpportunityKind {
  return kind === "trial_follow_up" || kind === "renewal_reactivation"
}

function buildProactiveAdvisorPrompt(kind: ProactiveOpportunityKind, blockedCount: number) {
  if (kind === "trial_follow_up") {
    const base = "Draft a first-play follow-up for trial members who joined recently and still have no confirmed booking. Use the safest channel for this club and keep the tone supportive."
    return blockedCount > 0
      ? `${base} Also explain which cases should stay manual because current autopilot policy is still blocking them.`
      : base
  }

  const base = "Draft a renewal outreach for recently active members whose membership is expired, cancelled, or suspended. Use membership context to keep active members review-first if needed."
  return blockedCount > 0
    ? `${base} Also explain which cases are still being held by current policy and what the safest next step is.`
    : base
}

function buildProactiveOpportunities(logs: AgentLog[], pendingActions: PendingAction[]): ProactiveOpportunity[] {
  const combined = [
    ...pendingActions.map((item) => ({
      memberName: item.memberName,
      createdAt: item.createdAt,
      outcome: item.triggerOutcome || "pending",
      membershipLifecycle: item.membershipLifecycle || null,
    })),
    ...logs.map((item) => ({
      memberName: item.memberName,
      createdAt: item.createdAt,
      outcome: item.triggerOutcome || resolveAutopilotOutcome(item),
      membershipLifecycle: item.membershipLifecycle || null,
    })),
  ]

  const latest = combined
    .filter((item) => isProactiveMembershipLifecycle(item.membershipLifecycle) && (item.outcome === "pending" || item.outcome === "blocked"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const deduped: typeof latest = []
  const seen = new Set<string>()
  for (const item of latest) {
    const key = `${item.membershipLifecycle}:${item.memberName}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  const grouped = new Map<ProactiveOpportunityKind, typeof deduped>()
  for (const item of deduped) {
    const kind = item.membershipLifecycle as ProactiveOpportunityKind
    const current = grouped.get(kind) || []
    current.push(item)
    grouped.set(kind, current)
  }

  return Array.from(grouped.entries()).map(([kind, items]) => {
    const pendingCount = items.filter((item) => item.outcome === "pending").length
    const blockedCount = items.filter((item) => item.outcome === "blocked").length
    const total = items.length
    const sampleMembers = items.map((item) => item.memberName).filter(Boolean).slice(0, 3)

    if (kind === "trial_follow_up") {
      return {
        id: kind,
        kind,
        title: "Trial members need first-play follow-up",
        description: `${total} trial members still need a nudge into their first booking. ${pendingCount > 0 ? `${pendingCount} are ready for review.` : ""}${blockedCount > 0 ? ` ${blockedCount} are still blocked by current policy.` : ""}`.trim(),
        pendingCount,
        blockedCount,
        sampleMembers,
        ctaLabel: pendingCount > 0 ? "Review pending actions" : "Prepare in Advisor",
        action: pendingCount > 0 ? "scroll_pending" : "open_advisor",
        advisorPrompt: pendingCount > 0 ? undefined : buildProactiveAdvisorPrompt(kind, blockedCount),
      }
    }

    return {
      id: kind,
      kind,
      title: "Renewal opportunities are ready",
      description: `${total} recently active members have expired or suspended memberships. ${pendingCount > 0 ? `${pendingCount} are queued for outreach review.` : ""}${blockedCount > 0 ? ` ${blockedCount} are being held by policy.` : ""}`.trim(),
      pendingCount,
      blockedCount,
      sampleMembers,
      ctaLabel: pendingCount > 0 ? "Review pending actions" : "Prepare in Advisor",
      action: pendingCount > 0 ? "scroll_pending" : "open_advisor",
      advisorPrompt: pendingCount > 0 ? undefined : buildProactiveAdvisorPrompt(kind, blockedCount),
    }
  })
}

function buildMembershipLifecycleAutopilotCards(
  logs: AgentLog[],
  pendingActions: PendingAction[],
  intelligenceSettings?: any,
): MembershipLifecycleAutopilotCard[] {
  const policy = resolveAgentAutonomyPolicy({ intelligence: intelligenceSettings || {} })
  const lifecycleAutoExecutionEnabled = intelligenceSettings?.lifecycleAutoExecutionEnabled === true
  const combined = [
    ...pendingActions.map((item) => ({
      membershipLifecycle: item.membershipLifecycle || null,
      outcome: item.triggerOutcome === "blocked" ? "blocked" : "pending",
      reason: getPrimaryReason(item.triggerReasons),
    })),
    ...logs.map((item) => ({
      membershipLifecycle: item.membershipLifecycle || null,
      outcome: resolveAutopilotOutcome(item),
      reason: getPrimaryReason(item.triggerReasons),
    })),
  ].filter((item) => isProactiveMembershipLifecycle(item.membershipLifecycle))

  const configs: Array<{
    id: MembershipLifecycleAutonomyAction
    kind: ProactiveOpportunityKind
    title: string
    prompt: string
    currentMode: string
    minConfidence?: number
    maxRecipients?: number
    membershipRequired?: boolean
  }> = [
    {
      id: "trialFollowUp",
      kind: "trial_follow_up",
      title: "Trial follow-up autopilot",
      prompt: "Update the club autopilot policy so trial follow-up stays safe but can run with the right membership confidence. Recommend the safest mode and thresholds for trial members who still need their first booking.",
      currentMode: policy.trialFollowUp.mode,
      minConfidence: policy.trialFollowUp.minConfidenceAuto,
      maxRecipients: policy.trialFollowUp.maxRecipientsAuto,
      membershipRequired: policy.trialFollowUp.requireMembershipSignal,
    },
    {
      id: "renewalReactivation",
      kind: "renewal_reactivation",
      title: "Renewal outreach autopilot",
      prompt: "Update the club autopilot policy so renewal outreach is safe for recently active expired or suspended members. Recommend the safest mode and thresholds, and keep active memberships review-first if needed.",
      currentMode: policy.renewalReactivation.mode,
      minConfidence: policy.renewalReactivation.minConfidenceAuto,
      maxRecipients: policy.renewalReactivation.maxRecipientsAuto,
      membershipRequired: policy.renewalReactivation.requireMembershipSignal,
    },
  ]

  return configs.map((config) => {
    const items = combined.filter((item) => item.membershipLifecycle === config.kind)
    const reasonCounts = new Map<string, number>()
    let autoCount = 0
    let pendingCount = 0
    let blockedCount = 0

    for (const item of items) {
      if (item.outcome === "auto") autoCount += 1
      else if (item.outcome === "blocked") blockedCount += 1
      else pendingCount += 1
      incrementCounter(reasonCounts, item.reason)
    }

    const ruleBits = [
      `${config.currentMode} now`,
      `confidence ${config.minConfidence ?? "n/a"}+`,
      `max ${config.maxRecipients ?? "n/a"} auto`,
      config.membershipRequired ? "strong membership required" : "membership optional",
      lifecycleAutoExecutionEnabled ? "live auto-send unlocked" : "live auto-send safety-locked",
    ]

    return {
      id: config.id,
      kind: config.kind,
      title: config.title,
      description: ruleBits.join(" · "),
      currentMode: config.currentMode,
      autoCount,
      pendingCount,
      blockedCount,
      topReasons: topEntries(reasonCounts, 2),
      advisorPrompt: config.prompt,
    }
  }).filter((card) => card.autoCount > 0 || card.pendingCount > 0 || card.blockedCount > 0)
}

function reasonIncludes(entries: Array<{ label: string; count: number }>, matcher: RegExp) {
  return entries.some((entry) => matcher.test(entry.label))
}

function buildAutopilotSuggestions(summary: ReturnType<typeof buildAutopilotSummary>, pendingCount: number): AutopilotSuggestion[] {
  const suggestions: AutopilotSuggestion[] = []

  if (pendingCount > 0 || summary.counts.pending > 0) {
    suggestions.push({
      id: "review-pending",
      title: "Clear the review queue",
      description: "Some actions are waiting on manual approval. Reviewing them is the fastest way to unlock more autopilot volume.",
      ctaLabel: "Review pending actions",
      action: "scroll_pending",
      tone: "warn",
    })
  }

  if (reasonIncludes(summary.topBlockedReasons, /membership signal|membership/i) || reasonIncludes(summary.topReviewReasons, /membership signal|membership/i)) {
    suggestions.push({
      id: "improve-membership",
      title: "Improve membership confidence",
      description: "The agent is holding actions because membership data is weak or missing. Strengthening imports will unlock safer automation.",
      ctaLabel: "Open integrations",
      action: "open_integrations",
      tone: "danger",
    })
  }

  if (
    reasonIncludes(summary.topBlockedReasons, /disabled|threshold|Recipient count|manual approval|auto-send/i) ||
    reasonIncludes(summary.topReviewReasons, /manual approval|threshold|Recipient count|confidence/i)
  ) {
    suggestions.push({
      id: "tune-policy",
      title: "Tune autonomy policy",
      description: "A large share of actions are being slowed down by current limits. Tightening or relaxing policy here changes what the club trusts the agent to do automatically.",
      ctaLabel: "Open settings",
      action: "open_settings",
      tone: "default",
    })
  }

  if (summary.counts.auto === 0 && (summary.counts.pending > 0 || summary.counts.blocked > 0)) {
    suggestions.push({
      id: "use-advisor",
      title: "Ask Advisor to reshape policy",
      description: "If you're not sure which rule to change, let Advisor recommend a safer autopilot setup based on recent club outcomes.",
      ctaLabel: "Open Advisor",
      action: "open_advisor",
      tone: "default",
    })
  }

  return suggestions.slice(0, 3)
}

function suggestionToneStyles(tone: AutopilotSuggestion["tone"]) {
  switch (tone) {
    case "warn":
      return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.18)", title: "#F59E0B" }
    case "danger":
      return { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.18)", title: "#EF4444" }
    default:
      return { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.18)", title: "#A78BFA" }
  }
}

function dailyTodoToneStyles(tone: DailyAdminTodoItem["tone"]) {
  switch (tone) {
    case "warn":
      return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.18)", title: "#F59E0B" }
    case "danger":
      return { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.18)", title: "#EF4444" }
    case "success":
      return { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.18)", title: "#10B981" }
    default:
      return { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.18)", title: "#A78BFA" }
  }
}

function buildDailyTodoReminderOptions(now: Date) {
  const options: DailyTodoReminderOption[] = []
  const seen = new Set<string>()
  const pushOption = (option: DailyTodoReminderOption) => {
    if (seen.has(option.id)) return
    const remindAt = new Date(option.remindAt)
    if (Number.isNaN(remindAt.getTime())) return
    if (remindAt.getTime() <= now.getTime() + 20 * 60 * 1000) return
    seen.add(option.id)
    options.push(option)
  }

  const oneHour = new Date(now.getTime() + 60 * 60 * 1000)
  const threeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const beforeLunch = new Date(now)
  beforeLunch.setHours(11, 30, 0, 0)
  const afterLunch = new Date(now)
  afterLunch.setHours(13, 30, 0, 0)
  const beforeEveningPush = new Date(now)
  beforeEveningPush.setHours(17, 0, 0, 0)
  const todayEvening = new Date(now)
  todayEvening.setHours(18, 0, 0, 0)
  const tomorrowMorning = new Date(now)
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1)
  tomorrowMorning.setHours(9, 0, 0, 0)
  const tomorrowAfterLunch = new Date(now)
  tomorrowAfterLunch.setDate(tomorrowAfterLunch.getDate() + 1)
  tomorrowAfterLunch.setHours(13, 30, 0, 0)
  const tomorrowBeforeClose = new Date(now)
  tomorrowBeforeClose.setDate(tomorrowBeforeClose.getDate() + 1)
  tomorrowBeforeClose.setHours(17, 0, 0, 0)

  pushOption({
    id: '1h',
    label: '1h',
    description: 'Remind in 1 hour',
    remindAt: oneHour.toISOString(),
    remindLabel: 'in 1 hour',
  })
  pushOption({
    id: '3h',
    label: '3h',
    description: 'Remind in 3 hours',
    remindAt: threeHours.toISOString(),
    remindLabel: 'in 3 hours',
  })
  pushOption({
    id: 'before-lunch',
    label: 'Before lunch',
    description: 'Bring this back before lunch service starts',
    remindAt: beforeLunch.toISOString(),
    remindLabel: 'before lunch',
  })
  pushOption({
    id: 'after-lunch',
    label: 'After lunch',
    description: 'Bring this back after lunch',
    remindAt: afterLunch.toISOString(),
    remindLabel: 'after lunch',
  })
  pushOption({
    id: 'before-evening-push',
    label: 'Before evening push',
    description: 'Bring this back before the evening member push',
    remindAt: beforeEveningPush.toISOString(),
    remindLabel: 'before the evening push',
  })
  pushOption({
    id: 'today-6pm',
    label: 'At close',
    description: 'Bring this back today around close',
    remindAt: todayEvening.toISOString(),
    remindLabel: 'today at close',
  })
  pushOption({
    id: 'tomorrow-9am',
    label: 'Before open',
    description: 'Remind tomorrow before the club opens',
    remindAt: tomorrowMorning.toISOString(),
    remindLabel: 'tomorrow before open',
  })
  pushOption({
    id: 'tomorrow-lunch',
    label: 'Tomorrow lunch',
    description: 'Bring this back tomorrow after lunch',
    remindAt: tomorrowAfterLunch.toISOString(),
    remindLabel: 'tomorrow after lunch',
  })
  pushOption({
    id: 'tomorrow-5pm',
    label: 'Tomorrow PM',
    description: 'Bring this back tomorrow before the evening push',
    remindAt: tomorrowBeforeClose.toISOString(),
    remindLabel: 'tomorrow before close',
  })

  return options
}

function normalizeAdminReminderDeliveryMode(value: unknown): AdminReminderDeliveryMode {
  return value === 'email' || value === 'sms' || value === 'both' ? value : 'in_app'
}

function formatAdminReminderDeliveryMode(value: AdminReminderDeliveryMode) {
  switch (value) {
    case 'email':
      return 'email'
    case 'sms':
      return 'SMS'
    case 'both':
      return 'email + SMS'
    default:
      return 'in-app'
  }
}

function getPreferredDailyTodoReminderChannel(profile?: AdminReminderProfile | null): AdminReminderDeliveryMode {
  const preferred = normalizeAdminReminderDeliveryMode(profile?.adminReminderChannel)
  const hasEmail = Boolean(profile?.adminReminderEmail?.trim())
  const hasPhone = Boolean(profile?.adminReminderPhone?.trim())

  if (preferred === 'email') return hasEmail ? 'email' : 'in_app'
  if (preferred === 'sms') return hasPhone ? 'sms' : 'in_app'
  if (preferred === 'both') return hasEmail && hasPhone ? 'both' : 'in_app'

  return 'in_app'
}

function buildDailyTodoReminderChannelOptions(
  profile?: AdminReminderProfile | null,
): DailyTodoReminderChannelOption[] {
  const hasEmail = Boolean(profile?.adminReminderEmail?.trim())
  const hasPhone = Boolean(profile?.adminReminderPhone?.trim())

  return [
    {
      id: 'in_app',
      label: 'In app',
      description: 'Bring this back in the daily board and inbox',
      available: true,
    },
    {
      id: 'email',
      label: 'Email',
      description: hasEmail ? 'Email me when it is due' : 'Add a reminder email first',
      available: hasEmail,
    },
    {
      id: 'sms',
      label: 'SMS',
      description: hasPhone ? 'Text me when it is due' : 'Add a reminder phone first',
      available: hasPhone,
    },
    {
      id: 'both',
      label: 'Both',
      description: hasEmail && hasPhone ? 'Use email and SMS together' : 'Need both reminder email and phone',
      available: hasEmail && hasPhone,
    },
  ]
}

function getDailyTodoReminder(record: AdminTodoDecisionRecord) {
  const metadata = record.metadata as Record<string, unknown> | null | undefined
  const remindAtValue = typeof metadata?.remindAt === 'string' ? metadata.remindAt : null
  const remindLabel = typeof metadata?.remindLabel === 'string' ? metadata.remindLabel : null
  const reminderChannel = normalizeAdminReminderDeliveryMode(metadata?.reminderChannel)

  if (!remindAtValue) return null

  const remindAt = new Date(remindAtValue)
  if (Number.isNaN(remindAt.getTime())) return null

  return {
    remindAt,
    remindLabel,
    reminderChannel,
  }
}

function getOpsWorkflowMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.opsWorkflow || null
}

function getOpsHandoffMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.handoff || null
}

function getOpsSessionDraftPublishMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.sessionDraft || null
}

function getOpsSessionDraftPublishReviewMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.sessionDraft?.review || null
}

function getOpsSessionDraftLiveFeedbackMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.sessionDraft?.liveFeedback || null
}

function getOpsSessionDraftAftercareMeta(draft: OpsSessionDraftItem) {
  return draft.metadata?.sessionDraft?.aftercare || null
}

function getOpsTimelineMeta(draft: OpsSessionDraftItem) {
  return Array.isArray(draft.metadata?.timeline)
    ? draft.metadata.timeline.filter((event) => event && typeof event === 'object')
    : []
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  )
}

function getOpsDueMeta(draft: OpsSessionDraftItem, now = new Date()) {
  if (draft.status === 'archived' || draft.status === 'rejected') return null
  const workflow = getOpsWorkflowMeta(draft)
  if (!workflow?.dueAt) {
    return workflow?.dueLabel
      ? {
          state: 'none' as OpsDueState,
          label: workflow.dueLabel,
          accent: '#94A3B8',
          background: 'rgba(148,163,184,0.12)',
          border: 'rgba(148,163,184,0.2)',
          dueAt: null,
        }
      : null
  }

  const dueAt = new Date(workflow.dueAt)
  if (Number.isNaN(dueAt.getTime())) {
    return workflow?.dueLabel
      ? {
          state: 'none' as OpsDueState,
          label: workflow.dueLabel,
          accent: '#94A3B8',
          background: 'rgba(148,163,184,0.12)',
          border: 'rgba(148,163,184,0.2)',
          dueAt: null,
        }
      : null
  }

  const diffMs = dueAt.getTime() - now.getTime()
  const twoHoursMs = 2 * 60 * 60 * 1000
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let state: OpsDueState = 'scheduled'
  let label = workflow?.dueLabel || dueAt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  let accent = '#94A3B8'
  let background = 'rgba(148,163,184,0.12)'
  let border = 'rgba(148,163,184,0.2)'

  if (diffMs < 0) {
    state = 'overdue'
    label = 'Overdue'
    accent = '#EF4444'
    background = 'rgba(239,68,68,0.12)'
    border = 'rgba(239,68,68,0.2)'
  } else if (diffMs <= twoHoursMs) {
    state = 'due_soon'
    label = 'Due soon'
    accent = '#F97316'
    background = 'rgba(249,115,22,0.12)'
    border = 'rgba(249,115,22,0.2)'
  } else if (isSameCalendarDay(dueAt, now)) {
    state = 'due_today'
    label = workflow?.dueLabel || 'Due today'
    accent = '#F59E0B'
    background = 'rgba(245,158,11,0.12)'
    border = 'rgba(245,158,11,0.2)'
  } else if (isSameCalendarDay(dueAt, tomorrow)) {
    state = 'due_tomorrow'
    label = workflow?.dueLabel || 'Due tomorrow'
    accent = '#60A5FA'
    background = 'rgba(96,165,250,0.12)'
    border = 'rgba(96,165,250,0.2)'
  }

  return {
    state,
    label,
    accent,
    background,
    border,
    dueAt,
  }
}

function getOpsWorkflowDueLabel(draft: OpsSessionDraftItem) {
  return getOpsDueMeta(draft)?.label || null
}

function getOpsDueRank(draft: OpsSessionDraftItem, now = new Date()) {
  const state = getOpsDueMeta(draft, now)?.state || 'none'
  switch (state) {
    case 'overdue':
      return 0
    case 'due_soon':
      return 1
    case 'due_today':
      return 2
    case 'due_tomorrow':
      return 3
    case 'scheduled':
      return 4
    default:
      return 5
  }
}

function getDailyOwnershipViewCopy(view: DailyOwnershipView) {
  if (view === 'mine') {
    return {
      briefTitle: 'Today’s Ops Brief · My Work',
      briefDescription: 'Your assigned and owned ops work first, with club-wide approvals still visible when they need a human.',
      todoDescription: 'The agent’s recommended worklist for what is on you right now, with shared approvals still kept visible.',
    }
  }

  return {
    briefTitle: "Today’s Ops Brief",
    briefDescription: 'The full club operating picture across approvals, ops drafts, programming, and blockers.',
    todoDescription: 'The agent’s recommended worklist for the club manager across today, tomorrow, and the next blockers.',
  }
}

function getNextDateForDay(dayOfWeek: string, now = new Date()) {
  const targetIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .findIndex((day) => day.toLowerCase() === dayOfWeek.toLowerCase())
  if (targetIndex < 0) return now.toISOString().slice(0, 10)

  const next = new Date(now)
  next.setHours(12, 0, 0, 0)
  const delta = (targetIndex - next.getDay() + 7) % 7 || 7
  next.setDate(next.getDate() + delta)
  return next.toISOString().slice(0, 10)
}

function getOpsSessionLiveFeedbackTone(status?: 'ahead' | 'tracking' | 'behind' | 'at_risk' | null) {
  if (status === 'ahead') {
    return { label: 'Ahead of plan', color: '#10B981', background: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' }
  }
  if (status === 'at_risk') {
    return { label: 'Needs help soon', color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.18)' }
  }
  if (status === 'behind') {
    return { label: 'Behind plan', color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)' }
  }
  return { label: 'Tracking', color: '#06B6D4', background: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.18)' }
}

function actionLabel(action: string) {
  switch (action) {
    case "slotFiller": return "Slot filler"
    case "reactivation": return "Reactivation"
    case "retentionBoost": return "Retention boost"
    case "trialFollowUp": return "Trial follow-up"
    case "renewalReactivation": return "Renewal outreach"
    case "welcome": return "Welcome"
    case "checkIn": return "Check-in"
    default: return action
  }
}

function buildAdvisorPolicyPrompt(scenario: AgentPolicyScenario) {
  const actionName = actionLabel(scenario.action).toLowerCase()
  const base = `Update the club autopilot policy so ${actionName} can run in auto mode. Keep the current confidence and recipient limits unless a safer tweak is needed, and explain what would still remain blocked or review-only.`

  if (scenario.requiresLiveMode) {
    return `${base} Also note that the club is still in test mode, so include the live-mode change needed for this to actually auto-run.`
  }

  return base
}

function formatSandboxDraftKind(kind: string) {
  switch (kind) {
    case 'create_campaign': return 'Campaign'
    case 'fill_session': return 'Slot Filler'
    case 'reactivate_members': return 'Reactivation'
    case 'trial_follow_up': return 'Trial Follow-up'
    case 'renewal_reactivation': return 'Renewal Outreach'
    case 'program_schedule': return 'Programming Plan'
    default: return kind.replace(/_/g, ' ')
  }
}

function formatProgrammingValue(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatProgrammingWindow(primary: ProgrammingPreviewProposal) {
  return `${primary.dayOfWeek} · ${primary.startTime}-${primary.endTime} · ${formatProgrammingValue(primary.format)} · ${formatProgrammingValue(primary.skillLevel)}`
}

function getProgrammingOperationalScore(proposal: ProgrammingPreviewProposal) {
  const conflictPenalty = proposal.conflict
    ? (
      (proposal.conflict.overlapRisk === 'high' ? 6 : proposal.conflict.overlapRisk === 'medium' ? 3 : 0) +
      (proposal.conflict.cannibalizationRisk === 'high' ? 8 : proposal.conflict.cannibalizationRisk === 'medium' ? 4 : 0) +
      (proposal.conflict.courtPressureRisk === 'high' ? 5 : proposal.conflict.courtPressureRisk === 'medium' ? 2 : 0)
    )
    : 0

  return (
    proposal.confidence * 1.2 +
    proposal.projectedOccupancy * 0.45 +
    proposal.estimatedInterestedMembers * 1.3 -
    conflictPenalty
  )
}

function getProgrammingConflictSeverity(level?: 'low' | 'medium' | 'high' | null) {
  if (level === 'high') return 2
  if (level === 'medium') return 1
  return 0
}

function sortProgrammingDrafts(drafts: ProgrammingDraftCard[]) {
  return [...drafts].sort((left, right) => {
    const rightOperationalScore = getProgrammingOperationalScore(right.primary)
    const leftOperationalScore = getProgrammingOperationalScore(left.primary)
    if (rightOperationalScore !== leftOperationalScore) {
      return rightOperationalScore - leftOperationalScore
    }
    if (right.primary.confidence !== left.primary.confidence) return right.primary.confidence - left.primary.confidence
    if (right.primary.projectedOccupancy !== left.primary.projectedOccupancy) {
      return right.primary.projectedOccupancy - left.primary.projectedOccupancy
    }
    return right.primary.estimatedInterestedMembers - left.primary.estimatedInterestedMembers
  })
}

function sortProgrammingDraftsBySafety(drafts: ProgrammingDraftCard[]) {
  return [...drafts].sort((left, right) => {
    const riskComparisons = [
      getProgrammingConflictSeverity(left.primary.conflict?.overallRisk) - getProgrammingConflictSeverity(right.primary.conflict?.overallRisk),
      getProgrammingConflictSeverity(left.primary.conflict?.cannibalizationRisk) - getProgrammingConflictSeverity(right.primary.conflict?.cannibalizationRisk),
      getProgrammingConflictSeverity(left.primary.conflict?.overlapRisk) - getProgrammingConflictSeverity(right.primary.conflict?.overlapRisk),
      getProgrammingConflictSeverity(left.primary.conflict?.courtPressureRisk) - getProgrammingConflictSeverity(right.primary.conflict?.courtPressureRisk),
    ]

    for (const delta of riskComparisons) {
      if (delta !== 0) return delta
    }

    if (right.primary.confidence !== left.primary.confidence) {
      return right.primary.confidence - left.primary.confidence
    }
    if (right.primary.projectedOccupancy !== left.primary.projectedOccupancy) {
      return right.primary.projectedOccupancy - left.primary.projectedOccupancy
    }
    return right.primary.estimatedInterestedMembers - left.primary.estimatedInterestedMembers
  })
}

function buildProgrammingCockpit(drafts: AdvisorDraftWorkspaceItem[]) {
  const cards: ProgrammingDraftCard[] = drafts
    .filter((draft) => draft.kind === 'program_schedule' && draft.metadata?.programmingPreview?.primary)
    .map((draft) => ({
      id: draft.id,
      title: draft.title,
      summary: draft.summary,
      status: draft.status,
      selectedPlan: draft.selectedPlan,
      conversationId: draft.conversationId,
      originalIntent: draft.originalIntent,
      updatedAt: draft.updatedAt,
      primary: draft.metadata!.programmingPreview!.primary,
      alternatives: draft.metadata?.programmingPreview?.alternatives || [],
      insights: draft.metadata?.programmingPreview?.insights || [],
      opsSessionDrafts: draft.metadata?.opsSessionDrafts || [],
    }))

  const ranked = sortProgrammingDrafts(cards)
  const safestRanked = sortProgrammingDraftsBySafety(cards)
  const strongest = ranked[0] || null
  const safest = safestRanked[0] || null
  const totalIdeas = ranked.reduce((sum, draft) => sum + 1 + draft.alternatives.length, 0)
  const totalOpsDrafts = ranked.reduce((sum, draft) => sum + draft.opsSessionDrafts.length, 0)
  const avgProjectedFill = ranked.length
    ? Math.round(ranked.reduce((sum, draft) => sum + draft.primary.projectedOccupancy, 0) / ranked.length)
    : 0
  const topConfidence = strongest?.primary.confidence || 0
  const topInterestedMembers = strongest?.primary.estimatedInterestedMembers || 0
  const nextBest = strongest?.alternatives?.[0] || null
  const fillLiftVsAlternative = strongest && nextBest
    ? strongest.primary.projectedOccupancy - nextBest.projectedOccupancy
    : null

  return {
    cards: ranked,
    strongest,
    safest,
    totalIdeas,
    totalOpsDrafts,
    avgProjectedFill,
    topConfidence,
    topInterestedMembers,
    fillLiftVsAlternative,
  }
}

function resolveProgrammingOpsStage(card: ProgrammingDraftCard): ProgrammingOpsStageKey {
  if (card.opsSessionDrafts.length > 0 || card.status === 'approved') return 'ready_for_ops'
  const status = card.status
  if (status === 'review_ready') return 'new'
  if (status === 'draft_saved' || status === 'sandboxed' || status === 'scheduled') return 'new'
  if (status === 'snoozed') return 'paused'
  if (status === 'declined' || status === 'blocked') return 'rejected'
  return 'new'
}

function sortProgrammingOpsCards(drafts: ProgrammingDraftCard[]) {
  const dayOrder = new Map([
    ['Monday', 1],
    ['Tuesday', 2],
    ['Wednesday', 3],
    ['Thursday', 4],
    ['Friday', 5],
    ['Saturday', 6],
    ['Sunday', 7],
  ])
  const timeSlotOrder = new Map([
    ['morning', 1],
    ['afternoon', 2],
    ['evening', 3],
  ])

  return [...drafts].sort((left, right) => {
    const leftDay = dayOrder.get(left.primary.dayOfWeek) || 99
    const rightDay = dayOrder.get(right.primary.dayOfWeek) || 99
    if (leftDay !== rightDay) return leftDay - rightDay

    const leftSlot = timeSlotOrder.get(left.primary.timeSlot) || 99
    const rightSlot = timeSlotOrder.get(right.primary.timeSlot) || 99
    if (leftSlot !== rightSlot) return leftSlot - rightSlot

    if (right.primary.confidence !== left.primary.confidence) {
      return right.primary.confidence - left.primary.confidence
    }

    return right.primary.projectedOccupancy - left.primary.projectedOccupancy
  })
}

function buildProgrammingOpsBoard(drafts: AdvisorDraftWorkspaceItem[]) {
  const cards = buildProgrammingCockpit(drafts).cards
  const stages: ProgrammingOpsStage[] = [
    {
      key: 'new',
      label: 'New Ideas',
      description: 'Fresh agent proposals that still need a programming decision.',
      color: '#A78BFA',
      cards: [],
    },
    {
      key: 'ready_for_ops',
      label: 'Ready For Ops',
      description: 'Plans already saved by the agent and ready for internal scheduling review.',
      color: '#10B981',
      cards: [],
    },
    {
      key: 'paused',
      label: 'Paused',
      description: 'Drafts intentionally parked until the club is ready to revisit them.',
      color: '#F59E0B',
      cards: [],
    },
    {
      key: 'rejected',
      label: 'Rejected',
      description: 'Ideas the team decided not to push forward right now.',
      color: '#EF4444',
      cards: [],
    },
  ]

  const stageMap = new Map<ProgrammingOpsStageKey, ProgrammingOpsStage>(stages.map((stage) => [stage.key, stage]))
  for (const card of cards) {
    stageMap.get(resolveProgrammingOpsStage(card))?.cards.push(card)
  }

  for (const stage of stages) {
    stage.cards = sortProgrammingOpsCards(stage.cards)
  }

  return stages
}

function sortOpsSessionDrafts(drafts: OpsSessionDraftItem[], now = new Date()) {
  const dayOrder = new Map([
    ['Monday', 1],
    ['Tuesday', 2],
    ['Wednesday', 3],
    ['Thursday', 4],
    ['Friday', 5],
    ['Saturday', 6],
    ['Sunday', 7],
  ])
  const timeSlotOrder = new Map([
    ['morning', 1],
    ['afternoon', 2],
    ['evening', 3],
  ])

  return [...drafts].sort((left, right) => {
    const leftDueRank = getOpsDueRank(left, now)
    const rightDueRank = getOpsDueRank(right, now)
    if (leftDueRank !== rightDueRank) return leftDueRank - rightDueRank

    const leftDueAt = getOpsDueMeta(left, now)?.dueAt?.getTime() || Number.POSITIVE_INFINITY
    const rightDueAt = getOpsDueMeta(right, now)?.dueAt?.getTime() || Number.POSITIVE_INFINITY
    if (leftDueAt !== rightDueAt) return leftDueAt - rightDueAt

    const leftDay = dayOrder.get(left.dayOfWeek) || 99
    const rightDay = dayOrder.get(right.dayOfWeek) || 99
    if (leftDay !== rightDay) return leftDay - rightDay

    const leftSlot = timeSlotOrder.get(left.timeSlot) || 99
    const rightSlot = timeSlotOrder.get(right.timeSlot) || 99
    if (leftSlot !== rightSlot) return leftSlot - rightSlot

    if (right.confidence !== left.confidence) return right.confidence - left.confidence
    return right.projectedOccupancy - left.projectedOccupancy
  })
}

function getOpsDraftOwnerUserId(draft: OpsSessionDraftItem) {
  return draft.metadata?.opsWorkflow?.ownerUserId || draft.metadata?.handoff?.ownerUserId || null
}

function buildOpsSessionDraftQueue(
  drafts: OpsSessionDraftItem[],
  currentUserId?: string | null,
  ownershipFilter: OpsOwnershipFilter = 'all',
) {
  const now = new Date()
  const stages: OpsSessionDraftStage[] = [
    {
      key: 'ready_for_ops',
      label: 'Ready For Ops',
      description: 'Operational ideas the agent has already translated into internal session drafts for review.',
      color: '#10B981',
      drafts: [],
    },
    {
      key: 'session_draft',
      label: 'Session Drafts',
      description: 'Internal session drafts already promoted for manual scheduling work, still not live.',
      color: '#06B6D4',
      drafts: [],
    },
    {
      key: 'rejected',
      label: 'Rejected',
      description: 'Ideas the team decided not to operationalize right now.',
      color: '#EF4444',
      drafts: [],
    },
    {
      key: 'archived',
      label: 'Archived',
      description: 'Older session-draft ideas kept only for traceability.',
      color: '#94A3B8',
      drafts: [],
    },
  ]

  const stageMap = new Map<OpsSessionDraftStageKey, OpsSessionDraftStage>(stages.map((stage) => [stage.key, stage]))
  for (const draft of drafts) {
    stageMap.get(draft.status)?.drafts.push(draft)
  }

  for (const stage of stages) {
    const filteredDrafts = stage.drafts.filter((draft) => {
      if (ownershipFilter === 'all') return true
      const ownerUserId = getOpsDraftOwnerUserId(draft)
      if (ownershipFilter === 'mine') return !!currentUserId && ownerUserId === currentUserId
      return !ownerUserId
    })

    stage.drafts = sortOpsSessionDrafts(filteredDrafts, now).sort((left, right) => {
      if (!currentUserId) return 0

      const getOwnershipRank = (draft: OpsSessionDraftItem) => {
        const ownerUserId = getOpsDraftOwnerUserId(draft)
        if (ownerUserId === currentUserId) return 0
        if (!ownerUserId) return 1
        return 2
      }

      return getOwnershipRank(left) - getOwnershipRank(right)
    })
  }

  return stages
}

function buildOpsEscalationSignals(args: {
  opsSessionDraftQueue: ReturnType<typeof buildOpsSessionDraftQueue>
  currentUserId?: string | null
  ownershipView: DailyOwnershipView
  now?: Date
}) {
  const { opsSessionDraftQueue, currentUserId, ownershipView, now = new Date() } = args
  const readyOpsDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'ready_for_ops')?.drafts || []
  const sessionDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'session_draft')?.drafts || []
  const activeDrafts = [...readyOpsDrafts, ...sessionDrafts]

  const overdueDrafts = activeDrafts.filter((draft) => getOpsDueMeta(draft, now)?.state === 'overdue')
  const dueSoonDrafts = activeDrafts.filter((draft) => getOpsDueMeta(draft, now)?.state === 'due_soon')
  const unassignedOverdueDrafts = overdueDrafts.filter((draft) => !getOpsDraftOwnerUserId(draft))
  const assignedOverdueDrafts = overdueDrafts.filter((draft) => !!getOpsDraftOwnerUserId(draft))
  const mineOverdueDrafts = currentUserId
    ? overdueDrafts.filter((draft) => getOpsDraftOwnerUserId(draft) === currentUserId)
    : []
  const mineDueSoonDrafts = currentUserId
    ? dueSoonDrafts.filter((draft) => getOpsDraftOwnerUserId(draft) === currentUserId)
    : []
  const staleAssignedDrafts = activeDrafts.filter((draft) => {
    const ownerUserId = getOpsDraftOwnerUserId(draft)
    if (!ownerUserId) return false
    const workflow = getOpsWorkflowMeta(draft)
    const staleAt = workflow?.lastActionAt || workflow?.ownerAssignedAt
    if (!staleAt) return false
    const staleDate = new Date(staleAt)
    if (Number.isNaN(staleDate.getTime())) return false
    return now.getTime() - staleDate.getTime() >= 24 * 60 * 60 * 1000
  })
  const needsReassignmentDrafts = staleAssignedDrafts.filter((draft) => {
    const ownerUserId = getOpsDraftOwnerUserId(draft)
    if (!ownerUserId) return false
    if (ownershipView === 'mine') return ownerUserId === currentUserId
    return !currentUserId || ownerUserId !== currentUserId
  })

  return {
    overdueDrafts,
    dueSoonDrafts,
    unassignedOverdueDrafts,
    assignedOverdueDrafts,
    mineOverdueDrafts,
    mineDueSoonDrafts,
    staleAssignedDrafts,
    needsReassignmentDrafts,
    topOverdueDraft: overdueDrafts[0] || null,
    topUnassignedOverdueDraft: unassignedOverdueDrafts[0] || null,
    topMineOverdueDraft: mineOverdueDrafts[0] || null,
    topMineDueSoonDraft: mineDueSoonDrafts[0] || null,
    topNeedsReassignmentDraft: needsReassignmentDrafts[0] || null,
  }
}

function buildPublishedSessionSignals(opsSessionDraftQueue: ReturnType<typeof buildOpsSessionDraftQueue>) {
  const archivedDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'archived')?.drafts || []
  const publishedDrafts = archivedDrafts.filter((draft) =>
    !!getOpsSessionDraftPublishMeta(draft)?.publishedPlaySessionId && !!getOpsSessionDraftLiveFeedbackMeta(draft),
  )

  const ranked = [...publishedDrafts].sort((left, right) => {
    const getRank = (draft: OpsSessionDraftItem) => {
      const status = getOpsSessionDraftLiveFeedbackMeta(draft)?.status
      if (status === 'at_risk') return 0
      if (status === 'behind') return 1
      if (status === 'tracking') return 2
      return 3
    }
    const rankDelta = getRank(left) - getRank(right)
    if (rankDelta !== 0) return rankDelta
    const leftDelta = getOpsSessionDraftLiveFeedbackMeta(left)?.occupancyDelta || 0
    const rightDelta = getOpsSessionDraftLiveFeedbackMeta(right)?.occupancyDelta || 0
    return leftDelta - rightDelta
  })

  const atRiskDrafts = ranked.filter((draft) => {
    const status = getOpsSessionDraftLiveFeedbackMeta(draft)?.status
    return status === 'at_risk' || status === 'behind'
  })
  const healthyDrafts = ranked.filter((draft) => {
    const status = getOpsSessionDraftLiveFeedbackMeta(draft)?.status
    return status === 'tracking' || status === 'ahead'
  })

  return {
    publishedDrafts: ranked,
    atRiskDrafts,
    healthyDrafts,
    topAtRiskDraft: atRiskDrafts[0] || null,
    topHealthyDraft: healthyDrafts[0] || null,
  }
}

function getOpsMomentLabel(now: Date) {
  const hour = now.getHours()
  if (hour < 12) return 'before lunch'
  if (hour < 17) return 'this afternoon'
  return 'before close'
}

function buildDailyOpsBrief(args: {
  clubId: string
  now: Date
  actionsToday: number
  pendingActions: PendingAction[]
  autopilotSummary: ReturnType<typeof buildAutopilotSummary>
  programmingCockpit: ReturnType<typeof buildProgrammingCockpit>
  opsSessionDraftQueue: ReturnType<typeof buildOpsSessionDraftQueue>
  sandboxDrafts: AdvisorDraftWorkspaceItem[]
  policyScenarios: AgentPolicyScenario[]
  currentUserId?: string | null
  ownershipView: DailyOwnershipView
  upcomingReminders: Array<{
    itemId: string
    title: string
    label: string
    channel: AdminReminderDeliveryMode
    remindAt: Date
  }>
}): DailyOpsBrief {
  const {
    clubId,
    now,
    actionsToday,
    pendingActions,
    autopilotSummary,
    programmingCockpit,
    opsSessionDraftQueue,
    sandboxDrafts,
    policyScenarios,
    currentUserId,
    ownershipView,
    upcomingReminders,
  } = args

  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const closeTime = new Date(now)
  closeTime.setHours(18, 0, 0, 0)
  const momentLabel = getOpsMomentLabel(now)

  const readyOpsDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'ready_for_ops')?.drafts || []
  const sessionDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'session_draft')?.drafts || []
  const activeOpsDrafts = [...readyOpsDrafts, ...sessionDrafts]
  const opsEscalations = buildOpsEscalationSignals({ opsSessionDraftQueue, currentUserId, ownershipView, now })
  const publishedSignals = buildPublishedSessionSignals(opsSessionDraftQueue)
  const publishedDrafts = publishedSignals.publishedDrafts
  const publishedAtRiskDrafts = publishedSignals.atRiskDrafts
  const topPublishedAtRisk = publishedSignals.topAtRiskDraft
  const topPublishedHealthy = publishedSignals.topHealthyDraft
  const overdueOpsDrafts = activeOpsDrafts.filter((draft) => getOpsDueMeta(draft, now)?.state === 'overdue')
  const dueSoonOpsDrafts = activeOpsDrafts.filter((draft) => getOpsDueMeta(draft, now)?.state === 'due_soon')
  const dueTodayOpsDrafts = activeOpsDrafts.filter((draft) => {
    const state = getOpsDueMeta(draft, now)?.state
    return state === 'overdue' || state === 'due_soon' || state === 'due_today'
  })
  const topUrgentOpsDraft =
    [...activeOpsDrafts].sort((left, right) => getOpsDueRank(left, now) - getOpsDueRank(right, now))[0] || null
  const freshSandboxDrafts = sandboxDrafts.filter((draft) => new Date(draft.updatedAt).getTime() >= dayStart.getTime())
  const remindersBeforeClose = upcomingReminders.filter((reminder) => reminder.remindAt.getTime() <= closeTime.getTime())
  const topBlockedReason = autopilotSummary.topBlockedReasons[0] || null
  const bestScenario = [...policyScenarios].sort((left, right) => right.autoGain - left.autoGain)[0] || null
  const strongestProgramming = programmingCockpit.strongest || null
  const safestProgramming = programmingCockpit.safest || null
  const urgentOpsDraftIds = new Set([
    ...readyOpsDrafts.map((draft) => draft.id),
    ...dueTodayOpsDrafts.map((draft) => draft.id),
  ])
  const urgentCount = pendingActions.length + urgentOpsDraftIds.size + remindersBeforeClose.length + publishedAtRiskDrafts.length
  const blockedCount = autopilotSummary.counts.blocked + autopilotSummary.membershipHeldCount

  const headline = urgentCount > 0
    ? `${urgentCount} operator move${urgentCount === 1 ? '' : 's'} need attention ${momentLabel}`
    : `The board looks clear ${momentLabel}`

  const summary = [
    `${actionsToday} agent action${actionsToday === 1 ? '' : 's'} landed today`,
    freshSandboxDrafts.length > 0 ? `${freshSandboxDrafts.length} fresh sandbox preview${freshSandboxDrafts.length === 1 ? '' : 's'} are ready` : null,
    sessionDrafts.length > 0 ? `${sessionDrafts.length} internal session draft${sessionDrafts.length === 1 ? '' : 's'} are already staged` : null,
    publishedDrafts.length > 0
      ? `${publishedDrafts.length} published session${publishedDrafts.length === 1 ? '' : 's'} are feeding back into the agent now`
      : null,
    ownershipView === 'mine' && opsEscalations.mineOverdueDrafts.length > 0
      ? `${opsEscalations.mineOverdueDrafts.length} of your draft${opsEscalations.mineOverdueDrafts.length === 1 ? ' is' : 's are'} overdue`
      : ownershipView === 'team' && opsEscalations.unassignedOverdueDrafts.length > 0
        ? `${opsEscalations.unassignedOverdueDrafts.length} overdue ops draft${opsEscalations.unassignedOverdueDrafts.length === 1 ? '' : 's'} still have no owner`
        : null,
    publishedAtRiskDrafts.length > 0
      ? `${publishedAtRiskDrafts.length} published session${publishedAtRiskDrafts.length === 1 ? ' is' : 's are'} trailing plan`
      : null,
    overdueOpsDrafts.length > 0
      ? `${overdueOpsDrafts.length} ops draft${overdueOpsDrafts.length === 1 ? ' is' : 's are'} overdue`
      : dueSoonOpsDrafts.length > 0
        ? `${dueSoonOpsDrafts.length} ops draft${dueSoonOpsDrafts.length === 1 ? '' : 's'} are due soon`
        : null,
    blockedCount > 0 ? `${blockedCount} path${blockedCount === 1 ? ' is' : 's are'} still blocked` : 'no major autopilot blockers are showing right now',
  ].filter(Boolean).join(', ') + '.'

  const cards: DailyOpsBriefCard[] = [
    {
      id: 'ops-brief-changes',
      eyebrow: 'What changed',
      title: actionsToday > 0 ? 'The agent already moved the day forward' : 'The agent has not moved much yet today',
      description: actionsToday > 0
        ? 'Use this as the fast read on what the system already prepared before you start making manual decisions.'
        : 'This is a quieter day so far, which makes it a good window to review drafts and set up the next push.',
      ctaLabel: topPublishedHealthy
        ? 'Review live winner'
        : freshSandboxDrafts.length > 0 ? 'Open preview inbox' : sessionDrafts.length > 0 ? 'Open session drafts' : 'Open agent cockpit',
      href: topPublishedHealthy
        ? buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            opsDraftId: topPublishedHealthy.id,
            day: topPublishedHealthy.dayOfWeek,
          })
        : freshSandboxDrafts.length > 0
          ? buildAgentFocusHref(clubId, { focus: 'preview-inbox' })
        : sessionDrafts.length > 0
          ? buildAgentFocusHref(clubId, { focus: 'ops-queue', opsDraftId: sessionDrafts[0]?.id, day: sessionDrafts[0]?.dayOfWeek })
          : `/clubs/${clubId}/intelligence/agent`,
      tone: actionsToday > 0 ? 'success' : 'default',
      count: actionsToday,
      bullets: [
        `${actionsToday} action${actionsToday === 1 ? '' : 's'} already landed today`,
        `${freshSandboxDrafts.length} preview${freshSandboxDrafts.length === 1 ? '' : 's'} refreshed today`,
        `${sessionDrafts.length} internal session draft${sessionDrafts.length === 1 ? '' : 's'} already in ops`,
        topPublishedHealthy
          ? `${topPublishedHealthy.title} is ${getOpsSessionLiveFeedbackTone(getOpsSessionDraftLiveFeedbackMeta(topPublishedHealthy)?.status).label.toLowerCase()}`
          : `${publishedDrafts.length} published session${publishedDrafts.length === 1 ? '' : 's'} are sending live feedback back to the agent`,
      ],
      secondaryActions: [
        topPublishedHealthy ? {
          label: 'Open live winner',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            opsDraftId: topPublishedHealthy.id,
            day: topPublishedHealthy.dayOfWeek,
          }),
          tone: 'success' as const,
        } : null,
        topPublishedHealthy ? {
          label: 'Repeat this slot',
          href: buildPublishedSessionRepeatHref(clubId, topPublishedHealthy),
          tone: 'success' as const,
        } : null,
        sessionDrafts.length > 0 ? {
          label: 'Open session drafts',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            opsDraftId: sessionDrafts[0]?.id,
            day: sessionDrafts[0]?.dayOfWeek,
          }),
          tone: 'default' as const,
        } : null,
        {
          label: 'Open agent',
          href: `/clubs/${clubId}/intelligence/agent`,
          tone: 'default' as const,
        },
      ].filter(Boolean) as DailyOpsBriefCard['secondaryActions'],
    },
    {
      id: 'ops-brief-before-close',
      eyebrow: 'Before close',
      title: ownershipView === 'mine' && opsEscalations.mineOverdueDrafts.length > 0
        ? `${opsEscalations.mineOverdueDrafts.length} of your ops draft${opsEscalations.mineOverdueDrafts.length === 1 ? ' is' : 's are'} already overdue`
        : ownershipView === 'team' && opsEscalations.unassignedOverdueDrafts.length > 0
          ? `${opsEscalations.unassignedOverdueDrafts.length} overdue ops draft${opsEscalations.unassignedOverdueDrafts.length === 1 ? ' still has' : 's still have'} no owner`
        : topPublishedAtRisk
          ? `${topPublishedAtRisk.title} is slipping behind live plan`
        : overdueOpsDrafts.length > 0
        ? `${overdueOpsDrafts.length} ops draft${overdueOpsDrafts.length === 1 ? ' is' : 's are'} already overdue`
        : dueSoonOpsDrafts.length > 0
          ? `${dueSoonOpsDrafts.length} ops draft${dueSoonOpsDrafts.length === 1 ? ' is' : 's are'} heating up in the next two hours`
          : urgentCount > 0
            ? 'A few items still want a same-day decision'
            : 'Nothing urgent is piling up before close',
      description: ownershipView === 'mine' && opsEscalations.topMineOverdueDraft
        ? `${opsEscalations.topMineOverdueDraft.title} is already past due, so the agent is putting your own queue ahead of the rest of the club.`
        : ownershipView === 'team' && opsEscalations.topUnassignedOverdueDraft
          ? `${opsEscalations.topUnassignedOverdueDraft.title} is overdue and still unassigned, which is usually a sign the team needs a faster owner handoff.`
        : topPublishedAtRisk
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.summary || `${topPublishedAtRisk.title} is lagging live bookings.`} The agent is surfacing it before close so you can decide whether it needs a fill push or same-day ops intervention.`
        : overdueOpsDrafts.length > 0
        ? 'These drafts are already past their due time, so the agent is surfacing them ahead of less urgent queue work.'
        : dueSoonOpsDrafts.length > 0
          ? 'These drafts are about to go stale before close unless someone takes ownership or moves them forward.'
          : urgentCount > 0
            ? 'These are the items most likely to drift if nobody clears them before the club hits the evening window.'
        : 'The board is relatively clear, so you can safely keep focus on strategy and tomorrow’s setup.',
      ctaLabel: pendingActions.length > 0
        ? 'Open pending actions'
        : topPublishedAtRisk
          ? 'Review published session'
          : topUrgentOpsDraft ? 'Open ops queue' : 'Stay in agent',
      href: pendingActions.length > 0
        ? buildAgentFocusHref(clubId, { focus: 'pending-queue' })
        : topPublishedAtRisk
          ? buildAgentFocusHref(clubId, {
              focus: 'ops-queue',
              opsDraftId: topPublishedAtRisk.id,
              day: topPublishedAtRisk.dayOfWeek,
            })
        : topUrgentOpsDraft
          ? buildAgentFocusHref(clubId, { focus: 'ops-queue', opsDraftId: topUrgentOpsDraft.id, day: topUrgentOpsDraft.dayOfWeek })
          : `/clubs/${clubId}/intelligence/agent`,
      tone: overdueOpsDrafts.length > 0 || topPublishedAtRisk?.metadata?.sessionDraft?.liveFeedback?.status === 'at_risk' ? 'danger' : urgentCount > 0 ? 'warn' : 'success',
      count: topPublishedAtRisk
        ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.actualOccupancy || 0}%`
        : overdueOpsDrafts.length > 0 ? overdueOpsDrafts.length : urgentCount,
      bullets: [
        `${pendingActions.length} approval${pendingActions.length === 1 ? '' : 's'} still waiting`,
        topPublishedAtRisk
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.actualOccupancy || 0}% live fill vs ${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.projectedOccupancy || 0}% projected`
          : null,
        ownershipView === 'mine' && opsEscalations.mineOverdueDrafts.length > 0
          ? `${opsEscalations.mineOverdueDrafts.length} of your draft${opsEscalations.mineOverdueDrafts.length === 1 ? '' : 's'} are overdue`
          : ownershipView === 'team' && opsEscalations.unassignedOverdueDrafts.length > 0
            ? `${opsEscalations.unassignedOverdueDrafts.length} overdue ops draft${opsEscalations.unassignedOverdueDrafts.length === 1 ? '' : 's'} still need an owner`
        : overdueOpsDrafts.length > 0
          ? `${overdueOpsDrafts.length} ops draft${overdueOpsDrafts.length === 1 ? '' : 's'} are overdue`
          : dueSoonOpsDrafts.length > 0
            ? `${dueSoonOpsDrafts.length} ops draft${dueSoonOpsDrafts.length === 1 ? '' : 's'} are due soon`
            : `${readyOpsDrafts.length} ready-for-ops draft${readyOpsDrafts.length === 1 ? '' : 's'} can move today`,
        `${remindersBeforeClose.length} snoozed reminder${remindersBeforeClose.length === 1 ? '' : 's'} come back before close`,
      ].filter(Boolean) as string[],
      secondaryActions: [
        topPublishedAtRisk ? {
          label: 'Open published draft',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            opsDraftId: topPublishedAtRisk.id,
            day: topPublishedAtRisk.dayOfWeek,
          }),
          tone: getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.status === 'at_risk' ? 'danger' as const : 'warn' as const,
        } : null,
        topUrgentOpsDraft ? {
          label: 'Open ops queue',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            opsDraftId: topUrgentOpsDraft.id,
            day: topUrgentOpsDraft.dayOfWeek,
          }),
          tone: overdueOpsDrafts.length > 0 ? 'danger' as const : 'warn' as const,
        } : null,
        {
          label: 'Review daily to-do',
          href: `/clubs/${clubId}/intelligence/agent`,
          tone: 'default' as const,
        },
      ].filter(Boolean) as DailyOpsBriefCard['secondaryActions'],
      workflowActions: topUrgentOpsDraft ? [
        ...(topUrgentOpsDraft.status === 'ready_for_ops'
          ? [{
              label: 'Convert top draft',
              action: 'promote' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: 'success' as const,
            }]
          : []),
        {
          label: 'Assign to me',
          action: 'assign_self',
          opsDraftId: topUrgentOpsDraft.id,
          tone: 'default' as const,
        },
        ...(ownershipView === 'team'
          ? [{
              label: 'Assign teammate',
              action: 'assign_teammate' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: 'default' as const,
            }]
          : []),
        ...(ownershipView === 'team' && getOpsWorkflowMeta(topUrgentOpsDraft)?.ownerUserId
          ? [{
              label: 'Ping owner',
              action: 'ping_owner' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: 'warn' as const,
            }]
          : []),
        ...(!getOpsWorkflowMeta(topUrgentOpsDraft)?.dueAt
          ? [{
              label: 'Due today',
              action: 'due_today' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: overdueOpsDrafts.length > 0 ? 'danger' as const : 'warn' as const,
            }]
          : []),
        ...(topUrgentOpsDraft.status === 'session_draft'
          ? [getOpsSessionDraftPublishMeta(topUrgentOpsDraft)?.publishedPlaySessionId
              ? null
              : getOpsSessionDraftPublishMeta(topUrgentOpsDraft)?.targetDate
                && getOpsSessionDraftPublishReviewMeta(topUrgentOpsDraft)?.status !== 'blocked'
                ? {
                    label: 'Publish now',
                    action: 'publish_now' as const,
                    opsDraftId: topUrgentOpsDraft.id,
                    tone: 'success' as const,
                  }
                : {
                    label: 'Prepare publish',
                    action: 'prepare_publish' as const,
                    opsDraftId: topUrgentOpsDraft.id,
                    tone: 'success' as const,
                  }]
          : []),
        {
          label: 'Add note',
          action: 'add_note',
          opsDraftId: topUrgentOpsDraft.id,
          tone: 'default' as const,
        },
        {
          label: 'Reject',
          action: 'reject',
          opsDraftId: topUrgentOpsDraft.id,
          tone: 'danger' as const,
        },
      ].filter(Boolean) as DailyOpsBriefCard['workflowActions'] : undefined,
    },
    {
      id: 'ops-brief-risk',
      eyebrow: 'At risk',
      title: topPublishedAtRisk
        ? 'A published session is now underperforming'
        : ownershipView === 'team' && opsEscalations.needsReassignmentDrafts.length > 0
        ? 'A few owned drafts may need attention or reassignment'
        : blockedCount > 0 ? 'A few blockers are still shaping today’s ceiling' : 'No major blockers are pressuring the day',
      description: topPublishedAtRisk
        ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.summary || `${topPublishedAtRisk.title} is underperforming live.`} ${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.recommendedAction || 'The agent wants this reviewed before it drifts further.'}`
        : ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft
        ? `${opsEscalations.topNeedsReassignmentDraft.title} has been sitting with ${getOpsWorkflowMeta(opsEscalations.topNeedsReassignmentDraft)?.ownerLabel || 'its owner'} long enough that the handoff may be stalling.`
        : blockedCount > 0
        ? topBlockedReason
          ? `${topBlockedReason.label} is the strongest drag on agent throughput right now.`
          : 'A chunk of work is still being held back by policy, confidence, or missing member signals.'
        : 'The biggest risk today is mostly execution bandwidth, not policy or routing friction.',
      ctaLabel: topPublishedAtRisk
        ? 'Review published draft'
        : ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft
        ? 'Open ops queue'
        : blockedCount > 0
        ? (topBlockedReason && isMembershipReason(topBlockedReason.label) ? 'Open integrations' : 'Open settings')
        : 'Open advisor',
      href: topPublishedAtRisk
        ? buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: topPublishedAtRisk.dayOfWeek,
            opsDraftId: topPublishedAtRisk.id,
          })
        : ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft
        ? buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: opsEscalations.topNeedsReassignmentDraft.dayOfWeek,
            opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          })
        : blockedCount > 0
        ? (topBlockedReason && isMembershipReason(topBlockedReason.label)
          ? `/clubs/${clubId}/intelligence/integrations`
          : `/clubs/${clubId}/intelligence/settings`)
        : `/clubs/${clubId}/intelligence/advisor`,
      tone: topPublishedAtRisk
        ? getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.status === 'at_risk' ? 'danger' : 'warn'
        : ownershipView === 'team' && opsEscalations.needsReassignmentDrafts.length > 0
        ? 'warn'
        : blockedCount > 0 ? 'danger' : 'success',
      count: topPublishedAtRisk
        ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.spotsRemaining || 0} spots`
        : ownershipView === 'team' && opsEscalations.needsReassignmentDrafts.length > 0
        ? opsEscalations.needsReassignmentDrafts.length
        : blockedCount,
      bullets: [
        topPublishedAtRisk
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.confirmedCount || 0} confirmed players with ${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.spotsRemaining || 0} spot${(getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.spotsRemaining || 0) === 1 ? '' : 's'} still open`
          : ownershipView === 'team' && opsEscalations.needsReassignmentDrafts.length > 0
          ? `${opsEscalations.needsReassignmentDrafts.length} owned draft${opsEscalations.needsReassignmentDrafts.length === 1 ? '' : 's'} look stale enough to check`
          : `${autopilotSummary.counts.blocked} action${autopilotSummary.counts.blocked === 1 ? '' : 's'} recently blocked`,
        topPublishedAtRisk
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.waitlistCount || 0} on the waitlist / same-week backup list`
          : `${autopilotSummary.counts.blocked} action${autopilotSummary.counts.blocked === 1 ? '' : 's'} recently blocked`,
        topPublishedAtRisk
          ? `${publishedAtRiskDrafts.length} published session${publishedAtRiskDrafts.length === 1 ? '' : 's'} are currently behind or at risk`
          : `${autopilotSummary.membershipHeldCount} membership-held case${autopilotSummary.membershipHeldCount === 1 ? '' : 's'} need cleaner data or policy`,
        topPublishedAtRisk
          ? getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.recommendedAction || 'Review whether this live session now needs a fill action.'
          : ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft
          ? `Top handoff risk: ${getOpsWorkflowMeta(opsEscalations.topNeedsReassignmentDraft)?.ownerLabel || 'Owned draft'} may need a reset`
          : topBlockedReason ? `Top blocker: ${topBlockedReason.label}` : 'Top blocker: none right now',
      ],
      secondaryActions: [
        topPublishedAtRisk ? {
          label: 'Open schedule',
          href: `/clubs/${clubId}/intelligence/sessions`,
          tone: 'default' as const,
        } : null,
        topPublishedAtRisk ? {
          label: 'Prepare fill in Advisor',
          href: buildPublishedSessionFillHref(clubId, topPublishedAtRisk),
          tone: 'warn' as const,
        } : null,
        {
          label: 'Ask Advisor',
          href: blockedCount > 0
            ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(
              topBlockedReason && isMembershipReason(topBlockedReason.label)
                ? 'Show me the safest way to reduce today’s membership-related blockers without making the club too aggressive.'
                : 'Show me the safest change to reduce today’s blocked agent work without losing guardrails.',
            )}`
            : `/clubs/${clubId}/intelligence/advisor`,
          tone: blockedCount > 0 ? 'danger' as const : 'default' as const,
        },
      ].filter(Boolean) as DailyOpsBriefCard['secondaryActions'],
      workflowActions: topPublishedAtRisk ? [
        {
          label: 'Create fill draft',
          action: 'create_fill_draft',
          opsDraftId: topPublishedAtRisk.id,
          tone: getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.status === 'at_risk' ? 'danger' as const : 'warn' as const,
        },
        ...(ownershipView === 'team' && getOpsWorkflowMeta(topPublishedAtRisk)?.ownerUserId
          ? [{
              label: 'Ping owner',
              action: 'ping_owner' as const,
              opsDraftId: topPublishedAtRisk.id,
              tone: 'warn' as const,
            }]
          : []),
        {
          label: 'Add note',
          action: 'add_note',
          opsDraftId: topPublishedAtRisk.id,
          tone: 'default' as const,
        },
      ] : ownershipView === 'team' && opsEscalations.topNeedsReassignmentDraft ? [
        {
          label: 'Ping owner',
          action: 'ping_owner',
          opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          tone: 'warn' as const,
        },
        {
          label: 'Reassign owner',
          action: 'reassign_owner',
          opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          tone: 'warn' as const,
        },
        {
          label: 'Assign teammate',
          action: 'assign_teammate',
          opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          tone: 'default' as const,
        },
        {
          label: 'Add note',
          action: 'add_note',
          opsDraftId: opsEscalations.topNeedsReassignmentDraft.id,
          tone: 'default' as const,
        },
      ] : undefined,
    },
    {
      id: 'ops-brief-upside',
      eyebrow: 'Best high-upside move',
      title: strongestProgramming
        ? strongestProgramming.primary.title
        : bestScenario && bestScenario.autoGain > 0
          ? `Unlock ${actionLabel(bestScenario.action).toLowerCase()} next`
          : 'Advisor can shape the next move',
      description: strongestProgramming
        ? 'This is the strongest schedule opportunity the agent sees right now based on demand, occupancy, and recent signals.'
        : bestScenario && bestScenario.autoGain > 0
          ? `${bestScenario.autoGain} recent actions could likely move into auto-run with a safe policy adjustment.`
          : 'There is no single dominant move yet, so Advisor is the best place to ask for a tailored next step.',
      ctaLabel: strongestProgramming
        ? 'Open programming cockpit'
        : bestScenario && bestScenario.autoGain > 0
          ? 'Apply in Advisor'
          : 'Open Advisor',
      href: strongestProgramming
        ? buildAgentFocusHref(clubId, {
          focus: 'programming-cockpit',
          day: strongestProgramming.primary.dayOfWeek,
          draftId: strongestProgramming.id,
        })
        : bestScenario && bestScenario.autoGain > 0
          ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(buildAdvisorPolicyPrompt(bestScenario))}`
          : `/clubs/${clubId}/intelligence/advisor`,
      tone: 'default',
      count: strongestProgramming
        ? `${strongestProgramming.primary.projectedOccupancy}%`
        : bestScenario && bestScenario.autoGain > 0
          ? bestScenario.autoGain
          : null,
      bullets: strongestProgramming
        ? [
          `${strongestProgramming.primary.estimatedInterestedMembers} likely interested members`,
          `${strongestProgramming.primary.projectedOccupancy}% projected fill`,
          strongestProgramming.primary.conflict
            ? `${getProgrammingConflictTone(strongestProgramming.primary.conflict.overallRisk).label} in this window`
            : `${strongestProgramming.primary.confidence}% confidence`,
        ]
        : bestScenario && bestScenario.autoGain > 0
        ? [
            `${bestScenario.autoGain} actions could move to auto`,
            `${bestScenario.stillPending} would still stay review-first`,
            `${bestScenario.stillBlocked} would still remain blocked`,
          ]
          : ['No single move dominates yet', 'Advisor can tailor the next plan from context', 'Good moment for a custom ask'],
      secondaryActions: strongestProgramming
        ? [
            {
              label: 'Refine in Advisor',
              href: buildAdvisorDraftRefineHref(
                clubId,
                {
                  conversationId: strongestProgramming.conversationId || null,
                  originalIntent: strongestProgramming.originalIntent,
                },
                `Refine this programming plan for ${strongestProgramming.primary.dayOfWeek} and show me one safer alternative before we move it into ops.`,
              ),
              tone: 'default',
            },
          ]
        : bestScenario && bestScenario.autoGain > 0
          ? [
              {
                label: 'Open settings',
                href: `/clubs/${clubId}/intelligence/settings`,
                tone: 'default',
              },
            ]
          : [
              {
                label: 'Review in Advisor',
                href: `/clubs/${clubId}/intelligence/advisor`,
                tone: 'default',
              },
            ],
    },
    {
      id: 'ops-brief-safe',
      eyebrow: 'Best safe move',
      title: safestProgramming
        ? safestProgramming.id === strongestProgramming?.id
          ? `${safestProgramming.primary.title} is also the cleanest window`
          : safestProgramming.primary.title
        : bestScenario && bestScenario.autoGain > 0
          ? 'Take the safer policy route first'
          : 'Keep the next move review-first',
      description: safestProgramming
        ? safestProgramming.id === strongestProgramming?.id
          ? 'The top upside idea is already the cleanest operational shape, so the club does not need to trade safety for upside here.'
          : safestProgramming.primary.conflict?.riskSummary || 'This is the cleanest programming option on the board right now if you want the lowest-friction next move.'
        : bestScenario && bestScenario.autoGain > 0
          ? 'If you want the safer path, keep policy review-first and let Advisor tighten the change before you widen autonomy.'
          : 'No obvious low-risk programming move is standing out yet, so keeping the next change in review is still the safer path.',
      ctaLabel: safestProgramming
        ? 'Review safer option'
        : bestScenario && bestScenario.autoGain > 0
          ? 'Refine in Advisor'
          : 'Open Advisor',
      href: safestProgramming
        ? buildAgentFocusHref(clubId, {
          focus: 'programming-cockpit',
          day: safestProgramming.primary.dayOfWeek,
          draftId: safestProgramming.id,
        })
        : bestScenario && bestScenario.autoGain > 0
          ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent('Show me the safest version of this policy change first, even if it keeps more work in review.')}`
          : `/clubs/${clubId}/intelligence/advisor`,
      tone: safestProgramming
        ? safestProgramming.primary.conflict?.overallRisk === 'high'
          ? 'warn'
          : 'success'
        : 'default',
      count: safestProgramming
        ? getProgrammingConflictTone(safestProgramming.primary.conflict?.overallRisk).label
        : null,
      bullets: safestProgramming
        ? [
            safestProgramming.primary.conflict?.riskSummary || 'Cleaner schedule shape than the surrounding options.',
            safestProgramming.primary.conflict?.saferAlternativeReason || `${safestProgramming.primary.confidence}% confidence with ${safestProgramming.primary.projectedOccupancy}% projected fill`,
            strongestProgramming && safestProgramming.id !== strongestProgramming.id
              ? `${safestProgramming.primary.projectedOccupancy - strongestProgramming.primary.projectedOccupancy >= 0 ? '+' : ''}${safestProgramming.primary.projectedOccupancy - strongestProgramming.primary.projectedOccupancy} fill pts vs the highest-upside option`
              : `${safestProgramming.primary.estimatedInterestedMembers} likely interested members`,
          ]
        : bestScenario && bestScenario.autoGain > 0
          ? [
              'Keep the change in review-first mode',
              `${bestScenario.stillPending} actions would still wait for approval`,
              'Advisor can tighten the policy before any live rollout',
            ]
          : ['No low-risk move dominates yet', 'Good moment to compare alternatives', 'Advisor can help narrow the safest next step'],
      secondaryActions: safestProgramming
        ? [
            safestProgramming.id !== strongestProgramming?.id
              ? {
                  label: 'Open high-upside move',
                  href: buildAgentFocusHref(clubId, {
                    focus: 'programming-cockpit',
                    day: strongestProgramming?.primary.dayOfWeek,
                    draftId: strongestProgramming?.id,
                  }),
                  tone: 'default' as const,
                }
              : null,
            {
              label: 'Refine in Advisor',
              href: buildAdvisorDraftRefineHref(
                clubId,
                {
                  conversationId: safestProgramming.conversationId || null,
                  originalIntent: safestProgramming.originalIntent,
                },
                safestProgramming.id === strongestProgramming?.id
                  ? `Keep this programming plan in the same window, but make it even safer operationally before we move it into ops.`
                  : `Refine this programming plan around the safer alternative for ${safestProgramming.primary.dayOfWeek} and explain what risk it avoids.`,
              ),
              tone: 'success' as const,
            },
          ].filter(Boolean) as DailyOpsBriefCard['secondaryActions']
        : bestScenario && bestScenario.autoGain > 0
          ? [
              {
                label: 'Open settings',
                href: `/clubs/${clubId}/intelligence/settings`,
                tone: 'default',
              },
            ]
          : [
              {
                label: 'Review in Advisor',
                href: `/clubs/${clubId}/intelligence/advisor`,
                tone: 'default',
              },
            ],
    },
  ]

  return {
    headline,
    summary,
    cards,
  }
}

function buildUnifiedDailyCommandCenter(args: {
  clubId: string
  pendingActions: PendingAction[]
  autopilotSummary: ReturnType<typeof buildAutopilotSummary>
  programmingCockpit: ReturnType<typeof buildProgrammingCockpit>
  opsSessionDraftQueue: ReturnType<typeof buildOpsSessionDraftQueue>
  sandboxDrafts: AdvisorDraftWorkspaceItem[]
  currentUserId?: string | null
  ownershipView: DailyOwnershipView
  upcomingReminders: Array<{
    itemId: string
    title: string
    label: string
    channel: AdminReminderDeliveryMode
    remindAt: Date
  }>
}): DailyCommandCenter {
  const {
    clubId,
    pendingActions,
    autopilotSummary,
    programmingCockpit,
    opsSessionDraftQueue,
    sandboxDrafts,
    currentUserId,
    ownershipView,
    upcomingReminders,
  } = args

  const now = new Date()
  const closeTime = new Date(now)
  closeTime.setHours(18, 0, 0, 0)

  const readyOpsDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'ready_for_ops')?.drafts || []
  const sessionDrafts = opsSessionDraftQueue.find((stage) => stage.key === 'session_draft')?.drafts || []
  const activeOpsDrafts = [...readyOpsDrafts, ...sessionDrafts]
  const topUrgentOpsDraft =
    [...activeOpsDrafts].sort((left, right) => getOpsDueRank(left, now) - getOpsDueRank(right, now))[0] || null
  const opsEscalations = buildOpsEscalationSignals({ opsSessionDraftQueue, currentUserId, ownershipView, now })
  const publishedSignals = buildPublishedSessionSignals(opsSessionDraftQueue)
  const publishedDrafts = publishedSignals.publishedDrafts
  const topPublishedAtRisk = publishedSignals.topAtRiskDraft
  const topPublishedHealthy = publishedSignals.topHealthyDraft
  const remindersBeforeClose = upcomingReminders.filter((reminder) => reminder.remindAt.getTime() <= closeTime.getTime())
  const freshSandboxDrafts = [...sandboxDrafts]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const strongestProgramming = programmingCockpit.strongest || null
  const safestProgramming = programmingCockpit.safest || null
  const blockedCount = autopilotSummary.counts.blocked + autopilotSummary.membershipHeldCount

  const headline = topPublishedAtRisk
    ? 'Run the live session, approvals, and ops queue from one command surface'
    : pendingActions.length > 0 || topUrgentOpsDraft || strongestProgramming || remindersBeforeClose.length > 0
      ? 'The key approvals, live feedback, ops work, and reminders are now in one lane'
      : 'The board is quiet enough to steer tomorrow from one command surface'

  const summary = [
    `${pendingActions.length} approval${pendingActions.length === 1 ? '' : 's'} waiting`,
    topPublishedAtRisk
      ? `${topPublishedAtRisk.title} is trailing live plan`
      : publishedDrafts.length > 0
        ? `${publishedDrafts.length} published session${publishedDrafts.length === 1 ? '' : 's'} are feeding back`
        : 'no live schedule issues are pressing right now',
    topUrgentOpsDraft
      ? `${topUrgentOpsDraft.title} is the top ops handoff`
      : `${readyOpsDrafts.length} ready ops draft${readyOpsDrafts.length === 1 ? '' : 's'} are staged`,
    strongestProgramming
      ? `${strongestProgramming.primary.title} is the strongest next programming move`
      : 'no programming pressure is building right now',
    remindersBeforeClose.length > 0
      ? `${remindersBeforeClose.length} reminder${remindersBeforeClose.length === 1 ? '' : 's'} return before close`
      : `${freshSandboxDrafts.length} fresh sandbox preview${freshSandboxDrafts.length === 1 ? '' : 's'} ready`,
  ].join(' · ') + '.'

  const modules: DailyOpsBriefCard[] = [
    {
      id: 'command-center-approvals',
      eyebrow: 'Approvals',
      title: pendingActions.length > 0
        ? `${pendingActions.length} action${pendingActions.length === 1 ? '' : 's'} still need a human`
        : 'Approval lane is clear',
      description: pendingActions.length > 0
        ? 'This is the fastest place to clear review-only actions before they start clogging the rest of the day.'
        : 'Nothing is stuck waiting for approval right now, so you can keep focus on ops and live sessions.',
      ctaLabel: pendingActions.length > 0 ? 'Open pending actions' : 'Open agent',
      href: pendingActions.length > 0
        ? buildAgentFocusHref(clubId, { focus: 'pending-queue' })
        : `/clubs/${clubId}/intelligence/agent`,
      tone: pendingActions.length > 0 ? 'warn' : 'success',
      count: pendingActions.length,
      bullets: [
        `${autopilotSummary.counts.pending} item${autopilotSummary.counts.pending === 1 ? '' : 's'} currently in review`,
        blockedCount > 0
          ? `${blockedCount} blocked path${blockedCount === 1 ? '' : 's'} still shaping throughput`
          : 'No major autopilot blockers attached to the current queue',
        pendingActions.length > 0
          ? 'Clearing approvals first keeps the ops queue from drifting later in the day'
          : 'The approval lane is not the bottleneck today',
      ],
      secondaryActions: [
        {
          label: 'Open Advisor',
          href: `/clubs/${clubId}/intelligence/advisor`,
          tone: 'default',
        },
      ],
    },
    {
      id: 'command-center-live',
      eyebrow: 'Live sessions',
      title: topPublishedAtRisk
        ? 'A published session wants intervention'
        : topPublishedHealthy
          ? 'One live session is outperforming plan'
          : publishedDrafts.length > 0
            ? 'Published sessions are feeding live outcomes back'
            : 'No published-session aftercare is pressing right now',
      description: topPublishedAtRisk
        ? getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.summary
          || `${topPublishedAtRisk.title} is underperforming live and likely needs the next operator move from this command surface.`
        : topPublishedHealthy
          ? getOpsSessionDraftLiveFeedbackMeta(topPublishedHealthy)?.summary
            || `${topPublishedHealthy.title} is outperforming plan and is a good candidate to repeat or expand.`
          : publishedDrafts.length > 0
            ? `${publishedDrafts.length} published session${publishedDrafts.length === 1 ? '' : 's'} are sending live feedback back to the agent.`
            : 'Once a session is live, its drift and outcomes will show up here first.',
      ctaLabel: topPublishedAtRisk
        ? 'Review live session'
        : topPublishedHealthy
          ? 'Open live winner'
          : publishedDrafts.length > 0
            ? 'Open published drafts'
            : 'Open schedule',
      href: topPublishedAtRisk
        ? buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: topPublishedAtRisk.dayOfWeek,
            opsDraftId: topPublishedAtRisk.id,
          })
        : topPublishedHealthy
          ? buildAgentFocusHref(clubId, {
              focus: 'ops-queue',
              day: topPublishedHealthy.dayOfWeek,
              opsDraftId: topPublishedHealthy.id,
            })
          : publishedDrafts.length > 0
            ? buildAgentFocusHref(clubId, {
                focus: 'ops-queue',
                day: publishedDrafts[0]?.dayOfWeek,
                opsDraftId: publishedDrafts[0]?.id,
              })
            : `/clubs/${clubId}/intelligence/sessions`,
      tone: topPublishedAtRisk
        ? getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.status === 'at_risk' ? 'danger' : 'warn'
        : topPublishedHealthy ? 'success' : 'default',
      count: topPublishedAtRisk
        ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.actualOccupancy || 0}%`
        : topPublishedHealthy
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedHealthy)?.actualOccupancy || 0}%`
          : publishedDrafts.length,
      bullets: [
        topPublishedAtRisk
          ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.confirmedCount || 0} confirmed with ${getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.spotsRemaining || 0} spot${(getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.spotsRemaining || 0) === 1 ? '' : 's'} still open`
          : topPublishedHealthy
            ? `${getOpsSessionDraftLiveFeedbackMeta(topPublishedHealthy)?.confirmedCount || 0} confirmed players and ${getOpsSessionDraftLiveFeedbackMeta(topPublishedHealthy)?.waitlistCount || 0} on the waitlist`
            : `${publishedDrafts.length} published session${publishedDrafts.length === 1 ? '' : 's'} currently tracked by aftercare`,
        topPublishedAtRisk
          ? getOpsSessionDraftLiveFeedbackMeta(topPublishedAtRisk)?.recommendedAction || 'Review whether this live session now needs a fill action.'
          : topPublishedHealthy
            ? 'This is the best live signal to repeat if you want a safe win next week.'
            : 'Live edit and rollback stay available from the same published-draft queue.',
      ],
      secondaryActions: [
        topPublishedAtRisk ? {
          label: 'Open schedule',
          href: `/clubs/${clubId}/intelligence/sessions`,
          tone: 'default' as const,
        } : null,
        topPublishedHealthy ? {
          label: 'Repeat this slot',
          href: buildPublishedSessionRepeatHref(clubId, topPublishedHealthy),
          tone: 'success' as const,
        } : null,
      ].filter(Boolean) as DailyOpsBriefCard['secondaryActions'],
      workflowActions: topPublishedAtRisk ? [
        {
          label: 'Create fill draft',
          action: 'create_fill_draft',
          opsDraftId: topPublishedAtRisk.id,
          tone: 'warn' as const,
        },
      ] : undefined,
    },
    {
      id: 'command-center-ops',
      eyebrow: 'Ops queue',
      title: ownershipView === 'mine' && opsEscalations.topMineOverdueDraft
        ? 'Your top overdue draft needs a decision'
        : ownershipView === 'team' && opsEscalations.topUnassignedOverdueDraft
          ? 'An overdue draft still needs an owner'
          : topUrgentOpsDraft
            ? 'One ops draft is the clearest next handoff'
            : 'Ops queue is staged but not pressuring the day',
      description: ownershipView === 'mine' && opsEscalations.topMineOverdueDraft
        ? `${opsEscalations.topMineOverdueDraft.title} is already past due, so the command center is putting your own queue first.`
        : ownershipView === 'team' && opsEscalations.topUnassignedOverdueDraft
          ? `${opsEscalations.topUnassignedOverdueDraft.title} is overdue and still unassigned, which usually means the team needs a faster owner handoff.`
          : topUrgentOpsDraft
            ? `${topUrgentOpsDraft.title} is the top operational draft to push from idea into scheduling work.`
            : 'Ready-for-ops and session-draft work will surface here once the queue heats up.',
      ctaLabel: topUrgentOpsDraft ? 'Open ops queue' : 'Open agent',
      href: topUrgentOpsDraft
        ? buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: topUrgentOpsDraft.dayOfWeek,
            opsDraftId: topUrgentOpsDraft.id,
          })
        : `/clubs/${clubId}/intelligence/agent`,
      tone: ownershipView === 'mine' && opsEscalations.topMineOverdueDraft
        ? 'danger'
        : ownershipView === 'team' && opsEscalations.topUnassignedOverdueDraft
          ? 'danger'
          : topUrgentOpsDraft
            ? 'success'
            : 'default',
      count: topUrgentOpsDraft ? getOpsWorkflowDueLabel(topUrgentOpsDraft) || topUrgentOpsDraft.status : readyOpsDrafts.length + sessionDrafts.length,
      bullets: [
        `${readyOpsDrafts.length} ready-for-ops draft${readyOpsDrafts.length === 1 ? '' : 's'}`,
        `${sessionDrafts.length} session draft${sessionDrafts.length === 1 ? '' : 's'} in manual scheduling`,
        ownershipView === 'team'
          ? `${opsEscalations.needsReassignmentDrafts.length} stale owned draft${opsEscalations.needsReassignmentDrafts.length === 1 ? '' : 's'} may need a reset`
          : `${opsEscalations.mineDueSoonDrafts.length} of your draft${opsEscalations.mineDueSoonDrafts.length === 1 ? '' : 's'} are due soon`,
      ],
      workflowActions: topUrgentOpsDraft ? [
        ...(topUrgentOpsDraft.status === 'ready_for_ops'
          ? [{
              label: 'Convert draft',
              action: 'promote' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: 'success' as const,
            }]
          : []),
        {
          label: 'Assign to me',
          action: 'assign_self' as const,
          opsDraftId: topUrgentOpsDraft.id,
          tone: 'default' as const,
        },
        ...(ownershipView === 'team'
          ? [{
              label: 'Assign teammate',
              action: 'assign_teammate' as const,
              opsDraftId: topUrgentOpsDraft.id,
              tone: 'default' as const,
            }]
          : []),
      ] : undefined,
      secondaryActions: topUrgentOpsDraft ? [
        {
          label: 'Add note',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: topUrgentOpsDraft.dayOfWeek,
            opsDraftId: topUrgentOpsDraft.id,
          }),
          tone: 'default' as const,
        },
      ] : undefined,
    },
    {
      id: 'command-center-programming',
      eyebrow: 'Programming',
      title: strongestProgramming
        ? 'The best next schedule move is ready'
        : 'Programming pressure is light right now',
      description: strongestProgramming
        ? `${strongestProgramming.primary.title} is the highest-upside idea, and ${safestProgramming?.id && safestProgramming.id !== strongestProgramming.id ? `${safestProgramming.primary.title} is the safer fallback if you want less overlap risk.` : 'it is already the cleanest option available today.'}`
        : 'When the agent sees demand or capacity pressure, the next schedule move will appear here first.',
      ctaLabel: strongestProgramming ? 'Open programming cockpit' : 'Open Advisor',
      href: strongestProgramming
        ? buildAgentFocusHref(clubId, {
            focus: 'programming-cockpit',
            day: strongestProgramming.primary.dayOfWeek,
            draftId: strongestProgramming.id,
          })
        : `/clubs/${clubId}/intelligence/advisor`,
      tone: strongestProgramming ? 'default' : 'success',
      count: strongestProgramming ? `${strongestProgramming.primary.projectedOccupancy}% fill` : programmingCockpit.totalIdeas,
      bullets: strongestProgramming ? [
        `${strongestProgramming.primary.estimatedInterestedMembers} likely interested members`,
        `${strongestProgramming.primary.confidence}% confidence on the strongest option`,
        safestProgramming && safestProgramming.id !== strongestProgramming.id
          ? `Safer fallback: ${safestProgramming.primary.title}`
          : 'The strongest idea is already the safest current option',
      ] : [
        `${programmingCockpit.totalIdeas} draft idea${programmingCockpit.totalIdeas === 1 ? '' : 's'} tracked`,
        `${programmingCockpit.totalOpsDrafts} internal ops draft${programmingCockpit.totalOpsDrafts === 1 ? '' : 's'} already created`,
      ],
      secondaryActions: strongestProgramming && safestProgramming && safestProgramming.id !== strongestProgramming.id ? [
        {
          label: 'Open safer option',
          href: buildAgentFocusHref(clubId, {
            focus: 'programming-cockpit',
            day: safestProgramming.primary.dayOfWeek,
            draftId: safestProgramming.id,
          }),
          tone: 'default' as const,
        },
      ] : undefined,
    },
    {
      id: 'command-center-previews',
      eyebrow: 'Previews & reminders',
      title: remindersBeforeClose.length > 0
        ? `${remindersBeforeClose.length} reminder${remindersBeforeClose.length === 1 ? '' : 's'} return before close`
        : freshSandboxDrafts.length > 0
          ? 'Fresh previews are ready for a safe review'
          : 'Reminder and preview lane is calm right now',
      description: remindersBeforeClose.length > 0
        ? `${remindersBeforeClose[0]?.title} is the next task coming back, and the command center is surfacing it before the evening window.`
        : freshSandboxDrafts.length > 0
          ? `${freshSandboxDrafts[0].title} is the freshest sandbox preview, so you can inspect it before anything goes live.`
          : 'Snoozed reminders and sandbox previews will collect here when they need a same-day look.',
      ctaLabel: remindersBeforeClose.length > 0 || freshSandboxDrafts.length > 0 ? 'Open preview & reminders' : 'Open agent',
      href: remindersBeforeClose.length > 0 || freshSandboxDrafts.length > 0
        ? buildAgentFocusHref(clubId, { focus: 'preview-inbox' })
        : `/clubs/${clubId}/intelligence/agent`,
      tone: remindersBeforeClose.length > 0 ? 'warn' : freshSandboxDrafts.length > 0 ? 'default' : 'success',
      count: remindersBeforeClose.length > 0 ? remindersBeforeClose.length : freshSandboxDrafts.length,
      bullets: [
        remindersBeforeClose.length > 0
          ? `${formatAdminReminderDeliveryMode(remindersBeforeClose[0].channel)} reminder returns ${remindersBeforeClose[0].label}`
          : `${upcomingReminders.length} reminder${upcomingReminders.length === 1 ? '' : 's'} currently snoozed`,
        `${freshSandboxDrafts.length} sandbox preview${freshSandboxDrafts.length === 1 ? '' : 's'} ready`,
        'This lane keeps safe previews and delayed tasks from disappearing behind the rest of the day',
      ],
      secondaryActions: [
        {
          label: 'Open inbox',
          href: buildAgentFocusHref(clubId, { focus: 'preview-inbox' }),
          tone: 'default' as const,
        },
      ],
    },
  ]

  const quickActions: DailyCommandCenterAction[] = [
    pendingActions.length > 0 ? {
      label: 'Pending approvals',
      href: buildAgentFocusHref(clubId, { focus: 'pending-queue' }),
      tone: 'warn',
    } : null,
    topPublishedAtRisk ? {
      label: 'Live at risk',
      href: buildAgentFocusHref(clubId, {
        focus: 'ops-queue',
        day: topPublishedAtRisk.dayOfWeek,
        opsDraftId: topPublishedAtRisk.id,
      }),
      tone: 'danger',
    } : null,
    topUrgentOpsDraft ? {
      label: 'Ops queue',
      href: buildAgentFocusHref(clubId, {
        focus: 'ops-queue',
        day: topUrgentOpsDraft.dayOfWeek,
        opsDraftId: topUrgentOpsDraft.id,
      }),
      tone: 'success',
    } : null,
    strongestProgramming ? {
      label: 'Programming cockpit',
      href: buildAgentFocusHref(clubId, {
        focus: 'programming-cockpit',
        day: strongestProgramming.primary.dayOfWeek,
        draftId: strongestProgramming.id,
      }),
      tone: 'default',
    } : null,
    remindersBeforeClose.length > 0 || freshSandboxDrafts.length > 0 ? {
      label: 'Preview inbox',
      href: buildAgentFocusHref(clubId, { focus: 'preview-inbox' }),
      tone: 'default',
    } : null,
  ].filter(Boolean) as DailyCommandCenterAction[]

  return {
    headline,
    summary,
    modules,
    quickActions,
  }
}

function buildAdvisorDraftHref(
  clubId: string,
  draft: Pick<AdvisorDraftWorkspaceItem, 'conversationId' | 'originalIntent'>,
) {
  if (draft.conversationId) {
    return `/clubs/${clubId}/intelligence/advisor?conversationId=${encodeURIComponent(draft.conversationId)}`
  }

  if (draft.originalIntent) {
    return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(draft.originalIntent)}`
  }

  return `/clubs/${clubId}/intelligence/advisor`
}

function buildOpsSessionDraftHref(clubId: string, draft: OpsSessionDraftItem) {
  return buildAdvisorDraftHref(clubId, {
    conversationId: draft.agentDraft?.conversationId || null,
    originalIntent: draft.agentDraft?.originalIntent || null,
  })
}

function buildAdvisorDraftRefineHref(
  clubId: string,
  draft: Pick<AdvisorDraftWorkspaceItem, 'conversationId' | 'originalIntent'>,
  prompt: string,
) {
  const params = new URLSearchParams()
  if (draft.conversationId) {
    params.set('conversationId', draft.conversationId)
  }
  params.set('prompt', prompt)
  return `/clubs/${clubId}/intelligence/advisor?${params.toString()}`
}

function buildAdvisorConversationHref(
  clubId: string,
  result: {
    conversationId?: string | null
    originalIntent?: string | null
  },
  fallbackPrompt?: string,
) {
  if (result.conversationId) {
    return `/clubs/${clubId}/intelligence/advisor?conversationId=${encodeURIComponent(result.conversationId)}`
  }

  if (result.originalIntent) {
    return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(result.originalIntent)}`
  }

  if (fallbackPrompt) {
    return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(fallbackPrompt)}`
  }

  return `/clubs/${clubId}/intelligence/advisor`
}

function buildAgentFocusHref(
  clubId: string,
  options: {
    focus: AgentDeepLinkFocus
    day?: string
    draftId?: string
    opsDraftId?: string
  },
) {
  const params = new URLSearchParams()
  params.set('focus', options.focus)
  if (options.day) params.set('day', options.day)
  if (options.draftId) params.set('draftId', options.draftId)
  if (options.opsDraftId) params.set('opsDraftId', options.opsDraftId)
  return `/clubs/${clubId}/intelligence/agent?${params.toString()}`
}

function buildPublishedSessionFillPrompt(draft: OpsSessionDraftItem) {
  const liveSession = getOpsSessionDraftPublishMeta(draft)?.liveSession
  const sessionTitle = liveSession?.title || draft.title
  const sessionDate = liveSession?.date || draft.dayOfWeek
  const sessionTime = liveSession?.startTime || draft.startTime
  return `Prepare a fill plan for the live ${sessionTitle} session on ${sessionDate} at ${sessionTime}.`
}

function buildPublishedSessionRepeatPrompt(draft: OpsSessionDraftItem) {
  return `This published ${draft.format.replace(/_/g, ' ').toLowerCase()} session on ${draft.dayOfWeek} at ${draft.startTime} is outperforming plan. Prepare a follow-up programming draft for next week in the same window and explain whether we should repeat it as-is or expand it.`
}

function buildPublishedSessionRepeatHref(clubId: string, draft: OpsSessionDraftItem) {
  const prompt = buildPublishedSessionRepeatPrompt(draft)
  if (draft.agentDraft?.conversationId || draft.agentDraft?.originalIntent) {
    return buildAdvisorDraftRefineHref(clubId, {
      conversationId: draft.agentDraft?.conversationId || null,
      originalIntent: draft.agentDraft?.originalIntent || null,
    }, prompt)
  }

  return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(prompt)}`
}

function buildPublishedSessionFillHref(clubId: string, draft: OpsSessionDraftItem) {
  const prompt = buildPublishedSessionFillPrompt(draft)
  if (draft.agentDraft?.conversationId || draft.agentDraft?.originalIntent) {
    return buildAdvisorDraftRefineHref(clubId, {
      conversationId: draft.agentDraft?.conversationId || null,
      originalIntent: draft.agentDraft?.originalIntent || null,
    }, prompt)
  }

  return `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(prompt)}`
}

function isAgentDeepLinkFocus(value: string | null): value is AgentDeepLinkFocus {
  return value === 'programming-cockpit'
    || value === 'ops-board'
    || value === 'ops-queue'
    || value === 'preview-inbox'
    || value === 'pending-queue'
}

function prioritizeFocusedItems<T>(items: T[], isFocused: (item: T) => boolean) {
  const focused: T[] = []
  const rest: T[] = []

  for (const item of items) {
    if (isFocused(item)) focused.push(item)
    else rest.push(item)
  }

  return [...focused, ...rest]
}

function buildProgrammingRefineActions(draft: ProgrammingDraftCard) {
  const actions: Array<{ label: string; prompt: string }> = []
  const primary = draft.primary
  const topAlternative = draft.alternatives[0]

  if (topAlternative) {
    actions.push({
      label: `Try ${topAlternative.dayOfWeek} ${formatProgrammingValue(topAlternative.timeSlot)}`,
      prompt: `Use the ${topAlternative.dayOfWeek} ${topAlternative.timeSlot} ${formatProgrammingValue(topAlternative.format).toLowerCase()} option as the primary programming plan instead.`,
    })
  }

  if (primary.skillLevel !== 'BEGINNER') {
    actions.push({
      label: 'Make beginner',
      prompt: 'Keep this programming plan, but make the primary option beginner-friendly.',
    })
  }

  if (primary.format !== 'CLINIC') {
    actions.push({
      label: 'Switch to clinic',
      prompt: 'Keep the same programming window, but switch the primary option to a clinic format.',
    })
  }

  actions.push({
    label: 'Smaller group',
    prompt: 'Keep the same idea, but make the primary option a smaller group capped at 6 players.',
  })

  actions.push({
    label: 'Show another option',
    prompt: 'Show another programming option for this plan with a different day or time window.',
  })

  return actions.slice(0, 4)
}

function buildProgrammingConfidenceBand(confidence: number) {
  if (confidence >= 85) {
    return {
      label: 'High readiness',
      color: '#10B981',
      note: 'Demand and fit are strong enough that this looks like the clearest draft to test first.',
    }
  }
  if (confidence >= 70) {
    return {
      label: 'Strong signal',
      color: '#06B6D4',
      note: 'This is a solid draft candidate, but it is still worth comparing one nearby variant before publishing.',
    }
  }
  return {
    label: 'Needs validation',
    color: '#F59E0B',
    note: 'The demand signal is promising, but the club should keep this in draft mode and compare alternatives first.',
  }
}

function getProgrammingConflictTone(level?: 'low' | 'medium' | 'high' | null) {
  if (level === 'high') {
    return {
      label: 'High conflict',
      color: '#EF4444',
    }
  }

  if (level === 'medium') {
    return {
      label: 'Watch conflicts',
      color: '#F59E0B',
    }
  }

  return {
    label: 'Cleaner opening',
    color: '#10B981',
  }
}

function buildProgrammingRiskCheck(
  primary: ProgrammingPreviewProposal,
  alternative?: ProgrammingPreviewProposal | null,
) {
  if (primary.conflict) {
    const tone = getProgrammingConflictTone(primary.conflict.overallRisk)
    return {
      label: tone.label,
      color: tone.color,
      note: primary.conflict.saferAlternativeReason || primary.conflict.riskSummary,
    }
  }

  const closeFill = alternative
    ? Math.abs(primary.projectedOccupancy - alternative.projectedOccupancy) <= 3
    : false
  const closeDemand = alternative
    ? Math.abs(primary.estimatedInterestedMembers - alternative.estimatedInterestedMembers) <= 2
    : false

  if (primary.confidence >= 82 && primary.estimatedInterestedMembers >= 10 && !closeFill && !closeDemand) {
    return {
      label: 'Cleaner opening',
      color: '#10B981',
      note: 'This option is separating cleanly from the next best idea, so it looks safer to test first.',
    }
  }

  if (closeFill || closeDemand) {
    return {
      label: 'Compare two windows',
      color: '#F59E0B',
      note: 'Another nearby option is scoring similarly, so compare both before turning this into an ops draft.',
    }
  }

  return {
    label: 'Validate in draft',
    color: '#F59E0B',
    note: 'This still looks good, but it should stay in draft mode until the club reviews the slot fit.',
  }
}

function buildProgrammingImpactAssessment(draft: ProgrammingDraftCard) {
  const nextBest = draft.primary.conflict?.saferAlternativeId
    ? draft.alternatives.find((proposal) => proposal.id === draft.primary.conflict?.saferAlternativeId) || draft.alternatives[0] || null
    : draft.alternatives[0] || null
  return {
    nextBest,
    fillDelta: nextBest ? draft.primary.projectedOccupancy - nextBest.projectedOccupancy : null,
    demandDelta: nextBest ? draft.primary.estimatedInterestedMembers - nextBest.estimatedInterestedMembers : null,
    confidenceBand: buildProgrammingConfidenceBand(draft.primary.confidence),
    riskCheck: buildProgrammingRiskCheck(draft.primary, nextBest),
    warnings: draft.primary.conflict?.warnings || [],
  }
}

function normalizeSimulationOutcome(
  outcome?: string | null,
): "auto" | "pending" | "blocked" | "other" | null {
  if (outcome === "auto" || outcome === "pending" || outcome === "blocked" || outcome === "other") {
    return outcome
  }
  return null
}

// ── Component ──
export function AgentIQ({
  clubId,
  activity,
  pending,
  advisorDrafts,
  opsSessionDrafts,
  opsTeammates,
  decisionRecords,
  isLoading,
  agentLive,
  intelligenceSettings,
  outreachRolloutStatus,
  approveAction,
  skipAction,
  snoozeAction,
  promoteOpsSessionDraft,
  createFillSessionDraftFromSchedule,
  prepareOpsSessionDraftPublish,
  publishOpsSessionDraftToSchedule,
  updatePublishedOpsSessionDraft,
  rollbackPublishedOpsSessionDraft,
  updateOpsSessionDraftWorkflow,
  shadowBackOutreachRolloutAction,
}: AgentIQProps) {
  const { isDark } = useTheme()
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const headerRef = useRef<HTMLDivElement>(null)
  const pendingQueueRef = useRef<HTMLDivElement>(null)
  const previewInboxRef = useRef<HTMLDivElement>(null)
  const programmingCockpitRef = useRef<HTMLDivElement>(null)
  const opsBoardRef = useRef<HTMLDivElement>(null)
  const opsQueueRef = useRef<HTMLDivElement>(null)
  const lastDeepLinkRef = useRef<string | null>(null)
  const headerInView = useInView(headerRef, { once: true })
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [creatingPublishedFillDraftId, setCreatingPublishedFillDraftId] = useState<string | null>(null)
  const [opsActionPanel, setOpsActionPanel] = useState<OpsActionPanelState | null>(null)
  const [opsOwnershipFilter, setOpsOwnershipFilter] = useState<OpsOwnershipFilter>('all')
  const [dailyOwnershipView, setDailyOwnershipView] = useState<DailyOwnershipView>('team')
  const [optimisticDailyTodoDecisions, setOptimisticDailyTodoDecisions] = useState<Record<string, DailyAdminTodoDecision>>({})
  const [notNowPickerItemId, setNotNowPickerItemId] = useState<string | null>(null)
  const [notNowReminderChannel, setNotNowReminderChannel] = useState<AdminReminderDeliveryMode>('in_app')
  const [dailyTodoDateKey] = useState(() => new Date().toLocaleDateString('en-CA'))
  const { data: reminderProfile } = trpc.user.getProfile.useQuery(undefined, {
    staleTime: 60 * 1000,
  })
  const { data: dailyTodoDecisionRecordsData } = useAdminTodoDecisions(clubId, dailyTodoDateKey)
  const { data: outreachPilotHealthData } = trpc.intelligence.getOutreachPilotHealth.useQuery(
    { clubId, days: 14 },
    { enabled: !!clubId, staleTime: 60 * 1000 },
  )
  const { data: integrationHealthData } = trpc.intelligence.getIntegrationHealthSnapshot.useQuery(
    { clubId },
    { enabled: !!clubId, staleTime: 60 * 1000 },
  )
  const setAdminTodoDecision = useSetAdminTodoDecision()
  const clearAdminTodoDecisions = useClearAdminTodoDecisions()
  const dailyTodoDecisionRecords = useMemo(
    () => (dailyTodoDecisionRecordsData || []) as AdminTodoDecisionRecord[],
    [dailyTodoDecisionRecordsData],
  )
  const dailyTodoReminderOptions = buildDailyTodoReminderOptions(new Date())
  const integrationAnomalyDecisionMap = useMemo(
    () =>
      dailyTodoDecisionRecords.reduce((acc: Record<string, 'accepted' | 'declined' | 'not_now'>, record) => {
        if (record.bucket !== 'integration_anomalies') return acc
        if (record.decision === 'accepted' || record.decision === 'declined' || record.decision === 'not_now') {
          acc[record.itemId] = record.decision
        }
        return acc
      }, {}),
    [dailyTodoDecisionRecords],
  )
  const dailyTodoReminderChannelOptions = useMemo(
    () => buildDailyTodoReminderChannelOptions(reminderProfile),
    [reminderProfile],
  )
  const preferredDailyTodoReminderChannel = useMemo(
    () => getPreferredDailyTodoReminderChannel(reminderProfile),
    [reminderProfile],
  )
  const advisorReminderRoutingHref = useMemo(
    () => `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent('Set up my admin reminder delivery so you can remind me by email or SMS when I snooze daily tasks.')}`,
    [clubId],
  )

  const stats = activity?.stats
  const logs = useMemo(() => activity?.logs || [], [activity?.logs])
  const recentDecisionRecords = useMemo(() => decisionRecords || [], [decisionRecords])
  const outreachPilotHealth = useMemo(
    () => (outreachPilotHealthData || null) as OutreachPilotHealthSnapshot | null,
    [outreachPilotHealthData],
  )
  const integrationAnomalyQueue = useMemo(
    () => ((integrationHealthData as any)?.anomalyQueue || null) as IntegrationAnomalySnapshot | null,
    [integrationHealthData],
  )
  const pendingActions = useMemo(() => pending || [], [pending])
  const controlPlane = useMemo(
    () => resolveAgentControlPlane({ intelligence: intelligenceSettings || {} }),
    [intelligenceSettings],
  )
  const controlPlaneSummary = useMemo(
    () => buildAgentControlPlaneSummary(controlPlane),
    [controlPlane],
  )
  const controlPlaneAudit = useMemo(
    () => getAgentControlPlaneAudit({ intelligence: intelligenceSettings || {} }),
    [intelligenceSettings],
  )
  const outreachRolloutSummary = useMemo(
    () =>
      outreachRolloutStatus?.summary
        || 'No rollout clubs configured · No live outreach actions armed',
    [outreachRolloutStatus],
  )
  const outreachRolloutActions = useMemo(
    () => Object.values(outreachRolloutStatus?.actions || {}) as Array<{ actionKind: string; enabled: boolean; label: string }>,
    [outreachRolloutStatus],
  )
  const armedOutreachRolloutActions = useMemo(
    () => outreachRolloutActions.filter((action) => action.enabled),
    [outreachRolloutActions],
  )
  const recentOutreachRolloutDecisions = useMemo(
    () =>
      recentDecisionRecords.filter((record) =>
        record.action === 'outreachSend'
        && (record.result === 'blocked' || record.result === 'shadowed'),
      ),
    [recentDecisionRecords],
  )
  const outreachPilotRecommendation = useMemo(() => {
    const recommendation = outreachPilotHealth?.recommendation
    if (!recommendation) return null
    const rolloutAction = outreachRolloutStatus?.actions?.[recommendation.actionKind]
    if (!rolloutAction?.enabled) return null
    return {
      ...recommendation,
      label: rolloutAction.label || recommendation.label,
    }
  }, [outreachPilotHealth, outreachRolloutStatus])
  const sandboxDrafts = (advisorDrafts || []).filter((draft) => draft.status === 'sandboxed' || !!draft.metadata?.sandboxPreview)
  const sandboxRouting = buildAdvisorSandboxRoutingSummary({
    settings: { sandboxRouting: intelligenceSettings?.sandboxRouting },
    channel: 'both',
  })
  const autopilotSummary = buildAutopilotSummary(logs)
  const autopilotSuggestions = buildAutopilotSuggestions(autopilotSummary, pendingActions.length)
  const proactiveOpportunities = buildProactiveOpportunities(logs, pendingActions)
  const membershipLifecycleCards = buildMembershipLifecycleAutopilotCards(logs, pendingActions, intelligenceSettings)
  const programmingCockpit = buildProgrammingCockpit(advisorDrafts || [])
  const programmingOpsBoard = buildProgrammingOpsBoard(advisorDrafts || [])
  const currentUserId = session?.user?.id || null
  const currentClubRole = useMemo(
    () => ((opsTeammates || []).find((teammate) => teammate.id === currentUserId)?.role as "ADMIN" | "MODERATOR" | null) || null,
    [currentUserId, opsTeammates],
  )
  const permissionPosture = useMemo(
    () => resolveAgentPermissions({ intelligence: intelligenceSettings || {} }),
    [intelligenceSettings],
  )
  const permissionSummary = useMemo(
    () => buildAgentPermissionSummary(permissionPosture),
    [permissionPosture],
  )
  const rolloutManagePermission = useMemo(
    () =>
      currentClubRole
        ? evaluateAgentPermission({
            automationSettings: { intelligence: intelligenceSettings || {} },
            action: "controlPlaneManage",
            clubAdminRole: currentClubRole,
          })
        : null,
    [currentClubRole, intelligenceSettings],
  )
  const assignableOpsTeammates = useMemo(
    () => (opsTeammates || []).filter((teammate) => teammate.id !== currentUserId),
    [currentUserId, opsTeammates],
  )
  const fillSessionDraftBySessionId = useMemo(
    () =>
      (advisorDrafts || []).reduce<Map<string, AdvisorDraftWorkspaceItem>>((acc, draft) => {
        const sessionId = draft.kind === 'fill_session'
          ? draft.metadata?.slotFillerPreview?.sessionId
          : null
        if (sessionId && !acc.has(sessionId)) {
          acc.set(sessionId, draft)
        }
        return acc
      }, new Map()),
    [advisorDrafts],
  )
  const opsSessionDraftQueue = buildOpsSessionDraftQueue(opsSessionDrafts || [], currentUserId, 'all')
  const visibleOpsSessionDraftQueue = buildOpsSessionDraftQueue(opsSessionDrafts || [], currentUserId, opsOwnershipFilter)
  const dailyOpsSessionDraftQueue = useMemo(
    () =>
      dailyOwnershipView === 'mine'
        ? buildOpsSessionDraftQueue(opsSessionDrafts || [], currentUserId, 'mine')
        : opsSessionDraftQueue,
    [currentUserId, dailyOwnershipView, opsSessionDraftQueue, opsSessionDrafts],
  )
  const dailyOwnershipCopy = useMemo(
    () => getDailyOwnershipViewCopy(dailyOwnershipView),
    [dailyOwnershipView],
  )
  const opsOwnershipCounts = useMemo(() => {
    const drafts = opsSessionDrafts || []
    const mine = drafts.filter((draft) => getOpsDraftOwnerUserId(draft) === currentUserId).length
    const unassigned = drafts.filter((draft) => !getOpsDraftOwnerUserId(draft)).length
    return {
      all: drafts.length,
      mine,
      unassigned,
    }
  }, [currentUserId, opsSessionDrafts])
  const deepLinkFocus = isAgentDeepLinkFocus(searchParams.get('focus')) ? searchParams.get('focus') : null
  const deepLinkDay = searchParams.get('day')
  const deepLinkDraftId = searchParams.get('draftId')
  const deepLinkOpsDraftId = searchParams.get('opsDraftId')
  const deepLinkKey = [deepLinkFocus, deepLinkDay, deepLinkDraftId, deepLinkOpsDraftId].filter(Boolean).join(':')
  const opsDraftById = useMemo(
    () =>
      (opsSessionDrafts || []).reduce<Record<string, OpsSessionDraftItem>>((acc, draft) => {
        acc[draft.id] = draft
        return acc
      }, {}),
    [opsSessionDrafts],
  )
  const opsActionPanelDraft = opsActionPanel ? opsDraftById[opsActionPanel.draftId] || null : null
  const opsActionPanelPublishReview = opsActionPanelDraft ? getOpsSessionDraftPublishReviewMeta(opsActionPanelDraft) : null
  const opsActionPanelPublishMeta = opsActionPanelDraft ? getOpsSessionDraftPublishMeta(opsActionPanelDraft) : null
  const opsActionPanelAftercare = opsActionPanelDraft ? getOpsSessionDraftAftercareMeta(opsActionPanelDraft) : null
  const policyScenarios = buildAgentPolicyScenarios({
    items: [
      ...logs.map((item) => ({
        id: item.id,
        type: item.type,
        membershipLifecycle: item.membershipLifecycle ?? null,
        currentOutcome: normalizeSimulationOutcome(resolveAutopilotOutcome(item)),
        confidence: item.confidence ?? null,
        recipientCount: item.triggerRecipientCount ?? null,
        membershipSignal: item.triggerMembershipSignal ?? null,
        membershipStatus: item.membershipStatus ?? null,
        membershipType: item.membershipType ?? null,
        membershipConfidence: item.triggerMembershipConfidence ?? null,
      })),
      ...pendingActions.map((item) => ({
        id: item.id,
        type: item.type,
        membershipLifecycle: item.membershipLifecycle ?? null,
        currentOutcome: normalizeSimulationOutcome(item.triggerOutcome === "blocked" ? "blocked" : "pending"),
        confidence: item.confidence ?? null,
        recipientCount: item.triggerRecipientCount ?? null,
        membershipSignal: item.triggerMembershipSignal ?? null,
        membershipStatus: item.membershipStatus ?? null,
        membershipType: item.membershipType ?? null,
        membershipConfidence: item.triggerMembershipConfidence ?? null,
      })),
    ],
    automationSettings: { intelligence: intelligenceSettings || {} },
    liveMode: agentLive,
  })
  const newestSandboxDraft = [...sandboxDrafts]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] || null
  const readyOpsDraft = dailyOpsSessionDraftQueue.find((stage) => stage.key === 'ready_for_ops')?.drafts[0] || null
  const sessionDraft = dailyOpsSessionDraftQueue.find((stage) => stage.key === 'session_draft')?.drafts[0] || null
  const opsEscalations = buildOpsEscalationSignals({
    opsSessionDraftQueue: dailyOpsSessionDraftQueue,
    currentUserId,
    ownershipView: dailyOwnershipView,
  })
  const publishedSignals = buildPublishedSessionSignals(dailyOpsSessionDraftQueue)
  const pendingLifecycleOpportunity = proactiveOpportunities.find((opportunity) => opportunity.pendingCount > 0) || null
  const blockedLifecycleCard = [...membershipLifecycleCards]
    .sort((left, right) => right.blockedCount - left.blockedCount)[0] || null
  const bestScenario = [...policyScenarios]
    .sort((left, right) => right.autoGain - left.autoGain)[0] || null
  const { topIntegrationAtRisk, topIntegrationWatch } = getTopIntegrationAnomalies(integrationAnomalyQueue)
  const dailyAdminTodoSections = buildDailyAdminTodoSectionsComposer({
    clubId,
    pendingActionsCount: pendingActions.length,
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
    ownershipView: dailyOwnershipView,
    topIntegrationAtRisk,
    topIntegrationWatch,
    buildAgentFocusHref: (options) => buildAgentFocusHref(clubId, options),
    buildPublishedSessionRepeatHref: (draft) => buildPublishedSessionRepeatHref(clubId, draft),
    buildIntegrationTodoItem: ({ anomaly, title, description }) => buildIntegrationAnomalyTodoItem({
      anomaly,
      clubId,
      title,
      description,
    }),
    getPublishedLiveFeedbackMeta: getOpsSessionDraftLiveFeedbackMeta,
    getOpsWorkflowMeta,
    buildAdvisorPolicyPrompt,
    actionLabel,
  })
  const latestDailyTodoDecisionByItem = useMemo(
    () =>
      dailyTodoDecisionRecords.reduce<Record<string, AdminTodoDecisionRecord>>((acc, record) => {
        if (!acc[record.itemId]) {
          acc[record.itemId] = record
        }
        return acc
      }, {}),
    [dailyTodoDecisionRecords],
  )
  const persistedDailyTodoDecisions = useMemo(() => {
    const now = Date.now()

    return Object.values(latestDailyTodoDecisionByItem).reduce<Record<string, DailyAdminTodoDecision>>((acc, record) => {
      const decision = record.decision
      if (decision !== 'accepted' && decision !== 'declined' && decision !== 'not_now') {
        return acc
      }

      if (decision === 'accepted' || decision === 'declined') {
        if (record.dateKey === dailyTodoDateKey) {
          acc[record.itemId] = decision
        }
        return acc
      }

      const reminder = getDailyTodoReminder(record)
      if (reminder?.remindAt.getTime() && reminder.remindAt.getTime() > now) {
        acc[record.itemId] = 'not_now'
        return acc
      }

      if (!reminder && record.dateKey === dailyTodoDateKey) {
        acc[record.itemId] = 'not_now'
      }

      return acc
    }, {})
  }, [dailyTodoDateKey, latestDailyTodoDecisionByItem])
  const dailyTodoDecisions = useMemo(
    () => ({
      ...persistedDailyTodoDecisions,
      ...optimisticDailyTodoDecisions,
    }),
    [optimisticDailyTodoDecisions, persistedDailyTodoDecisions],
  )
  const handledDailyTodoItems = dailyAdminTodoSections
    .flatMap((section) => section.items)
    .filter((item) => !!dailyTodoDecisions[item.id])
  const upcomingDailyReminders = handledDailyTodoItems
    .map((item) => ({
      item,
      record: latestDailyTodoDecisionByItem[item.id],
    }))
    .map(({ item, record }) => {
      if (!record || dailyTodoDecisions[item.id] !== 'not_now') return null
      const reminder = getDailyTodoReminder(record)
      if (!reminder || reminder.remindAt.getTime() <= Date.now()) return null
      return {
        itemId: item.id,
        title: item.title,
        label: reminder.remindLabel || reminder.remindAt.toLocaleString(),
        channel: reminder.reminderChannel,
        remindAt: reminder.remindAt,
      }
    })
    .filter(Boolean) as Array<{
      itemId: string
      title: string
      label: string
      channel: AdminReminderDeliveryMode
      remindAt: Date
    }>
  const hasUnavailableExternalReminderChannels = dailyTodoReminderChannelOptions.some(
    (option) => option.id !== 'in_app' && !option.available,
  )
  const dailyOpsBrief = useMemo(
    () => buildDailyOpsBrief({
      clubId,
      now: new Date(),
      actionsToday: stats?.actionsToday ?? 0,
      pendingActions,
      autopilotSummary,
      programmingCockpit,
      opsSessionDraftQueue: dailyOpsSessionDraftQueue,
      sandboxDrafts,
      policyScenarios,
      currentUserId,
      ownershipView: dailyOwnershipView,
      upcomingReminders: upcomingDailyReminders,
    }),
    [
      clubId,
      stats?.actionsToday,
      pendingActions,
      autopilotSummary,
      currentUserId,
      dailyOwnershipView,
      programmingCockpit,
      dailyOpsSessionDraftQueue,
      sandboxDrafts,
      policyScenarios,
      upcomingDailyReminders,
    ],
  )
  const dailyCommandCenter = useMemo(
    () => buildUnifiedDailyCommandCenter({
      clubId,
      pendingActions,
      autopilotSummary,
      programmingCockpit,
      opsSessionDraftQueue: dailyOpsSessionDraftQueue,
      sandboxDrafts,
      currentUserId,
      ownershipView: dailyOwnershipView,
      upcomingReminders: upcomingDailyReminders,
    }),
    [
      clubId,
      pendingActions,
      autopilotSummary,
      programmingCockpit,
      dailyOpsSessionDraftQueue,
      sandboxDrafts,
      currentUserId,
      dailyOwnershipView,
      upcomingDailyReminders,
    ],
  )
  const handledDailyTodoCounts = handledDailyTodoItems.reduce(
    (acc, item) => {
      const decision = dailyTodoDecisions[item.id]
      if (decision === 'accepted') acc.accepted += 1
      if (decision === 'declined') acc.declined += 1
      if (decision === 'not_now') acc.notNow += 1
      return acc
    },
    { accepted: 0, declined: 0, notNow: 0 },
  )

  const isFocusedProgrammingDraft = (draft: ProgrammingDraftCard) =>
    (deepLinkDraftId ? draft.id === deepLinkDraftId : false)
    || (!!deepLinkDay && draft.primary.dayOfWeek === deepLinkDay)

  const isFocusedOpsSessionDraft = (draft: OpsSessionDraftItem) =>
    (deepLinkOpsDraftId ? draft.id === deepLinkOpsDraftId : false)
    || (!!deepLinkDay && draft.dayOfWeek === deepLinkDay)

  useEffect(() => {
    if (!deepLinkFocus || isLoading || !deepLinkKey || lastDeepLinkRef.current === deepLinkKey) return

    const targetRef =
      deepLinkFocus === 'programming-cockpit'
        ? programmingCockpitRef
        : deepLinkFocus === 'ops-board'
          ? opsBoardRef
          : deepLinkFocus === 'preview-inbox'
            ? previewInboxRef
            : deepLinkFocus === 'pending-queue'
              ? pendingQueueRef
              : opsQueueRef

    const timer = window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      lastDeepLinkRef.current = deepLinkKey
    }, 120)

    return () => window.clearTimeout(timer)
  }, [deepLinkFocus, deepLinkKey, isLoading])

  useEffect(() => {
    setOptimisticDailyTodoDecisions((current) => {
      let changed = false
      const next = { ...current }

      for (const [itemId, decision] of Object.entries(current)) {
        if (persistedDailyTodoDecisions[itemId] === decision) {
          delete next[itemId]
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [persistedDailyTodoDecisions])

  const actionHref = (action: AutopilotSuggestionAction, prompt?: string) => {
    switch (action) {
      case "open_settings":
        return `/clubs/${clubId}/intelligence/settings`
      case "open_integrations":
        return `/clubs/${clubId}/intelligence/integrations`
      case "open_advisor":
        return prompt
          ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(prompt)}`
          : `/clubs/${clubId}/intelligence/advisor`
      default:
        return null
    }
  }

  const runSuggestionAction = (action: AutopilotSuggestionAction) => {
    if (action === "scroll_pending") {
      pendingQueueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleApprove = (actionId: string) => {
    setProcessingId(actionId)
    approveAction.mutate(
      { clubId, actionId },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleSkip = (actionId: string) => {
    setProcessingId(actionId)
    skipAction.mutate(
      { clubId, actionId },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleSnooze = (actionId: string) => {
    setProcessingId(actionId)
    snoozeAction.mutate(
      { clubId, actionId },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleShadowBackOutreachAction = () => {
    if (!outreachPilotRecommendation) return
    const confirmed = window.confirm(
      `${outreachPilotRecommendation.reason}\n\nMove ${outreachPilotRecommendation.label} back to shadow for this club?`,
    )
    if (!confirmed) return

    setProcessingId(`shadowback:${outreachPilotRecommendation.actionKind}`)
    shadowBackOutreachRolloutAction.mutate(
      {
        clubId,
        actionKind: outreachPilotRecommendation.actionKind,
        reason: outreachPilotRecommendation.reason,
      },
      {
        onError: (error: any) => {
          window.alert(error?.message || 'Could not move this outreach action back to shadow.')
        },
        onSettled: () => setProcessingId(null),
      },
    )
  }

  const handlePromoteOpsSessionDraft = (opsSessionDraftId: string) => {
    setProcessingId(`ops:${opsSessionDraftId}`)
    promoteOpsSessionDraft.mutate(
      { clubId, opsSessionDraftId },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleUpdateOpsSessionDraftWorkflow = (
    opsSessionDraftId: string,
    action:
      | 'assign_self'
      | 'assign_teammate'
      | 'reassign_owner'
      | 'ping_owner'
      | 'due_today'
      | 'due_tomorrow'
      | 'add_note'
      | 'reject'
      | 'archive'
      | 'reopen_ready',
  ) => {
    let note: string | undefined
    let reason: string | undefined
    let assigneeUserId: string | undefined

    if (action === 'assign_teammate') {
      return
    }

    if (action === 'add_note') {
      const value = window.prompt('Add an ops note for this session draft:')
      if (value === null) return
      note = value.trim()
      if (!note) return
    }

    if (action === 'reject') {
      const value = window.prompt('Why is this ops draft blocked or rejected?', 'Rejected in ops review')
      if (value === null) return
      reason = value.trim() || 'Rejected in ops review'
    }

    if (action === 'archive') {
      const confirmed = window.confirm('Archive this ops session draft? It will stay visible for traceability.')
      if (!confirmed) return
    }

    if (action === 'reassign_owner') {
      const confirmed = window.confirm('Return this ops draft to the unassigned queue so the team can reassign it?')
      if (!confirmed) return
    }

    if (action === 'ping_owner') {
      const confirmed = window.confirm('Ping the current owner and drop this draft into their agent reminders now?')
      if (!confirmed) return
    }

    setProcessingId(`opswf:${action}:${opsSessionDraftId}`)
    updateOpsSessionDraftWorkflow.mutate(
      { clubId, opsSessionDraftId, action, assigneeUserId, note, reason },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleAssignTeammateStart = (draftId: string) => {
    if (!assignableOpsTeammates.length) {
      window.alert('No teammate roster is available yet for this club.')
      return
    }

    setOpsActionPanel({
      type: 'assign_teammate',
      draftId,
      assigneeUserId: assignableOpsTeammates[0]?.id || '',
    })
  }

  const submitAssignTeammate = () => {
    if (!opsActionPanel || opsActionPanel.type !== 'assign_teammate') return
    if (!opsActionPanel.assigneeUserId) {
      window.alert('Choose a teammate first.')
      return
    }

    setProcessingId(`opswf:assign_teammate:${opsActionPanel.draftId}`)
    updateOpsSessionDraftWorkflow.mutate(
      {
        clubId,
        opsSessionDraftId: opsActionPanel.draftId,
        action: 'assign_teammate',
        assigneeUserId: opsActionPanel.assigneeUserId,
      },
      {
        onSettled: () => setProcessingId(null),
        onSuccess: () => setOpsActionPanel(null),
      },
    )
  }

  const handlePrepareOpsSessionDraftPublish = (draft: OpsSessionDraftItem) => {
    const publishMeta = getOpsSessionDraftPublishMeta(draft)
    setOpsActionPanel({
      type: 'prepare_publish',
      draftId: draft.id,
      publishDate: publishMeta?.targetDate || getNextDateForDay(draft.dayOfWeek),
      title: publishMeta?.title || draft.title,
      description: publishMeta?.description || draft.description || draft.note || '',
    })
  }

  const handleEditPublishedOpsSessionDraft = (draft: OpsSessionDraftItem) => {
    const publishMeta = getOpsSessionDraftPublishMeta(draft)
    const liveSession = publishMeta?.liveSession
    if (!publishMeta?.publishedPlaySessionId || !liveSession?.date) {
      window.alert('This session does not have a live publish to edit yet.')
      return
    }

    setOpsActionPanel({
      type: 'edit_published_session',
      draftId: draft.id,
      publishDate: liveSession.date.slice(0, 10),
      title: liveSession.title || publishMeta.title || draft.title,
      description: liveSession.description || '',
      startTime: liveSession.startTime || draft.startTime,
      endTime: liveSession.endTime || draft.endTime,
      maxPlayers: String(liveSession.maxPlayers || draft.maxPlayers || 8),
    })
  }

  const submitPreparedPublishPlan = () => {
    if (!opsActionPanel || opsActionPanel.type !== 'prepare_publish') return
    const normalizedDate = opsActionPanel.publishDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      window.alert('Use YYYY-MM-DD for the publish date.')
      return
    }

    setProcessingId(`opspubprep:${opsActionPanel.draftId}`)
    prepareOpsSessionDraftPublish.mutate(
      {
        clubId,
        opsSessionDraftId: opsActionPanel.draftId,
        publishDate: normalizedDate,
        title: opsActionPanel.title.trim() || undefined,
        description: opsActionPanel.description.trim() || undefined,
      },
      {
        onError: (error: any) => {
          window.alert(error?.message || 'Could not prepare this session draft for controlled publish.')
        },
        onSettled: () => setProcessingId(null),
        onSuccess: () => setOpsActionPanel(null),
      },
    )
  }

  const submitPublishedSessionAftercareEdit = () => {
    if (!opsActionPanel || opsActionPanel.type !== 'edit_published_session') return
    const normalizedDate = opsActionPanel.publishDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      window.alert('Use YYYY-MM-DD for the live schedule date.')
      return
    }
    const maxPlayers = Number(opsActionPanel.maxPlayers)
    if (!Number.isFinite(maxPlayers) || maxPlayers < 2) {
      window.alert('Choose a realistic max player count for the live session.')
      return
    }

    setProcessingId(`opsaftercare:update:${opsActionPanel.draftId}`)
    updatePublishedOpsSessionDraft.mutate(
      {
        clubId,
        opsSessionDraftId: opsActionPanel.draftId,
        publishDate: normalizedDate,
        title: opsActionPanel.title.trim(),
        description: opsActionPanel.description.trim() || undefined,
        startTime: opsActionPanel.startTime.trim(),
        endTime: opsActionPanel.endTime.trim(),
        maxPlayers,
      },
      {
        onError: (error: any) => {
          window.alert(error?.message || 'Could not update this live session.')
        },
        onSettled: () => setProcessingId(null),
        onSuccess: () => setOpsActionPanel(null),
      },
    )
  }

  const handlePublishOpsSessionDraft = (draft: OpsSessionDraftItem) => {
    const publishMeta = getOpsSessionDraftPublishMeta(draft)
    const publishReview = getOpsSessionDraftPublishReviewMeta(draft)
    const targetDate = publishMeta?.targetDate
    if (!targetDate) {
      window.alert('Prepare this session draft first so the publish date is explicit.')
      return
    }
    if (publishReview?.status === 'blocked') {
      window.alert(publishReview.summary || 'This session still has a live schedule conflict and cannot be published yet.')
      return
    }
    const confirmed = window.confirm(
      publishReview?.status === 'warn'
        ? `Publish ${draft.title} to the live schedule for ${targetDate} at ${draft.startTime}-${draft.endTime}?\n\nReview note: ${publishReview.summary || 'There are overlapping live sessions in this window.'}`
        : `Publish ${draft.title} to the live schedule for ${targetDate} at ${draft.startTime}-${draft.endTime}?`,
    )
    if (!confirmed) return

    setProcessingId(`opspublish:${draft.id}`)
    publishOpsSessionDraftToSchedule.mutate(
      { clubId, opsSessionDraftId: draft.id },
      {
        onSuccess: () => {
          router.push(`/clubs/${clubId}/intelligence/sessions`)
        },
        onError: (error: any) => {
          window.alert(error?.message || 'Could not publish this session draft to the live schedule.')
        },
        onSettled: () => setProcessingId(null),
      },
    )
  }

  const handleRollbackPublishedOpsSessionDraft = (draft: OpsSessionDraftItem) => {
    const aftercare = getOpsSessionDraftAftercareMeta(draft)
    if (!aftercare?.canRollback) {
      window.alert(aftercare?.rollbackSummary || 'Rollback is not available for this live session.')
      return
    }
    const confirmed = window.confirm(
      `Roll ${draft.title} back to the original publish plan?\n\n${aftercare.rollbackSummary || 'This will restore the live session to the draft you originally published.'}`,
    )
    if (!confirmed) return

    setProcessingId(`opsaftercare:rollback:${draft.id}`)
    rollbackPublishedOpsSessionDraft.mutate(
      { clubId, opsSessionDraftId: draft.id },
      {
        onError: (error: any) => {
          window.alert(error?.message || 'Could not roll this live session back to the original publish plan.')
        },
        onSettled: () => setProcessingId(null),
      },
    )
  }

  const handleCreatePublishedFillDraft = (draft: OpsSessionDraftItem) => {
    const publishMeta = getOpsSessionDraftPublishMeta(draft)
    const sessionId = publishMeta?.publishedPlaySessionId
    const fallbackPrompt = buildPublishedSessionFillPrompt(draft)
    const fallbackHref = draft.agentDraft
      ? buildAdvisorDraftRefineHref(clubId, {
          conversationId: draft.agentDraft.conversationId || null,
          originalIntent: draft.agentDraft.originalIntent || null,
        }, fallbackPrompt)
      : `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(fallbackPrompt)}`

    if (!sessionId) {
      router.push(fallbackHref)
      return
    }

    const existingFillDraft = fillSessionDraftBySessionId.get(sessionId)
    if (existingFillDraft) {
      router.push(buildAdvisorDraftHref(clubId, existingFillDraft))
      return
    }

    if (!createFillSessionDraftFromSchedule?.mutate) {
      router.push(fallbackHref)
      return
    }

    setProcessingId(`filldraft:${draft.id}`)
    setCreatingPublishedFillDraftId(draft.id)
    createFillSessionDraftFromSchedule.mutate(
      {
        clubId,
        sessionId,
        channel: 'email',
        candidateLimit: 5,
      },
      {
        onSuccess: (result: any) => {
          router.push(buildAdvisorConversationHref(clubId, result, fallbackPrompt))
        },
        onError: () => {
          router.push(fallbackHref)
        },
        onSettled: () => {
          setProcessingId((current) => (current === `filldraft:${draft.id}` ? null : current))
          setCreatingPublishedFillDraftId((current) => (current === draft.id ? null : current))
        },
      },
    )
  }

  const handleDailyTodoDecision = (
    item: DailyAdminTodoItem,
    decision: DailyAdminTodoDecision,
    bucket: DailyAdminTodoBucket,
    metadata?: Record<string, unknown>,
  ) => {
    setOptimisticDailyTodoDecisions((current) => ({
      ...current,
      [item.id]: decision,
    }))
    setNotNowPickerItemId(null)

    setAdminTodoDecision.mutate({
      clubId,
      dateKey: dailyTodoDateKey,
      itemId: item.id,
      decision,
      title: item.title,
      bucket: item.decisionBucket || bucket,
      href: item.href,
      metadata: {
        description: item.description,
        ctaLabel: item.ctaLabel,
        tone: item.tone,
        ...(item.decisionMetadata || {}),
        ...(metadata || {}),
      },
    })

    if (decision === 'accepted') {
      router.push(item.href)
    }
  }

  const resetDailyTodoDecisions = () => {
    setOptimisticDailyTodoDecisions({})
    setNotNowPickerItemId(null)
    clearAdminTodoDecisions.mutate({
      clubId,
      dateKey: dailyTodoDateKey,
    })
  }

  const handleNotNowClick = (itemId: string) => {
    const nextItemId = notNowPickerItemId === itemId ? null : itemId
    setNotNowPickerItemId(nextItemId)
    if (nextItemId) {
      setNotNowReminderChannel(preferredDailyTodoReminderChannel)
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg animate-pulse" style={{ background: "var(--subtle)" }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--card-bg)" }} />
          ))}
        </div>
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--card-bg)" }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <motion.div
        ref={headerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: "var(--heading)" }}>
              <span role="img" aria-label="robot">🤖</span> AI Agent
            </h1>
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
              style={{
                background: agentLive ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color: agentLive ? "#10B981" : "#F59E0B",
              }}
            >
              {agentLive ? "Live" : "Test Mode"}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
            Autonomous retention actions for your club
          </p>
        </div>
      </motion.div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#67E8F9", fontWeight: 700 }}>
              Agent Control Plane
            </div>
            <div className="text-base font-semibold mt-1" style={{ color: "var(--heading)" }}>
              Live actions now run through explicit rollout modes
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
              Publish, live edit, rollback, outreach, and external admin reminders now advertise whether they are locked, shadowed, or live.
            </div>
          </div>
          {controlPlane.killSwitch ? (
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "rgba(239,68,68,0.12)", color: "#F87171" }}
            >
              Kill Switch Active
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          {Object.values(controlPlane.actions).map((rule) => (
            <div
              key={rule.action}
              className="rounded-2xl p-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                  {rule.label}
                </div>
                <ControlPlaneModeBadge mode={rule.mode} />
              </div>
              <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                {rule.description}
              </div>
            </div>
          ))}
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#67E8F9", fontWeight: 700 }}>
            Current rollout
          </div>
          <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
            {controlPlaneSummary}
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
            {controlPlaneAudit ? (
              <>
                <div>
                  Last changed by <span style={{ color: "var(--t3)", fontWeight: 600 }}>{controlPlaneAudit.lastChangedByLabel || "Club admin"}</span>
                  {controlPlaneAudit.lastChangedAt
                    ? ` on ${new Date(controlPlaneAudit.lastChangedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : ''}
                </div>
                {controlPlaneAudit.summary ? <div>{controlPlaneAudit.summary}</div> : null}
              </>
            ) : (
              <div>No rollout changes have been recorded yet. The latest arm, shadow, or disable decision will appear here.</div>
            )}
          </div>
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#34D399", fontWeight: 700 }}>
                Live outreach health
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
                {outreachPilotHealth?.summary || "No live outreach outcomes yet."}
              </div>
            </div>
            <PilotHealthBadge health={outreachPilotHealth?.health || "idle"} />
          </div>

          <div className="grid gap-2 mt-3 sm:grid-cols-3">
            <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px]" style={{ color: "var(--t4)" }}>Delivery</div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
                {outreachPilotHealth?.totals.sent || 0} sent · {outreachPilotHealth?.totals.delivered || 0} delivered
              </div>
            </div>
            <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px]" style={{ color: "var(--t4)" }}>Engagement</div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
                {outreachPilotHealth?.totals.opened || 0} opened · {outreachPilotHealth?.totals.clicked || 0} clicked
              </div>
            </div>
            <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px]" style={{ color: "var(--t4)" }}>Results</div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
                {outreachPilotHealth?.totals.converted || 0} booked · {outreachPilotHealth?.totals.failed || 0} failed
              </div>
            </div>
          </div>

          <div className="grid gap-3 mt-3 lg:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#A78BFA", fontWeight: 700 }}>
                Strongest live action
              </div>
              {outreachPilotHealth?.topAction ? (
                <div className="rounded-2xl px-3 py-2 mt-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                      {outreachPilotHealth.topAction.label}
                    </div>
                    <PilotHealthBadge health={outreachPilotHealth.topAction.health} />
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                    {outreachPilotHealth.topAction.sent} sent · {outreachPilotHealth.topAction.deliveryRate}% delivered · {outreachPilotHealth.topAction.conversionRate}% booked
                  </div>
                </div>
              ) : (
                <div className="text-[11px] mt-2" style={{ color: "var(--t4)" }}>
                  No live outreach actions have executed in this window yet.
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#FCA5A5", fontWeight: 700 }}>
                Current pilot risk
              </div>
              {outreachPilotHealth?.atRiskAction ? (
                <div className="rounded-2xl px-3 py-2 mt-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                      {outreachPilotHealth.atRiskAction.label}
                    </div>
                    <PilotHealthBadge health={outreachPilotHealth.atRiskAction.health} />
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                    {outreachPilotHealth.atRiskAction.failed} failed · {outreachPilotHealth.atRiskAction.unsubscribed} opt-outs · {outreachPilotHealth.atRiskAction.failureRate}% failure rate
                  </div>
                </div>
              ) : (
                <div className="text-[11px] mt-2" style={{ color: "var(--t4)" }}>
                  No immediate live outreach risk surfaced in the recent pilot window.
                </div>
              )}
            </div>
          </div>

          {outreachPilotRecommendation ? (
            <div
              className="rounded-2xl px-4 py-3 mt-3"
              style={{
                background: outreachPilotRecommendation.health === 'at_risk'
                  ? 'rgba(239,68,68,0.08)'
                  : 'rgba(245,158,11,0.08)',
                border: outreachPilotRecommendation.health === 'at_risk'
                  ? '1px solid rgba(248,113,113,0.22)'
                  : '1px solid rgba(251,191,36,0.18)',
              }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: outreachPilotRecommendation.health === 'at_risk' ? '#FCA5A5' : '#FDE68A', fontWeight: 700 }}>
                    Shadow-back recommendation
                  </div>
                  <div className="text-sm font-semibold mt-1" style={{ color: 'var(--heading)' }}>
                    {outreachPilotRecommendation.label} is the current rollout risk.
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--t4)', lineHeight: 1.6 }}>
                    {outreachPilotRecommendation.reason}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleShadowBackOutreachAction}
                  disabled={
                    !!processingId
                    || shadowBackOutreachRolloutAction.isPending
                    || rolloutManagePermission?.allowed === false
                  }
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--heading)',
                  }}
                >
                  {processingId === `shadowback:${outreachPilotRecommendation.actionKind}` || shadowBackOutreachRolloutAction.isPending
                    ? 'Moving to shadow...'
                    : 'Move back to shadow'}
                </button>
              </div>
              {rolloutManagePermission?.allowed === false ? (
                <div className="text-[11px] mt-2" style={{ color: '#FCA5A5', lineHeight: 1.5 }}>
                  {rolloutManagePermission.reason || 'Only admins with rollout permissions can change live outreach posture.'}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#FDE68A", fontWeight: 700 }}>
            Outreach live rollout
          </div>
          <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
            {outreachRolloutSummary}
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
            {outreachRolloutStatus?.envAllowlistConfigured
              ? outreachRolloutStatus?.clubAllowlisted
                ? "This club is on the server rollout allowlist, so armed outreach actions can go live."
                : "This club is still outside the server rollout allowlist, so outreach stays shadow-only."
              : "No rollout clubs are configured in the server env yet, so outreach stays shadow-only."}
          </div>
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#A78BFA", fontWeight: 700 }}>
                Rollout dashboard
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
                {armedOutreachRolloutActions.length} of {outreachRolloutActions.length || 5} outreach actions armed
              </div>
            </div>
            <div className="text-[11px]" style={{ color: "var(--t4)", textAlign: "right" }}>
              {outreachRolloutStatus?.clubAllowlisted
                ? "Live-ready once the control plane stays in Live."
                : "Still shadow-only until this club is allowlisted."}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {outreachRolloutActions.length > 0 ? outreachRolloutActions.map((action) => (
              <div
                key={action.actionKind}
                className="px-2.5 py-1 rounded-full text-[10px]"
                style={{
                  fontWeight: 700,
                  background: action.enabled ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.14)",
                  color: action.enabled ? "#10B981" : "var(--t3)",
                }}
              >
                {action.label}: {action.enabled ? "armed" : "shadow"}
              </div>
            )) : (
              <div className="text-[11px]" style={{ color: "var(--t4)" }}>
                No outreach rollout actions configured yet.
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#FCA5A5", fontWeight: 700 }}>
              Recent blocked or shadowed outreach
            </div>
            {recentOutreachRolloutDecisions.length === 0 ? (
              <div className="text-[11px]" style={{ color: "var(--t4)" }}>
                No recent outreach rollout interruptions. When live outreach is shadowed or blocked, the reason will show up here.
              </div>
            ) : (
              recentOutreachRolloutDecisions.slice(0, 4).map((record) => (
                <div
                  key={record.id}
                  className="rounded-2xl px-3 py-2"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                      {record.metadata?.label || record.summary}
                    </div>
                    <div
                      className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{
                        fontWeight: 700,
                        background: record.result === "shadowed" ? "rgba(250,204,21,0.14)" : "rgba(248,113,113,0.14)",
                        color: record.result === "shadowed" ? "#FACC15" : "#F87171",
                      }}
                    >
                      {record.result}
                    </div>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                    {record.summary}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#67E8F9", fontWeight: 700 }}>
            Action permissions
          </div>
          <div className="text-sm font-semibold mt-1" style={{ color: "var(--heading)" }}>
            {permissionSummary}
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
            {currentClubRole ? (
              <div>
                Your club role: <span style={{ color: "var(--t3)", fontWeight: 600 }}>{formatClubAdminRole(currentClubRole)}</span>
              </div>
            ) : null}
            {rolloutManagePermission && !rolloutManagePermission.allowed ? (
              <div style={{ color: "#F87171" }}>{rolloutManagePermission.reason}</div>
            ) : (
              <div>Action-level permissions now decide who can draft, approve, publish, roll back, and manage rollout settings.</div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
              Recent Live Decisions
            </div>
            <div className="text-[11px]" style={{ color: "var(--t4)" }}>
              Ledger of recent publish/edit/rollback control-plane outcomes
            </div>
          </div>
          {recentDecisionRecords.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "var(--t4)",
              }}
            >
              No live decisions recorded yet. Once someone publishes, edits, rolls back, or shadows a live action, the ledger will show it here.
            </div>
          ) : (
            <div className="space-y-2">
              {recentDecisionRecords.slice(0, 5).map((record) => (
                <div
                  key={record.id}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                          {formatControlPlaneActionLabel(record.action)}
                        </div>
                        <ControlPlaneModeBadge mode={record.mode} />
                        <ControlPlaneDecisionResultBadge result={record.result} />
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                        {record.summary}
                      </div>
                    </div>
                    <div className="text-[11px] text-right shrink-0" style={{ color: "var(--t4)" }}>
                      <div>{new Date(record.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                      <div className="mt-1">
                        {record.user?.name || record.user?.email || 'Agent'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {opsActionPanel && opsActionPanelDraft ? (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#67E8F9", fontWeight: 700 }}>
                  {opsActionPanel.type === 'assign_teammate'
                    ? 'Assign teammate'
                    : opsActionPanel.type === 'prepare_publish'
                      ? 'Prepare controlled publish'
                      : 'Published session aftercare'}
                </div>
                <div className="text-base font-semibold mt-1" style={{ color: "var(--heading)" }}>
                  {opsActionPanelDraft.title}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                  {opsActionPanelDraft.dayOfWeek} · {opsActionPanelDraft.startTime}-{opsActionPanelDraft.endTime} · {formatProgrammingValue(opsActionPanelDraft.format)} · {formatProgrammingValue(opsActionPanelDraft.skillLevel)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpsActionPanel(null)}
                className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--card-border)",
                  color: "var(--t3)",
                }}
              >
                Close
              </button>
            </div>

            {opsActionPanel.type === 'assign_teammate' ? (
              <>
                <p className="text-sm" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                  Pick who should own this ops draft next. The agent will update the owner handoff and drop it into that teammate’s queue.
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {assignableOpsTeammates.map((teammate) => {
                    const active = opsActionPanel.assigneeUserId === teammate.id
                    const currentOwnerId = getOpsWorkflowMeta(opsActionPanelDraft)?.ownerUserId
                    const isCurrentOwner = currentOwnerId === teammate.id
                    return (
                      <button
                        key={teammate.id}
                        type="button"
                        onClick={() =>
                          setOpsActionPanel((current) =>
                            current?.type === 'assign_teammate'
                              ? { ...current, assigneeUserId: teammate.id }
                              : current,
                          )
                        }
                        className="rounded-xl p-3 text-left transition-colors"
                        style={{
                          background: active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.04)",
                          border: active ? "1px solid rgba(103,232,249,0.22)" : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: active ? "#67E8F9" : "var(--heading)" }}>
                              {teammate.label}
                            </div>
                            <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                              {teammate.role}
                              {teammate.email ? ` · ${teammate.email}` : ''}
                            </div>
                          </div>
                          {isCurrentOwner ? (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "rgba(59,130,246,0.12)", color: "#60A5FA" }}
                            >
                              Current owner
                            </span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={submitAssignTeammate}
                    disabled={processingId === `opswf:assign_teammate:${opsActionPanel.draftId}`}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium transition-opacity"
                    style={{
                      background: "rgba(6,182,212,0.12)",
                      border: "1px solid rgba(6,182,212,0.22)",
                      color: "#67E8F9",
                      opacity: processingId === `opswf:assign_teammate:${opsActionPanel.draftId}` ? 0.7 : 1,
                    }}
                  >
                    {processingId === `opswf:assign_teammate:${opsActionPanel.draftId}` ? 'Assigning…' : 'Assign teammate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsActionPanel(null)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--card-border)",
                      color: "var(--t3)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : opsActionPanel.type === 'prepare_publish' ? (
              <>
                <p className="text-sm" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                  Set the live schedule date and any title or description override before this session goes through controlled publish review.
                </p>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Live schedule date
                      </div>
                      <input
                        type="date"
                        value={opsActionPanel.publishDate}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'prepare_publish'
                              ? { ...current, publishDate: event.target.value }
                              : current,
                          )
                        }
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Session title
                      </div>
                      <input
                        type="text"
                        value={opsActionPanel.title}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'prepare_publish'
                              ? { ...current, title: event.target.value }
                              : current,
                          )
                        }
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Description override
                      </div>
                      <textarea
                        value={opsActionPanel.description}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'prepare_publish'
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                        rows={4}
                        className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                  </div>

                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      background:
                        opsActionPanelPublishReview?.status === 'blocked'
                          ? "rgba(239,68,68,0.06)"
                          : opsActionPanelPublishReview?.status === 'warn'
                            ? "rgba(245,158,11,0.08)"
                            : "rgba(16,185,129,0.06)",
                      border:
                        opsActionPanelPublishReview?.status === 'blocked'
                          ? "1px solid rgba(239,68,68,0.16)"
                          : opsActionPanelPublishReview?.status === 'warn'
                            ? "1px solid rgba(245,158,11,0.16)"
                            : "1px solid rgba(16,185,129,0.16)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                        Publish review snapshot
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background:
                            opsActionPanelPublishReview?.status === 'blocked'
                              ? "rgba(239,68,68,0.12)"
                              : opsActionPanelPublishReview?.status === 'warn'
                                ? "rgba(245,158,11,0.12)"
                                : "rgba(16,185,129,0.12)",
                          color:
                            opsActionPanelPublishReview?.status === 'blocked'
                              ? "#EF4444"
                              : opsActionPanelPublishReview?.status === 'warn'
                                ? "#F59E0B"
                                : "#10B981",
                        }}
                      >
                        {opsActionPanelPublishReview?.status === 'blocked'
                          ? 'Blocked'
                          : opsActionPanelPublishReview?.status === 'warn'
                            ? 'Review needed'
                            : 'Clear'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                      {opsActionPanelPublishMeta?.targetDate
                        ? `Latest review for ${opsActionPanelPublishMeta.targetDate}`
                        : 'This draft has not been reviewed for publish yet'}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                      {opsActionPanelPublishReview?.summary || 'Saving this publish plan will refresh the review against the current live schedule before you publish.'}
                    </div>
                    {opsActionPanelPublishReview ? (
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Blockers', value: opsActionPanelPublishReview.blockers?.length || 0, color: '#EF4444' },
                          { label: 'Warnings', value: opsActionPanelPublishReview.warnings?.length || 0, color: '#F59E0B' },
                          { label: 'Related live', value: opsActionPanelPublishReview.relatedSessions?.length || 0, color: '#06B6D4' },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-lg px-2.5 py-2 min-w-[88px]"
                            style={{ background: `${item.color}10`, border: `1px solid ${item.color}16` }}
                          >
                            <div className="text-[10px]" style={{ color: item.color }}>{item.label}</div>
                            <div className="text-sm font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {opsActionPanelPublishReview?.relatedSessions?.length ? (
                      <div className="space-y-1">
                        {opsActionPanelPublishReview.relatedSessions.slice(0, 2).map((session) => (
                          <div key={`${session.id || session.title}:${session.reason || 'related'}`} className="text-[10px]" style={{ color: "var(--t4)", lineHeight: 1.45 }}>
                            {session.title || 'Live session'} · {session.startTime}-{session.endTime}
                            {session.reason ? ` · ${session.reason.replace(/_/g, ' ')}` : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={submitPreparedPublishPlan}
                    disabled={processingId === `opspubprep:${opsActionPanel.draftId}`}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium transition-opacity"
                    style={{
                      background: "rgba(16,185,129,0.10)",
                      border: "1px solid rgba(16,185,129,0.18)",
                      color: "#10B981",
                      opacity: processingId === `opspubprep:${opsActionPanel.draftId}` ? 0.7 : 1,
                    }}
                  >
                    {processingId === `opspubprep:${opsActionPanel.draftId}` ? 'Preparing…' : 'Save publish plan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsActionPanel(null)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--card-border)",
                      color: "var(--t3)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                  Review how the live session drifted from the original publish plan, then either update the live session in place or roll it back to the baseline draft.
                </p>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Live schedule date
                      </div>
                      <input
                        type="date"
                        value={opsActionPanel.publishDate}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'edit_published_session'
                              ? { ...current, publishDate: event.target.value }
                              : current,
                          )
                        }
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                          Start time
                        </div>
                        <input
                          type="time"
                          value={opsActionPanel.startTime}
                          onChange={(event) =>
                            setOpsActionPanel((current) =>
                              current?.type === 'edit_published_session'
                                ? { ...current, startTime: event.target.value }
                                : current,
                            )
                          }
                          className="w-full rounded-xl px-3 py-2 text-sm"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--card-border)",
                            color: "var(--heading)",
                          }}
                        />
                      </label>
                      <label className="block">
                        <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                          End time
                        </div>
                        <input
                          type="time"
                          value={opsActionPanel.endTime}
                          onChange={(event) =>
                            setOpsActionPanel((current) =>
                              current?.type === 'edit_published_session'
                                ? { ...current, endTime: event.target.value }
                                : current,
                            )
                          }
                          className="w-full rounded-xl px-3 py-2 text-sm"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--card-border)",
                            color: "var(--heading)",
                          }}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Session title
                      </div>
                      <input
                        type="text"
                        value={opsActionPanel.title}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'edit_published_session'
                              ? { ...current, title: event.target.value }
                              : current,
                          )
                        }
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Max players
                      </div>
                      <input
                        type="number"
                        min={2}
                        max={64}
                        value={opsActionPanel.maxPlayers}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'edit_published_session'
                              ? { ...current, maxPlayers: event.target.value }
                              : current,
                          )
                        }
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--heading)" }}>
                        Live description
                      </div>
                      <textarea
                        value={opsActionPanel.description}
                        onChange={(event) =>
                          setOpsActionPanel((current) =>
                            current?.type === 'edit_published_session'
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                        rows={4}
                        className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--card-border)",
                          color: "var(--heading)",
                        }}
                      />
                    </label>
                  </div>

                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      background:
                        opsActionPanelAftercare?.rollbackStatus === 'blocked'
                          ? "rgba(239,68,68,0.06)"
                          : opsActionPanelAftercare?.rollbackStatus === 'warn'
                            ? "rgba(245,158,11,0.08)"
                            : "rgba(16,185,129,0.06)",
                      border:
                        opsActionPanelAftercare?.rollbackStatus === 'blocked'
                          ? "1px solid rgba(239,68,68,0.16)"
                          : opsActionPanelAftercare?.rollbackStatus === 'warn'
                            ? "1px solid rgba(245,158,11,0.16)"
                            : "1px solid rgba(16,185,129,0.16)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                        Aftercare diff
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background:
                            opsActionPanelAftercare?.status === 'missing'
                              ? "rgba(239,68,68,0.12)"
                              : opsActionPanelAftercare?.status === 'drifted'
                                ? "rgba(245,158,11,0.12)"
                                : "rgba(16,185,129,0.12)",
                          color:
                            opsActionPanelAftercare?.status === 'missing'
                              ? "#EF4444"
                              : opsActionPanelAftercare?.status === 'drifted'
                                ? "#F59E0B"
                                : "#10B981",
                        }}
                      >
                        {opsActionPanelAftercare?.status === 'missing'
                          ? 'Missing live session'
                          : opsActionPanelAftercare?.status === 'drifted'
                            ? 'Drift detected'
                            : 'Aligned'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                      {opsActionPanelAftercare?.summary || 'The live session still matches the original publish plan.'}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                      {opsActionPanelAftercare?.recommendedAction || 'Use this panel to keep the live session aligned with the original publish plan.'}
                    </div>
                    {opsActionPanelAftercare?.driftedFields?.length ? (
                      <div className="space-y-2">
                        {opsActionPanelAftercare.driftedFields.slice(0, 4).map((item) => (
                          <div
                            key={`${item.field || item.label}:${item.liveValue || item.draftValue}`}
                            className="rounded-lg p-2"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            <div className="text-[10px]" style={{ color: "#67E8F9", fontWeight: 700 }}>
                              {item.label || item.field}
                            </div>
                            <div className="text-[10px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.45 }}>
                              Draft: {item.draftValue || 'None'}
                            </div>
                            <div className="text-[10px]" style={{ color: "var(--t3)", lineHeight: 1.45 }}>
                              Live: {item.liveValue || 'None'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {(opsActionPanelAftercare?.blockers?.length || opsActionPanelAftercare?.warnings?.length) ? (
                      <div className="space-y-1">
                        {(opsActionPanelAftercare.blockers || []).slice(0, 2).map((item) => (
                          <div key={item} className="text-[10px]" style={{ color: "#EF4444", lineHeight: 1.45 }}>
                            {item}
                          </div>
                        ))}
                        {!(opsActionPanelAftercare.blockers || []).length && (opsActionPanelAftercare.warnings || []).slice(0, 2).map((item) => (
                          <div key={item} className="text-[10px]" style={{ color: "#F59E0B", lineHeight: 1.45 }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="text-[10px]" style={{ color: "var(--t4)", lineHeight: 1.45 }}>
                      {opsActionPanelAftercare?.rollbackSummary || 'Rollback is available only when the live session is still safe to restore.'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={submitPublishedSessionAftercareEdit}
                    disabled={processingId === `opsaftercare:update:${opsActionPanel.draftId}`}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium transition-opacity"
                    style={{
                      background: "rgba(6,182,212,0.12)",
                      border: "1px solid rgba(6,182,212,0.22)",
                      color: "#67E8F9",
                      opacity: processingId === `opsaftercare:update:${opsActionPanel.draftId}` ? 0.7 : 1,
                    }}
                  >
                    {processingId === `opsaftercare:update:${opsActionPanel.draftId}` ? 'Saving live edit…' : 'Save live edits'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRollbackPublishedOpsSessionDraft(opsActionPanelDraft)}
                    disabled={!opsActionPanelAftercare?.canRollback || processingId === `opsaftercare:rollback:${opsActionPanel.draftId}`}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium transition-opacity"
                    style={{
                      background: "rgba(245,158,11,0.10)",
                      border: "1px solid rgba(245,158,11,0.18)",
                      color: "#F59E0B",
                      opacity: !opsActionPanelAftercare?.canRollback || processingId === `opsaftercare:rollback:${opsActionPanel.draftId}` ? 0.55 : 1,
                    }}
                  >
                    {processingId === `opsaftercare:rollback:${opsActionPanel.draftId}` ? 'Rolling back…' : 'Rollback to publish plan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsActionPanel(null)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--card-border)",
                      color: "var(--t3)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </Card>
        </motion.div>
      ) : null}

      {/* ── KPI Cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          {
            label: "Actions Today",
            value: stats?.actionsToday ?? 0,
            icon: Zap,
            color: "#8B5CF6",
          },
          {
            label: "Actions This Week",
            value: stats?.actionsWeek ?? 0,
            icon: Activity,
            color: "#06B6D4",
          },
          {
            label: "Auto-approved",
            value: `${stats?.autoApprovedPct ?? 0}%`,
            icon: CheckCircle2,
            color: "#10B981",
          },
          {
            label: "Conversion Rate",
            value: `${stats?.conversionRate ?? 0}%`,
            icon: TrendingUp,
            color: "#F59E0B",
          },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${kpi.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: kpi.color }} />
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--heading)" }}>
                    {kpi.value}
                  </div>
                  <div className="text-xs" style={{ color: "var(--t4)" }}>
                    {kpi.label}
                  </div>
                </div>
              </div>
            </Card>
          )
      })}
      </motion.div>

      {/* ── Unified Daily Command Center ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
      >
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color: "#10B981" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                  Unified Daily Command Center
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                One command surface for approvals, live aftercare, ops handoffs, programming pressure, and reminders. {dailyCommandCenter.summary}
              </p>
            </div>
            <div
              className="text-[11px] px-3 py-1.5 rounded-full font-medium shrink-0"
              style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
            >
              {dailyCommandCenter.headline}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {dailyCommandCenter.quickActions.map((action) => {
              const isDanger = action.tone === 'danger'
              const isWarn = action.tone === 'warn'
              const isSuccess = action.tone === 'success'

              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                  style={{
                    background: isDanger
                      ? "rgba(239,68,68,0.10)"
                      : isWarn
                        ? "rgba(245,158,11,0.10)"
                        : isSuccess
                          ? "rgba(16,185,129,0.10)"
                          : "rgba(255,255,255,0.05)",
                    color: isDanger
                      ? "#EF4444"
                      : isWarn
                        ? "#F59E0B"
                        : isSuccess
                          ? "#10B981"
                          : "var(--t3)",
                    border: isDanger
                      ? "1px solid rgba(239,68,68,0.18)"
                      : isWarn
                        ? "1px solid rgba(245,158,11,0.18)"
                        : isSuccess
                          ? "1px solid rgba(16,185,129,0.18)"
                          : "1px solid var(--card-border)",
                  }}
                >
                  {action.label}
                </Link>
              )
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
            {dailyCommandCenter.modules.map((card) => {
              const styles = dailyTodoToneStyles(card.tone)

              return (
                <div
                  key={card.id}
                  className="rounded-xl p-3"
                  style={{
                    background: styles.bg,
                    border: `1px solid ${styles.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: styles.title }}>
                        {card.eyebrow}
                      </div>
                      <div className="text-[13px] font-semibold mt-1" style={{ color: "var(--heading)", lineHeight: 1.35 }}>
                        {card.title}
                      </div>
                    </div>
                    {card.count !== undefined && card.count !== null && card.count !== '' && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                      >
                        {card.count}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] mt-2 min-h-[52px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {card.description}
                  </div>

                  {card.bullets && card.bullets.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {card.bullets.slice(0, 3).map((bullet) => (
                        <div
                          key={bullet}
                          className="text-[10px]"
                          style={{ color: "var(--t3)", lineHeight: 1.45 }}
                        >
                          • {bullet}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={card.href}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                      style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                    >
                      {card.ctaLabel}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                    {card.secondaryActions?.map((action) => {
                      const isDanger = action.tone === 'danger'
                      const isWarn = action.tone === 'warn'
                      const isSuccess = action.tone === 'success'

                      return (
                        <Link
                          key={action.label}
                          href={action.href}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: isDanger
                              ? "rgba(239,68,68,0.10)"
                              : isWarn
                                ? "rgba(245,158,11,0.10)"
                                : isSuccess
                                  ? "rgba(16,185,129,0.10)"
                                  : "rgba(255,255,255,0.05)",
                            color: isDanger
                              ? "#EF4444"
                              : isWarn
                                ? "#F59E0B"
                                : isSuccess
                                  ? "#10B981"
                                  : "var(--t3)",
                            border: isDanger
                              ? "1px solid rgba(239,68,68,0.18)"
                              : isWarn
                                ? "1px solid rgba(245,158,11,0.18)"
                                : isSuccess
                                  ? "1px solid rgba(16,185,129,0.18)"
                                  : "1px solid var(--card-border)",
                          }}
                        >
                          {action.label}
                        </Link>
                      )
                    })}
                    {card.workflowActions?.map((action) => {
                      const key =
                        action.action === 'promote'
                          ? `ops:${action.opsDraftId}`
                          : action.action === 'create_fill_draft'
                            ? `filldraft:${action.opsDraftId}`
                            : action.action === 'prepare_publish'
                              ? `opspubprep:${action.opsDraftId}`
                              : action.action === 'publish_now'
                                ? `opspublish:${action.opsDraftId}`
                                : `opswf:${action.action}:${action.opsDraftId}`
                      const isRunning = processingId === key
                      const isDanger = action.tone === 'danger'
                      const isWarn = action.tone === 'warn'
                      const isSuccess = action.tone === 'success'

                      return (
                        <button
                          key={`${action.label}-${action.opsDraftId}`}
                          onClick={() => {
                            if (action.action === 'promote') {
                              handlePromoteOpsSessionDraft(action.opsDraftId)
                            } else if (action.action === 'create_fill_draft') {
                              const draft = (opsSessionDrafts || []).find((item) => item.id === action.opsDraftId)
                              if (!draft) return
                              handleCreatePublishedFillDraft(draft)
                            } else if (action.action === 'assign_teammate') {
                              handleAssignTeammateStart(action.opsDraftId)
                            } else if (action.action === 'prepare_publish' || action.action === 'publish_now') {
                              const draft = (opsSessionDrafts || []).find((item) => item.id === action.opsDraftId)
                              if (!draft) return
                              if (action.action === 'prepare_publish') {
                                handlePrepareOpsSessionDraftPublish(draft)
                              } else {
                                handlePublishOpsSessionDraft(draft)
                              }
                            } else {
                              handleUpdateOpsSessionDraftWorkflow(action.opsDraftId, action.action)
                            }
                          }}
                          disabled={isRunning}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: isDanger
                              ? "rgba(239,68,68,0.10)"
                              : isWarn
                                ? "rgba(245,158,11,0.10)"
                                : isSuccess
                                  ? "rgba(16,185,129,0.10)"
                                  : "rgba(255,255,255,0.05)",
                            color: isDanger
                              ? "#EF4444"
                              : isWarn
                                ? "#F59E0B"
                                : isSuccess
                                  ? "#10B981"
                                  : "var(--t3)",
                            border: isDanger
                              ? "1px solid rgba(239,68,68,0.18)"
                              : isWarn
                                ? "1px solid rgba(245,158,11,0.18)"
                                : isSuccess
                                  ? "1px solid rgba(16,185,129,0.18)"
                                  : "1px solid var(--card-border)",
                            opacity: isRunning ? 0.7 : 1,
                          }}
                        >
                          {isRunning ? 'Working…' : action.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </motion.div>

      {integrationAnomalyQueue && integrationAnomalyQueue.suggested.length > 0 && (
        <IntegrationWatchlistCard
          clubId={clubId}
          isDark={isDark}
          queue={integrationAnomalyQueue}
          decisionMap={integrationAnomalyDecisionMap}
        />
      )}

      {/* ── Today's Ops Brief ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.11 }}
      >
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" style={{ color: "#06B6D4" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                  {dailyOwnershipCopy.briefTitle}
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                {dailyOwnershipCopy.briefDescription} {dailyOpsBrief.summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {[
                { key: 'team' as const, label: 'Team view' },
                { key: 'mine' as const, label: 'My work' },
              ].map((option) => {
                const active = dailyOwnershipView === option.key
                const disabled = option.key === 'mine' && !currentUserId
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => !disabled && setDailyOwnershipView(option.key)}
                    disabled={disabled}
                    className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: active ? "rgba(6,182,212,0.12)" : "rgba(255,255,255,0.05)",
                      color: disabled ? "var(--t4)" : active ? "#06B6D4" : "var(--t3)",
                      border: active ? "1px solid rgba(6,182,212,0.2)" : "1px solid var(--card-border)",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
              <div
                className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4" }}
              >
                {dailyOpsBrief.headline}
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${dailyOpsBrief.cards.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-3`}>
            {dailyOpsBrief.cards.map((card) => {
              const styles = dailyTodoToneStyles(card.tone)

              return (
                <div
                  key={card.id}
                  className="rounded-xl p-3"
                  style={{
                    background: styles.bg,
                    border: `1px solid ${styles.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: styles.title }}>
                        {card.eyebrow}
                      </div>
                      <div className="text-[13px] font-semibold mt-1" style={{ color: "var(--heading)", lineHeight: 1.35 }}>
                        {card.title}
                      </div>
                    </div>
                    {card.count !== undefined && card.count !== null && card.count !== '' && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                      >
                        {card.count}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] mt-2 min-h-[52px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {card.description}
                  </div>

                  {card.bullets && card.bullets.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {card.bullets.slice(0, 3).map((bullet) => (
                        <div
                          key={bullet}
                          className="text-[10px]"
                          style={{ color: "var(--t3)", lineHeight: 1.45 }}
                        >
                          • {bullet}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={card.href}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                      style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                    >
                      {card.ctaLabel}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                    {card.secondaryActions?.map((action) => {
                      const isDanger = action.tone === 'danger'
                      const isWarn = action.tone === 'warn'
                      const isSuccess = action.tone === 'success'

                      return (
                        <Link
                          key={action.label}
                          href={action.href}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: isDanger
                              ? "rgba(239,68,68,0.10)"
                              : isWarn
                                ? "rgba(245,158,11,0.10)"
                                : isSuccess
                                  ? "rgba(16,185,129,0.10)"
                                  : "rgba(255,255,255,0.05)",
                            color: isDanger
                              ? "#EF4444"
                              : isWarn
                                ? "#F59E0B"
                                : isSuccess
                                  ? "#10B981"
                                  : "var(--t3)",
                            border: isDanger
                              ? "1px solid rgba(239,68,68,0.18)"
                              : isWarn
                                ? "1px solid rgba(245,158,11,0.18)"
                                : isSuccess
                                  ? "1px solid rgba(16,185,129,0.18)"
                                  : "1px solid var(--card-border)",
                          }}
                        >
                          {action.label}
                        </Link>
                      )
                    })}
                    {card.workflowActions?.map((action) => {
                      const key =
                        action.action === 'promote'
                          ? `ops:${action.opsDraftId}`
                          : action.action === 'create_fill_draft'
                            ? `filldraft:${action.opsDraftId}`
                          : action.action === 'prepare_publish'
                            ? `opspubprep:${action.opsDraftId}`
                            : action.action === 'publish_now'
                              ? `opspublish:${action.opsDraftId}`
                              : `opswf:${action.action}:${action.opsDraftId}`
                      const isRunning = processingId === key
                      const isDanger = action.tone === 'danger'
                      const isWarn = action.tone === 'warn'
                      const isSuccess = action.tone === 'success'

                      return (
                        <button
                          key={`${action.label}-${action.opsDraftId}`}
                          onClick={() => {
                            if (action.action === 'promote') {
                              handlePromoteOpsSessionDraft(action.opsDraftId)
                            } else if (action.action === 'create_fill_draft') {
                              const draft = (opsSessionDrafts || []).find((item) => item.id === action.opsDraftId)
                              if (!draft) return
                              handleCreatePublishedFillDraft(draft)
                            } else if (action.action === 'assign_teammate') {
                              handleAssignTeammateStart(action.opsDraftId)
                            } else if (action.action === 'prepare_publish' || action.action === 'publish_now') {
                              const draft = (opsSessionDrafts || []).find((item) => item.id === action.opsDraftId)
                              if (!draft) return
                              if (action.action === 'prepare_publish') {
                                handlePrepareOpsSessionDraftPublish(draft)
                              } else {
                                handlePublishOpsSessionDraft(draft)
                              }
                            } else {
                              handleUpdateOpsSessionDraftWorkflow(action.opsDraftId, action.action)
                            }
                          }}
                          disabled={isRunning}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: isDanger
                              ? "rgba(239,68,68,0.10)"
                              : isWarn
                                ? "rgba(245,158,11,0.10)"
                                : isSuccess
                                  ? "rgba(16,185,129,0.10)"
                                  : "rgba(255,255,255,0.05)",
                            color: isDanger
                              ? "#EF4444"
                              : isWarn
                                ? "#F59E0B"
                                : isSuccess
                                  ? "#10B981"
                                  : "var(--t3)",
                            border: isDanger
                              ? "1px solid rgba(239,68,68,0.18)"
                              : isWarn
                                ? "1px solid rgba(245,158,11,0.18)"
                                : isSuccess
                                  ? "1px solid rgba(16,185,129,0.18)"
                                  : "1px solid var(--card-border)",
                            opacity: isRunning ? 0.7 : 1,
                          }}
                        >
                          {isRunning ? 'Working…' : action.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </motion.div>

      {/* ── Daily Admin To-Do ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                  Daily Admin To-Do
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                {dailyOwnershipCopy.todoDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {[
                { key: 'team' as const, label: 'Team view' },
                { key: 'mine' as const, label: 'My work' },
              ].map((option) => {
                const active = dailyOwnershipView === option.key
                const disabled = option.key === 'mine' && !currentUserId
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => !disabled && setDailyOwnershipView(option.key)}
                    disabled={disabled}
                    className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                      color: disabled ? "var(--t4)" : active ? "#10B981" : "var(--t3)",
                      border: active ? "1px solid rgba(16,185,129,0.2)" : "1px solid var(--card-border)",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
              {handledDailyTodoItems.length > 0 && (
                <button
                  onClick={resetDailyTodoDecisions}
                  className="text-[11px] font-medium"
                  style={{ color: "var(--t3)" }}
                >
                  Reset today
                </button>
              )}
            </div>
          </div>

          {handledDailyTodoItems.length > 0 && (
            <div
              className="rounded-xl p-3 mb-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="text-[11px] font-medium" style={{ color: "var(--heading)" }}>
                Handled today
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {handledDailyTodoCounts.accepted > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
                  >
                    {handledDailyTodoCounts.accepted} accepted
                  </span>
                )}
                {handledDailyTodoCounts.notNow > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}
                  >
                    {handledDailyTodoCounts.notNow} not now
                  </span>
                )}
                {handledDailyTodoCounts.declined > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}
                  >
                    {handledDailyTodoCounts.declined} declined
                  </span>
                )}
              </div>
              {upcomingDailyReminders.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {upcomingDailyReminders.slice(0, 3).map((reminder) => (
                    <div
                      key={reminder.itemId}
                      className="text-[11px]"
                      style={{ color: "var(--t3)", lineHeight: 1.45 }}
                    >
                      <span style={{ color: "var(--heading)" }}>{reminder.title}</span>
                      {" "}
                      comes back {reminder.label} via {formatAdminReminderDeliveryMode(reminder.channel)}.
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
            {dailyAdminTodoSections.map((section) => (
              (() => {
                const activeItems = section.items.filter((item) => !dailyTodoDecisions[item.id])
                const handledItems = section.items.filter((item) => !!dailyTodoDecisions[item.id])

                return (
                  <div
                    key={section.key}
                    className="rounded-xl p-3"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                          {section.label}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                          {section.description}
                        </div>
                      </div>
                      <div
                        className="min-w-[28px] h-7 px-2 rounded-full inline-flex items-center justify-center text-[11px] font-bold"
                        style={{ background: `${section.color}14`, color: section.color }}
                      >
                        {activeItems.length}
                      </div>
                    </div>

                    <div className="space-y-3 mt-4">
                      {activeItems.length === 0 ? (
                        <div
                          className="rounded-lg px-3 py-4 text-[11px]"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px dashed var(--card-border)",
                            color: "var(--t4)",
                            lineHeight: 1.5,
                          }}
                        >
                          {handledItems.length > 0 ? "Everything in this bucket is already handled for today." : "Nothing urgent here right now."}
                        </div>
                      ) : (
                        activeItems.map((item) => {
                          const styles = dailyTodoToneStyles(item.tone)
                          return (
                            <div
                              key={item.id}
                              className="rounded-lg p-3"
                              style={{
                                background: styles.bg,
                                border: `1px solid ${styles.border}`,
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-[12px] font-semibold" style={{ color: styles.title }}>
                                  {item.title}
                                </div>
                                {item.count !== undefined && item.count !== null && item.count !== '' && (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                                    style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                                  >
                                    {item.count}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] mt-2 min-h-[44px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                                {item.description}
                              </div>

                              <div className="flex flex-wrap gap-2 mt-3">
                                <button
                                  onClick={() => handleDailyTodoDecision(item, 'accepted', section.key)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.22)", color: "#10B981" }}
                                >
                                  Accept
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleNotNowClick(item.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", color: "#F59E0B" }}
                                >
                                  Not now
                                </button>
                                <button
                                  onClick={() => handleDailyTodoDecision(item, 'declined', section.key)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444" }}
                                >
                                  Decline
                                </button>
                              </div>
                              {notNowPickerItemId === item.id && (
                                <div
                                  className="mt-3 rounded-lg p-2.5"
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid var(--card-border)",
                                  }}
                                >
                                  <div className="text-[10px] font-medium mb-2" style={{ color: "var(--heading)" }}>
                                    How should I remind you?
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {dailyTodoReminderChannelOptions.map((option) => {
                                      const isSelected = notNowReminderChannel === option.id
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          disabled={!option.available}
                                          onClick={() => setNotNowReminderChannel(option.id)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium transition-colors disabled:cursor-not-allowed"
                                          style={{
                                            background: option.available
                                              ? isSelected
                                                ? "rgba(6,182,212,0.14)"
                                                : "rgba(255,255,255,0.06)"
                                              : "rgba(255,255,255,0.03)",
                                            border: option.available
                                              ? isSelected
                                                ? "1px solid rgba(6,182,212,0.28)"
                                                : "1px solid var(--card-border)"
                                              : "1px solid rgba(255,255,255,0.05)",
                                            color: option.available
                                              ? isSelected
                                                ? "#06B6D4"
                                                : "var(--t3)"
                                              : "rgba(148,163,184,0.45)",
                                          }}
                                          title={option.description}
                                        >
                                          {option.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <div className="text-[10px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.45 }}>
                                    This reminder will come back via{" "}
                                    <span style={{ color: "var(--heading)" }}>
                                      {formatAdminReminderDeliveryMode(notNowReminderChannel)}
                                    </span>.
                                  </div>
                                  {hasUnavailableExternalReminderChannels && (
                                    <div className="text-[10px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                      The grayed-out reminder routes need saved admin contact details.{" "}
                                      <Link
                                        href="/profile"
                                        className="underline underline-offset-2"
                                        style={{ color: "var(--heading)" }}
                                      >
                                        Open profile
                                      </Link>
                                      {" "}or{" "}
                                      <Link
                                        href={advisorReminderRoutingHref}
                                        className="underline underline-offset-2"
                                        style={{ color: "#A78BFA" }}
                                      >
                                        ask Advisor
                                      </Link>
                                      {" "}to save them for you.
                                    </div>
                                  )}
                                  <div className="text-[10px] font-medium mt-3 mb-2" style={{ color: "var(--heading)" }}>
                                    When should I bring this back?
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {dailyTodoReminderOptions.map((option) => (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleDailyTodoDecision(item, 'not_now', section.key, {
                                          remindAt: option.remindAt,
                                          remindLabel: option.remindLabel,
                                          reminderChannel: notNowReminderChannel,
                                        })}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium"
                                        style={{
                                          background: "rgba(245,158,11,0.12)",
                                          border: "1px solid rgba(245,158,11,0.22)",
                                          color: "#F59E0B",
                                        }}
                                        title={option.description}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setNotNowPickerItemId(null)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium"
                                      style={{
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid var(--card-border)",
                                        color: "var(--t3)",
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })()
            ))}
          </div>
        </Card>
      </motion.div>

      {/* ── Autopilot Summary ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                  Autopilot Summary
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                How the agent is routing actions across auto-run, review, and blocked states.
              </p>
            </div>
            {autopilotSummary.mostActiveSource && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px]" style={{ color: "var(--t4)" }}>
                  Most active trigger
                </span>
                <TriggerSourceBadge source={autopilotSummary.mostActiveSource.label} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
              {
                label: "Auto-run",
                value: autopilotSummary.counts.auto,
                note: "Executed without manual review",
                color: "#10B981",
              },
              {
                label: "Needs review",
                value: autopilotSummary.counts.pending,
                note: "Waiting on human approval",
                color: "#F59E0B",
              },
              {
                label: "Blocked",
                value: autopilotSummary.counts.blocked,
                note: "Stopped by autonomy or policy",
                color: "#EF4444",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl p-3"
                style={{
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                  border: "1px solid var(--card-border)",
                }}
              >
                <div className="text-[11px] font-medium" style={{ color: item.color }}>
                  {item.label}
                </div>
                <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "var(--heading)" }}>
                  {item.value}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                  {item.note}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className="rounded-xl p-3"
              style={{
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" style={{ color: "#EF4444" }} />
                <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>
                  Top Blocking Reasons
                </div>
              </div>
              {autopilotSummary.topBlockedReasons.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--t4)" }}>
                  No blocked actions in the last 7 days.
                </div>
              ) : (
                <div className="space-y-2">
                  {autopilotSummary.topBlockedReasons.map((entry) => (
                    <div key={entry.label} className="flex items-start justify-between gap-3">
                      <div className="text-xs" style={{ color: "var(--t3)" }}>
                        {entry.label}
                      </div>
                      <div className="text-xs font-semibold tabular-nums" style={{ color: "#EF4444" }}>
                        {entry.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="rounded-xl p-3"
              style={{
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" style={{ color: "#F59E0B" }} />
                <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>
                  Top Review Reasons
                </div>
              </div>
              {autopilotSummary.topReviewReasons.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--t4)" }}>
                  No manual-review bottlenecks in the current 7-day window.
                </div>
              ) : (
                <div className="space-y-2">
                  {autopilotSummary.topReviewReasons.map((entry) => (
                    <div key={entry.label} className="flex items-start justify-between gap-3">
                      <div className="text-xs" style={{ color: "var(--t3)" }}>
                        {entry.label}
                      </div>
                      <div className="text-xs font-semibold tabular-nums" style={{ color: "#F59E0B" }}>
                        {entry.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className="rounded-xl p-3 mt-4"
            style={{
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.16)",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: "#A78BFA" }} />
                <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>
                  Membership Friction
                </div>
              </div>
              <div className="text-xs font-semibold tabular-nums" style={{ color: "#A78BFA" }}>
                {autopilotSummary.membershipHeldCount} held
              </div>
            </div>
            {autopilotSummary.topMembershipReasons.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--t4)" }}>
                Membership rules are not currently the main autopilot bottleneck.
              </div>
            ) : (
              <div className="space-y-2">
                {autopilotSummary.topMembershipReasons.map((entry) => (
                  <div key={entry.label} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium" style={{ color: "#A78BFA" }}>
                        {membershipReasonLabel(entry.label)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>
                        {entry.label}
                      </div>
                    </div>
                    <div className="text-xs font-semibold tabular-nums" style={{ color: "#A78BFA" }}>
                      {entry.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {autopilotSuggestions.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpRight className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>
                  Top blockers to fix
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {autopilotSuggestions.map((suggestion) => {
                  const styles = suggestionToneStyles(suggestion.tone)
                  const href = actionHref(suggestion.action)

                  return (
                    <div
                      key={suggestion.id}
                      className="rounded-xl p-3"
                      style={{
                        background: styles.bg,
                        border: `1px solid ${styles.border}`,
                      }}
                    >
                      <div className="text-sm font-semibold" style={{ color: styles.title }}>
                        {suggestion.title}
                      </div>
                      <div className="text-xs mt-1 min-h-[40px]" style={{ color: "var(--t3)" }}>
                        {suggestion.description}
                      </div>

                      {href ? (
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                          style={{ color: "var(--heading)" }}
                        >
                          {suggestion.ctaLabel}
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <button
                          onClick={() => runSuggestionAction(suggestion.action)}
                          className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                          style={{ color: "var(--heading)" }}
                        >
                          {suggestion.ctaLabel}
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {membershipLifecycleCards.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.17 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" style={{ color: "#A78BFA" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Membership Lifecycle Autopilot
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  Separate autopilot rules and live pressure points for trial follow-up and renewal outreach.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {membershipLifecycleCards.map((card) => {
                const href = actionHref("open_advisor", card.advisorPrompt)
                const iconColor = card.kind === "trial_follow_up" ? "#10B981" : "#8B5CF6"
                const Icon = card.kind === "trial_follow_up" ? UserPlus : Send

                return (
                  <div
                    key={card.id}
                    className="rounded-xl p-4"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${iconColor}15` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: iconColor }} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                            {card.title}
                          </div>
                          <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                            {card.description}
                          </div>
                        </div>
                      </div>
                      <div
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{
                          background: card.currentMode === "auto"
                            ? "rgba(16,185,129,0.12)"
                            : card.currentMode === "off"
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(245,158,11,0.12)",
                          color: card.currentMode === "auto"
                            ? "#10B981"
                            : card.currentMode === "off"
                              ? "#EF4444"
                              : "#F59E0B",
                        }}
                      >
                        {card.currentMode}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {[
                        { label: "Auto", value: card.autoCount, color: "#10B981" },
                        { label: "Review", value: card.pendingCount, color: "#F59E0B" },
                        { label: "Blocked", value: card.blockedCount, color: "#EF4444" },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg p-2"
                          style={{
                            background: `${item.color}12`,
                            border: `1px solid ${item.color}22`,
                          }}
                        >
                          <div className="text-[11px]" style={{ color: item.color }}>{item.label}</div>
                          <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {card.topReasons.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[11px] font-medium" style={{ color: "var(--heading)" }}>
                          Main hold-ups
                        </div>
                        {card.topReasons.map((reason) => (
                          <div key={reason.label} className="flex items-start justify-between gap-3">
                            <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                              {reason.label}
                            </div>
                            <div className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--t4)" }}>
                              {reason.count}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {href && (
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                        style={{ color: "var(--heading)" }}
                      >
                        Tune in Advisor
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {programmingCockpit.cards.length > 0 && (
        <motion.div
          ref={programmingCockpitRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.19 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" style={{ color: "#A78BFA" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Programming Cockpit
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  Draft-first schedule opportunities the agent believes are strongest right now. Nothing here publishes live.
                </p>
                {deepLinkFocus === 'programming-cockpit' && deepLinkDay && (
                  <div className="text-[11px] mt-2 font-medium" style={{ color: "#67E8F9" }}>
                    Focused from Schedule: {deepLinkDay}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: "Programming drafts",
                  value: programmingCockpit.cards.length,
                  note: "Active scheduling plans in workspace",
                  color: "#A78BFA",
                },
                {
                  label: "Ops drafts ready",
                  value: programmingCockpit.totalOpsDrafts,
                  note: "Internal session drafts created for ops review",
                  color: "#06B6D4",
                },
                {
                  label: "Best projected fill",
                  value: `${programmingCockpit.strongest?.primary.projectedOccupancy || 0}%`,
                  note: "Strongest slot from current draft set",
                  color: "#10B981",
                },
                {
                  label: "Likely interested",
                  value: programmingCockpit.topInterestedMembers,
                  note: "Demand estimate behind the strongest slot",
                  color: "#F59E0B",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl p-3"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="text-[11px] font-medium" style={{ color: item.color }}>
                    {item.label}
                  </div>
                  <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "var(--heading)" }}>
                    {item.value}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                    {item.note}
                  </div>
                </div>
              ))}
            </div>

            {programmingCockpit.strongest && (
              <div
                className="rounded-xl p-4 mb-4"
                style={{
                  background: isFocusedProgrammingDraft(programmingCockpit.strongest)
                    ? "rgba(103,232,249,0.12)"
                    : "rgba(139,92,246,0.08)",
                  border: isFocusedProgrammingDraft(programmingCockpit.strongest)
                    ? "1px solid rgba(103,232,249,0.3)"
                    : "1px solid rgba(139,92,246,0.16)",
                  boxShadow: isFocusedProgrammingDraft(programmingCockpit.strongest)
                    ? "0 0 0 1px rgba(103,232,249,0.18) inset"
                    : undefined,
                }}
              >
                {(() => {
                  const strongest = programmingCockpit.strongest
                  const impact = buildProgrammingImpactAssessment(strongest)

                  return (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                              Strongest opportunity: {strongest.primary.title}
                            </div>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
                            >
                              {strongest.primary.projectedOccupancy}% projected fill
                            </span>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: `${impact.confidenceBand.color}14`, color: impact.confidenceBand.color }}
                            >
                              {impact.confidenceBand.label}
                            </span>
                          </div>
                          <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                            {formatProgrammingWindow(strongest.primary)}
                          </div>
                          <div className="text-xs mt-2" style={{ color: "var(--heading)", lineHeight: 1.6, fontWeight: 600 }}>
                            {strongest.insights[0] || strongest.summary || "The agent sees the strongest demand signal in this slot based on recent occupancy and member preferences."}
                          </div>
                          {strongest.opsSessionDrafts.length > 0 && (
                            <div className="text-[11px] mt-2" style={{ color: "#67E8F9", fontWeight: 700 }}>
                              {strongest.opsSessionDrafts.length} internal ops draft{strongest.opsSessionDrafts.length === 1 ? "" : "s"} ready for scheduling review
                            </div>
                          )}
                        </div>
                        <Link
                          href={buildAdvisorDraftHref(clubId, strongest)}
                          className="inline-flex items-center gap-1 text-xs font-medium shrink-0"
                          style={{ color: "var(--heading)" }}
                        >
                          Open in Advisor
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                        <div
                          className="rounded-lg p-3"
                          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.16)" }}
                        >
                          <div className="text-[11px] font-medium" style={{ color: "#10B981" }}>
                            Impact outlook
                          </div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 700 }}>
                            {strongest.primary.estimatedInterestedMembers} likely players
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                            The agent expects this window to fill faster than the club’s current average programming ideas.
                          </div>
                        </div>

                        <div
                          className="rounded-lg p-3"
                          style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.16)" }}
                        >
                          <div className="text-[11px] font-medium" style={{ color: "#06B6D4" }}>
                            Why this slot
                          </div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 700 }}>
                            {strongest.primary.dayOfWeek} {strongest.primary.timeSlot}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                            Demand and recent occupancy are clustering here more consistently than in the surrounding draft options.
                          </div>
                        </div>

                        <div
                          className="rounded-lg p-3"
                          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.16)" }}
                        >
                          <div className="text-[11px] font-medium" style={{ color: "#F59E0B" }}>
                            Compared to next best
                          </div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 700 }}>
                            {impact.fillDelta !== null
                              ? `${impact.fillDelta >= 0 ? "+" : ""}${impact.fillDelta} fill pts`
                              : "No alternative yet"}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                            {impact.fillDelta !== null
                              ? `${impact.demandDelta && impact.demandDelta >= 0 ? "+" : ""}${impact.demandDelta ?? 0} likely players vs the next best option.`
                              : "Add more alternatives in Advisor to compare options side by side."}
                          </div>
                        </div>

                        <div
                          className="rounded-lg p-3"
                          style={{ background: `${impact.riskCheck.color}10`, border: `1px solid ${impact.riskCheck.color}22` }}
                        >
                          <div className="text-[11px] font-medium" style={{ color: impact.riskCheck.color }}>
                            Validation check
                          </div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 700 }}>
                            {impact.riskCheck.label}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                            {impact.riskCheck.note}
                          </div>
                        </div>
                      </div>

                      {impact.warnings.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {impact.warnings.slice(0, 2).map((warning) => (
                            <div
                              key={warning}
                              className="rounded-lg p-2"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                              <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                {warning}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4">
                        <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#A78BFA", fontWeight: 700 }}>
                          Quick refine controls
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {buildProgrammingRefineActions(strongest).map((refine) => (
                            <Link
                              key={refine.label}
                              href={buildAdvisorDraftRefineHref(clubId, strongest, refine.prompt)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium"
                              style={{
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(139,92,246,0.16)",
                                color: "var(--heading)",
                              }}
                            >
                              {refine.label}
                              <ArrowUpRight className="w-3 h-3" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {prioritizeFocusedItems(programmingCockpit.cards, isFocusedProgrammingDraft).slice(0, 4).map((draft) => {
                const impact = buildProgrammingImpactAssessment(draft)
                const isFocused = isFocusedProgrammingDraft(draft)

                return (
                  <div
                    key={draft.id}
                    className="rounded-xl p-4"
                    style={{
                      background: isFocused
                        ? "rgba(103,232,249,0.08)"
                        : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      border: isFocused ? "1px solid rgba(103,232,249,0.28)" : "1px solid var(--card-border)",
                      boxShadow: isFocused ? "0 0 0 1px rgba(103,232,249,0.14) inset" : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                            {draft.primary.title}
                          </div>
                          {draft.selectedPlan === "recommended" && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA" }}
                            >
                              Agent plan
                            </span>
                          )}
                        </div>
                          <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                            {formatProgrammingWindow(draft.primary)}
                          </div>
                          {draft.opsSessionDrafts.length > 0 && (
                            <div className="text-[11px] mt-1" style={{ color: "#67E8F9", fontWeight: 700 }}>
                              {draft.opsSessionDrafts.length} ops draft{draft.opsSessionDrafts.length === 1 ? "" : "s"} ready
                            </div>
                          )}
                      </div>
                      <Link
                        href={buildAdvisorDraftHref(clubId, draft)}
                        className="inline-flex items-center gap-1 text-xs font-medium shrink-0"
                        style={{ color: "var(--heading)" }}
                      >
                        Open
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {[
                        { label: "Fill", value: `${draft.primary.projectedOccupancy}%`, color: "#10B981" },
                        { label: "Demand", value: draft.primary.estimatedInterestedMembers, color: "#06B6D4" },
                        { label: "Confidence", value: `${draft.primary.confidence}`, color: "#F59E0B" },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg p-2"
                          style={{ background: `${item.color}10`, border: `1px solid ${item.color}16` }}
                        >
                          <div className="text-[11px]" style={{ color: item.color }}>{item.label}</div>
                          <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                      <div
                        className="rounded-lg p-2"
                        style={{ background: `${impact.confidenceBand.color}10`, border: `1px solid ${impact.confidenceBand.color}22` }}
                      >
                        <div className="text-[11px]" style={{ color: impact.confidenceBand.color, fontWeight: 700 }}>
                          {impact.confidenceBand.label}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                          {impact.confidenceBand.note}
                        </div>
                      </div>
                      <div
                        className="rounded-lg p-2"
                        style={{ background: `${impact.riskCheck.color}10`, border: `1px solid ${impact.riskCheck.color}22` }}
                      >
                        <div className="text-[11px]" style={{ color: impact.riskCheck.color, fontWeight: 700 }}>
                          {impact.riskCheck.label}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                          {draft.primary.conflict
                            ? impact.riskCheck.note
                            : impact.fillDelta !== null
                              ? `${impact.fillDelta >= 0 ? "+" : ""}${impact.fillDelta} fill pts vs next best.`
                              : impact.riskCheck.note}
                        </div>
                      </div>
                    </div>

                    {impact.warnings.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {impact.warnings.slice(0, 2).map((warning) => (
                          <div
                            key={warning}
                            className="rounded-lg p-2"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {warning}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] mt-3" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                      {draft.insights[0] || draft.summary || "Draft-only programming suggestion ready for review."}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {buildProgrammingRefineActions(draft).slice(0, 3).map((refine) => (
                        <Link
                          key={refine.label}
                          href={buildAdvisorDraftRefineHref(clubId, draft, refine.prompt)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "var(--heading)",
                          }}
                        >
                          {refine.label}
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      ))}
                    </div>

                    <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: "var(--t4)" }}>
                      <span>{1 + draft.alternatives.length} ideas in this plan</span>
                      <span>{timeAgo(draft.updatedAt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {programmingCockpit.cards.length > 0 && (
        <motion.div
          ref={opsBoardRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Puzzle className="w-4 h-4" style={{ color: "#10B981" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Ops Draft Calendar
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  Internal schedule-draft board for the club team. These ideas stay draft-only until someone chooses to operationalize them.
                </p>
                {deepLinkFocus === 'ops-board' && deepLinkDay && (
                  <div className="text-[11px] mt-2 font-medium" style={{ color: "#67E8F9" }}>
                    Focused from Schedule: {deepLinkDay}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
              {programmingOpsBoard.map((stage) => (
                <div
                  key={stage.key}
                  className="rounded-xl p-3"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                        {stage.label}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                        {stage.description}
                      </div>
                    </div>
                    <div
                      className="min-w-[28px] h-7 px-2 rounded-full inline-flex items-center justify-center text-[11px] font-bold"
                      style={{ background: `${stage.color}14`, color: stage.color }}
                    >
                      {stage.cards.length}
                    </div>
                  </div>

                  <div className="space-y-3 mt-4">
                    {stage.cards.length === 0 ? (
                      <div
                        className="rounded-lg px-3 py-4 text-[11px]"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px dashed var(--card-border)",
                          color: "var(--t4)",
                          lineHeight: 1.5,
                        }}
                      >
                        No programming drafts in this stage yet.
                      </div>
                    ) : (
                      prioritizeFocusedItems(stage.cards, isFocusedProgrammingDraft).slice(0, 4).map((draft) => {
                        const impact = buildProgrammingImpactAssessment(draft)
                        const isFocused = isFocusedProgrammingDraft(draft)
                        return (
                          <div
                            key={`${stage.key}-${draft.id}`}
                            className="rounded-lg p-3"
                            style={{
                              background: isFocused ? "rgba(103,232,249,0.08)" : "rgba(255,255,255,0.04)",
                              border: isFocused ? "1px solid rgba(103,232,249,0.24)" : "1px solid rgba(255,255,255,0.06)",
                              boxShadow: isFocused ? "0 0 0 1px rgba(103,232,249,0.12) inset" : undefined,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                                {draft.primary.title}
                              </div>
                              {draft.selectedPlan === 'recommended' && (
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA" }}
                                >
                                  Agent
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {formatProgrammingWindow(draft.primary)}
                            </div>
                            {draft.opsSessionDrafts.length > 0 && (
                              <div className="text-[11px] mt-2" style={{ color: "#67E8F9", fontWeight: 700 }}>
                                {draft.opsSessionDrafts.length} internal ops draft{draft.opsSessionDrafts.length === 1 ? "" : "s"} ready for scheduling review
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div
                                className="rounded-md p-2"
                                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.16)" }}
                              >
                                <div className="text-[10px]" style={{ color: "#10B981" }}>Projected fill</div>
                                <div className="text-sm font-bold tabular-nums" style={{ color: "#10B981" }}>
                                  {draft.primary.projectedOccupancy}%
                                </div>
                              </div>
                              <div
                                className="rounded-md p-2"
                                style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.16)" }}
                              >
                                <div className="text-[10px]" style={{ color: "#06B6D4" }}>Likely players</div>
                                <div className="text-sm font-bold tabular-nums" style={{ color: "#06B6D4" }}>
                                  {draft.primary.estimatedInterestedMembers}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {impact.fillDelta !== null
                                ? `${impact.fillDelta >= 0 ? "+" : ""}${impact.fillDelta} fill pts vs next best option.`
                                : impact.confidenceBand.note}
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                              <Link
                                href={buildAdvisorDraftHref(clubId, draft)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  color: "var(--heading)",
                                }}
                              >
                                Open
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                              <Link
                                href={buildAdvisorDraftRefineHref(
                                  clubId,
                                  draft,
                                  'Turn this programming plan into an ops-ready draft board item and tighten the strongest option for internal review.',
                                )}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                style={{
                                  background: `${stage.color}12`,
                                  border: `1px solid ${stage.color}22`,
                                  color: stage.color,
                                }}
                              >
                                Refine
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {opsSessionDraftQueue.some((stage) => stage.drafts.length > 0) && (
        <motion.div
          ref={opsQueueRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" style={{ color: "#67E8F9" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Internal Session Draft Queue
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  First-class internal session drafts created from agent programming approvals. These are still manual-only and never live-published here.
                </p>
                {deepLinkFocus === 'ops-queue' && deepLinkDay && (
                  <div className="text-[11px] mt-2 font-medium" style={{ color: "#67E8F9" }}>
                    Focused from Schedule: {deepLinkDay}
                  </div>
                )}
                <div className="text-[11px] mt-2" style={{ color: "var(--t4)" }}>
                  Your assigned drafts are automatically ranked first in every stage.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {[
                  { key: 'all' as const, label: 'All', count: opsOwnershipCounts.all },
                  { key: 'mine' as const, label: 'Mine', count: opsOwnershipCounts.mine },
                  { key: 'unassigned' as const, label: 'Unassigned', count: opsOwnershipCounts.unassigned },
                ].map((filter) => {
                  const active = opsOwnershipFilter === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setOpsOwnershipFilter(filter.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium"
                      style={{
                        background: active ? "rgba(103,232,249,0.12)" : "rgba(255,255,255,0.05)",
                        border: active ? "1px solid rgba(103,232,249,0.24)" : "1px solid var(--card-border)",
                        color: active ? "#67E8F9" : "var(--t3)",
                      }}
                    >
                      {filter.label}
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px]"
                        style={{ background: active ? "rgba(103,232,249,0.16)" : "rgba(255,255,255,0.08)" }}
                      >
                        {filter.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
              {visibleOpsSessionDraftQueue.map((stage) => (
                <div
                  key={stage.key}
                  className="rounded-xl p-3"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                        {stage.label}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                        {stage.description}
                      </div>
                    </div>
                    <div
                      className="min-w-[28px] h-7 px-2 rounded-full inline-flex items-center justify-center text-[11px] font-bold"
                      style={{ background: `${stage.color}14`, color: stage.color }}
                    >
                      {stage.drafts.length}
                    </div>
                  </div>

                  <div className="space-y-3 mt-4">
                    {stage.drafts.length === 0 ? (
                      <div
                        className="rounded-lg px-3 py-4 text-[11px]"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px dashed var(--card-border)",
                          color: "var(--t4)",
                          lineHeight: 1.5,
                        }}
                      >
                        No internal session drafts in this stage yet.
                      </div>
                    ) : (
                      prioritizeFocusedItems(stage.drafts, isFocusedOpsSessionDraft).slice(0, 4).map((draft) => {
                        const advisorHref = buildOpsSessionDraftHref(clubId, draft)
                        const isPromoting = processingId === `ops:${draft.id}`
                        const opsWorkflow = getOpsWorkflowMeta(draft)
                        const handoff = getOpsHandoffMeta(draft)
                        const publishMeta = getOpsSessionDraftPublishMeta(draft)
                        const publishReview = getOpsSessionDraftPublishReviewMeta(draft)
                        const liveFeedback = getOpsSessionDraftLiveFeedbackMeta(draft)
                        const aftercare = getOpsSessionDraftAftercareMeta(draft)
                        const liveFeedbackTone = getOpsSessionLiveFeedbackTone(liveFeedback?.status)
                        const publishedSessionId = typeof publishMeta?.publishedPlaySessionId === 'string'
                          ? publishMeta.publishedPlaySessionId
                          : null
                        const existingFillDraft = publishedSessionId
                          ? fillSessionDraftBySessionId.get(publishedSessionId)
                          : null
                        const dueMeta = getOpsDueMeta(draft)
                        const dueLabel = dueMeta?.label || getOpsWorkflowDueLabel(draft)
                        const timeline = getOpsTimelineMeta(draft)
                        const isAssigning = processingId === `opswf:assign_self:${draft.id}`
                        const isAssigningTeammate = processingId === `opswf:assign_teammate:${draft.id}`
                        const isReassigning = processingId === `opswf:reassign_owner:${draft.id}`
                        const isPingingOwner = processingId === `opswf:ping_owner:${draft.id}`
                        const isDueToday = processingId === `opswf:due_today:${draft.id}`
                        const isDueTomorrow = processingId === `opswf:due_tomorrow:${draft.id}`
                        const isAddingNote = processingId === `opswf:add_note:${draft.id}`
                        const isRejecting = processingId === `opswf:reject:${draft.id}`
                        const isArchiving = processingId === `opswf:archive:${draft.id}`
                        const isReopening = processingId === `opswf:reopen_ready:${draft.id}`
                        const isPreparingPublish = processingId === `opspubprep:${draft.id}`
                        const isPublishing = processingId === `opspublish:${draft.id}`
                        const isEditingAftercare = processingId === `opsaftercare:update:${draft.id}`
                        const isRollingBackAftercare = processingId === `opsaftercare:rollback:${draft.id}`
                        const isCreatingFillDraft = creatingPublishedFillDraftId === draft.id
                        const nextStep = draft.metadata?.sessionDraft?.nextStep
                        const isFocused = isFocusedOpsSessionDraft(draft)

                        return (
                          <div
                            key={`${stage.key}-${draft.id}`}
                            className="rounded-lg p-3"
                            style={{
                              background: isFocused ? "rgba(103,232,249,0.08)" : "rgba(255,255,255,0.04)",
                              border: isFocused ? "1px solid rgba(103,232,249,0.24)" : "1px solid rgba(255,255,255,0.06)",
                              boxShadow: isFocused ? "0 0 0 1px rgba(103,232,249,0.12) inset" : undefined,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-semibold" style={{ color: "var(--heading)" }}>
                                {draft.title}
                              </div>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  background: draft.origin === 'primary' ? "rgba(16,185,129,0.12)" : "rgba(139,92,246,0.12)",
                                  color: draft.origin === 'primary' ? "#10B981" : "#A78BFA",
                                }}
                              >
                                {draft.origin === 'primary' ? 'Primary' : 'Alternative'}
                              </span>
                            </div>

                            <div className="text-[11px] mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {draft.dayOfWeek} · {draft.startTime}-{draft.endTime} · {formatProgrammingValue(draft.format)} · {formatProgrammingValue(draft.skillLevel)}
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-3">
                              {[
                                { label: 'Fill', value: `${draft.projectedOccupancy}%`, color: '#10B981' },
                                { label: 'Demand', value: draft.estimatedInterestedMembers, color: '#06B6D4' },
                                { label: 'Confidence', value: `${draft.confidence}`, color: '#F59E0B' },
                              ].map((item) => (
                                <div
                                  key={item.label}
                                  className="rounded-md p-2"
                                  style={{ background: `${item.color}10`, border: `1px solid ${item.color}16` }}
                                >
                                  <div className="text-[10px]" style={{ color: item.color }}>{item.label}</div>
                                  <div className="text-sm font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                                </div>
                              ))}
                            </div>

                            <div className="text-[11px] mt-3" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {nextStep || draft.conflict?.riskSummary || draft.note || 'Internal session draft ready for manual scheduling review.'}
                            </div>

                            {publishMeta?.targetDate ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background:
                                    publishReview?.status === 'blocked'
                                      ? "rgba(239,68,68,0.06)"
                                      : publishReview?.status === 'warn'
                                        ? "rgba(245,158,11,0.08)"
                                        : "rgba(16,185,129,0.06)",
                                  border:
                                    publishReview?.status === 'blocked'
                                      ? "1px solid rgba(239,68,68,0.16)"
                                      : publishReview?.status === 'warn'
                                        ? "1px solid rgba(245,158,11,0.16)"
                                        : "1px solid rgba(16,185,129,0.16)",
                                }}
                              >
                                <div
                                  className="text-[10px] uppercase tracking-[0.08em]"
                                  style={{
                                    color:
                                      publishReview?.status === 'blocked'
                                        ? "#EF4444"
                                        : publishReview?.status === 'warn'
                                          ? "#F59E0B"
                                          : "#10B981",
                                    fontWeight: 700,
                                  }}
                                >
                                  Controlled publish
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--heading)", lineHeight: 1.55, fontWeight: 600 }}>
                                  {publishMeta.stage === 'published'
                                    ? 'Published to live schedule'
                                    : `Ready for ${publishMeta.targetDate}`}
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                  {(publishMeta.title || draft.title)} · {draft.startTime}-{draft.endTime}
                                </div>
                                {publishReview ? (
                                  <div className="mt-3 space-y-2">
                                    <div className="text-[11px]" style={{ color: "var(--heading)", lineHeight: 1.55, fontWeight: 600 }}>
                                      {publishReview.status === 'blocked'
                                        ? 'Publish blocked'
                                        : publishReview.status === 'warn'
                                          ? 'Publish review needed'
                                          : 'Publish review clear'}
                                    </div>
                                    <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                      {publishReview.summary}
                                    </div>
                                    {publishReview.relatedSessions?.length ? (
                                      <div className="space-y-1">
                                        {publishReview.relatedSessions.slice(0, 2).map((session) => (
                                          <div key={`${draft.id}:${session.id || session.title}:${session.reason || 'related'}`} className="text-[10px]" style={{ color: "var(--t4)", lineHeight: 1.45 }}>
                                            {session.title || 'Live session'} · {session.startTime}-{session.endTime}
                                            {session.reason ? ` · ${session.reason.replace(/_/g, ' ')}` : ''}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                    {publishReview.blockers?.length ? (
                                      <div className="space-y-1">
                                        {publishReview.blockers.slice(0, 2).map((item) => (
                                          <div key={item} className="text-[10px]" style={{ color: "#EF4444", lineHeight: 1.45 }}>
                                            {item}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                    {!publishReview.blockers?.length && publishReview.warnings?.length ? (
                                      <div className="space-y-1">
                                        {publishReview.warnings.slice(0, 2).map((item) => (
                                          <div key={item} className="text-[10px]" style={{ color: "#F59E0B", lineHeight: 1.45 }}>
                                            {item}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                {publishMeta.preparedBy ? (
                                  <div className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>
                                    Prepared by {publishMeta.preparedBy}{publishMeta.preparedAt ? ` · ${new Date(publishMeta.preparedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                                  </div>
                                ) : null}
                                {publishMeta.publishedAt ? (
                                  <div className="text-[10px] mt-2" style={{ color: "#10B981" }}>
                                    Live at {new Date(publishMeta.publishedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {publishMeta?.publishedPlaySessionId && aftercare ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background:
                                    aftercare.status === 'missing'
                                      ? "rgba(239,68,68,0.06)"
                                      : aftercare.status === 'drifted'
                                        ? "rgba(245,158,11,0.08)"
                                        : "rgba(16,185,129,0.06)",
                                  border:
                                    aftercare.status === 'missing'
                                      ? "1px solid rgba(239,68,68,0.16)"
                                      : aftercare.status === 'drifted'
                                        ? "1px solid rgba(245,158,11,0.16)"
                                        : "1px solid rgba(16,185,129,0.16)",
                                }}
                              >
                                <div
                                  className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em]"
                                  style={{
                                    color:
                                      aftercare.status === 'missing'
                                        ? "#EF4444"
                                        : aftercare.status === 'drifted'
                                          ? "#F59E0B"
                                          : "#10B981",
                                    fontWeight: 700,
                                  }}
                                >
                                  <span>Publish aftercare</span>
                                  <span>
                                    {aftercare.status === 'missing'
                                      ? 'Missing live session'
                                      : aftercare.status === 'drifted'
                                        ? 'Drift detected'
                                        : 'Aligned'}
                                  </span>
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--heading)", lineHeight: 1.55, fontWeight: 600 }}>
                                  {aftercare.summary}
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                  {aftercare.recommendedAction}
                                </div>
                                {aftercare.driftedFields?.length ? (
                                  <div className="mt-3 space-y-1">
                                    {aftercare.driftedFields.slice(0, 2).map((item) => (
                                      <div key={`${draft.id}:${item.field || item.label}`} className="text-[10px]" style={{ color: "var(--t4)", lineHeight: 1.45 }}>
                                        {item.label || item.field}: {item.liveValue || 'None'} live vs {item.draftValue || 'None'} planned
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {aftercare.canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() => handleEditPublishedOpsSessionDraft(draft)}
                                      disabled={isEditingAftercare}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                      style={{
                                        background: "rgba(6,182,212,0.12)",
                                        border: "1px solid rgba(6,182,212,0.22)",
                                        color: "#67E8F9",
                                        opacity: isEditingAftercare ? 0.7 : 1,
                                      }}
                                    >
                                      {isEditingAftercare ? 'Opening…' : 'Edit live session'}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => handleRollbackPublishedOpsSessionDraft(draft)}
                                    disabled={!aftercare.canRollback || isRollingBackAftercare}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                    style={{
                                      background: "rgba(245,158,11,0.10)",
                                      border: "1px solid rgba(245,158,11,0.18)",
                                      color: "#F59E0B",
                                      opacity: !aftercare.canRollback || isRollingBackAftercare ? 0.55 : 1,
                                    }}
                                  >
                                    {isRollingBackAftercare ? 'Rolling back…' : 'Rollback to plan'}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {liveFeedback ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background: liveFeedbackTone.background,
                                  border: `1px solid ${liveFeedbackTone.border}`,
                                }}
                              >
                                <div
                                  className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em]"
                                  style={{ color: liveFeedbackTone.color, fontWeight: 700 }}
                                >
                                  <span>Live feedback</span>
                                  <span>{liveFeedbackTone.label}</span>
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--heading)", lineHeight: 1.55, fontWeight: 600 }}>
                                  {publishMeta?.liveSession?.title || publishMeta?.title || draft.title}
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                  {liveFeedback.summary}
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-3">
                                  {[
                                    { label: 'Live fill', value: `${liveFeedback.actualOccupancy || 0}%`, color: liveFeedbackTone.color },
                                    { label: 'Plan', value: `${liveFeedback.projectedOccupancy || 0}%`, color: '#06B6D4' },
                                    { label: 'Open spots', value: liveFeedback.spotsRemaining || 0, color: '#F59E0B' },
                                  ].map((item) => (
                                    <div
                                      key={`${draft.id}:${item.label}`}
                                      className="rounded-md p-2"
                                      style={{ background: `${item.color}10`, border: `1px solid ${item.color}16` }}
                                    >
                                      <div className="text-[10px]" style={{ color: item.color }}>{item.label}</div>
                                      <div className="text-sm font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-[11px] mt-3" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                  {liveFeedback.recommendedAction}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {existingFillDraft ? (
                                    <Link
                                      href={buildAdvisorDraftHref(clubId, existingFillDraft)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                      style={{
                                        background: "rgba(139,92,246,0.14)",
                                        border: "1px solid rgba(139,92,246,0.2)",
                                        color: "#DDD6FE",
                                      }}
                                    >
                                      Open fill draft
                                      <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                  ) : (liveFeedback.status === 'behind' || liveFeedback.status === 'at_risk') ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCreatePublishedFillDraft(draft)}
                                      disabled={isCreatingFillDraft}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                      style={{
                                        background: liveFeedback.status === 'at_risk' ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                                        border: liveFeedback.status === 'at_risk' ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(245,158,11,0.2)",
                                        color: liveFeedback.status === 'at_risk' ? "#FCA5A5" : "#F59E0B",
                                        opacity: isCreatingFillDraft ? 0.7 : 1,
                                      }}
                                    >
                                      {isCreatingFillDraft ? 'Preparing fill draft…' : 'Create fill draft'}
                                    </button>
                                  ) : null}

                                  {liveFeedback.status === 'ahead' ? (
                                    <Link
                                      href={buildPublishedSessionRepeatHref(clubId, draft)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                      style={{
                                        background: "rgba(16,185,129,0.12)",
                                        border: "1px solid rgba(16,185,129,0.2)",
                                        color: "#10B981",
                                      }}
                                    >
                                      Repeat this slot
                                      <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                  ) : null}

                                  {dailyOwnershipView === 'team' && opsWorkflow?.ownerUserId && (liveFeedback.status === 'at_risk' || liveFeedback.status === 'behind') ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'ping_owner')}
                                      disabled={isPingingOwner}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                      style={{
                                        background: "rgba(245,158,11,0.10)",
                                        border: "1px solid rgba(245,158,11,0.18)",
                                        color: "#F59E0B",
                                        opacity: isPingingOwner ? 0.7 : 1,
                                      }}
                                    >
                                      {isPingingOwner ? 'Pinging…' : 'Ping owner'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}

                            {handoff ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background: "rgba(103,232,249,0.06)",
                                  border: "1px solid rgba(103,232,249,0.16)",
                                }}
                              >
                                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#67E8F9", fontWeight: 700 }}>
                                  Agent handoff
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--heading)", lineHeight: 1.55, fontWeight: 600 }}>
                                  {handoff.summary}
                                </div>
                                {handoff.whyNow ? (
                                  <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                    Why now: {handoff.whyNow}
                                  </div>
                                ) : null}
                                {handoff.ownerBrief ? (
                                  <div className="text-[11px] mt-2" style={{ color: "#60A5FA", lineHeight: 1.5 }}>
                                    Owner handoff: {handoff.ownerBrief}
                                  </div>
                                ) : null}
                                {handoff.watchouts?.length ? (
                                  <div className="space-y-1 mt-2">
                                    {handoff.watchouts.slice(0, 2).map((watchout) => (
                                      <div key={watchout} className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                        {watchout}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="text-[11px] mt-2" style={{ color: "#A78BFA", lineHeight: 1.5 }}>
                                  Next step: {handoff.nextStep}
                                </div>
                              </div>
                            ) : null}

                            {(opsWorkflow?.ownerLabel || dueLabel || opsWorkflow?.blockedReason) ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {opsWorkflow?.ownerLabel ? (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: "rgba(59,130,246,0.12)", color: "#60A5FA" }}
                                  >
                                    Owner: {opsWorkflow.ownerLabel}
                                  </span>
                                ) : null}
                                {dueLabel ? (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{
                                      background: dueMeta?.background || "rgba(245,158,11,0.12)",
                                      color: dueMeta?.accent || "#F59E0B",
                                      border: dueMeta ? `1px solid ${dueMeta.border}` : undefined,
                                    }}
                                  >
                                    {dueLabel}
                                  </span>
                                ) : null}
                                {opsWorkflow?.blockedReason ? (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}
                                  >
                                    {opsWorkflow.blockedReason}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}

                            {opsWorkflow?.lastNoteAt ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }}
                              >
                                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                                  Ops note
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: "var(--t2)", lineHeight: 1.55 }}>
                                  {draft.note}
                                </div>
                                <div className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>
                                  {opsWorkflow.lastNoteBy || 'Admin'} · {new Date(opsWorkflow.lastNoteAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                </div>
                              </div>
                            ) : null}

                            {timeline.length > 0 ? (
                              <div
                                className="rounded-lg p-3 mt-3"
                                style={{
                                  background: "rgba(255,255,255,0.03)",
                                  border: "1px solid rgba(255,255,255,0.06)",
                                }}
                              >
                                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                                  Ops timeline
                                </div>
                                <div className="space-y-2 mt-2">
                                  {timeline.slice(0, 3).map((event) => (
                                    <div
                                      key={event.id || `${event.kind || 'event'}:${event.createdAt || event.label || draft.id}`}
                                      className="text-[11px]"
                                      style={{ lineHeight: 1.5 }}
                                    >
                                      <div style={{ color: "var(--heading)", fontWeight: 600 }}>
                                        {event.label || 'Ops update'}
                                      </div>
                                      {event.detail ? (
                                        <div style={{ color: "var(--t3)" }}>
                                          {event.detail}
                                        </div>
                                      ) : null}
                                      <div style={{ color: "var(--t4)" }}>
                                        {[event.actorLabel, event.createdAt
                                          ? new Date(event.createdAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: 'numeric',
                                              minute: '2-digit',
                                            })
                                          : null]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {draft.conflict?.warnings?.length ? (
                              <div className="space-y-1 mt-2">
                                {draft.conflict.warnings.slice(0, 2).map((warning) => (
                                  <div key={warning} className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                                    {warning}
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2 mt-3">
                              {draft.status === 'ready_for_ops' && (
                                <button
                                  onClick={() => handlePromoteOpsSessionDraft(draft.id)}
                                  disabled={isPromoting || promoteOpsSessionDraft.isPending}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(6,182,212,0.12)",
                                    border: "1px solid rgba(6,182,212,0.22)",
                                    color: "#67E8F9",
                                    opacity: isPromoting ? 0.7 : 1,
                                  }}
                                >
                                  {isPromoting ? 'Converting…' : 'Convert to Session Draft'}
                                </button>
                              )}

                              {draft.status !== 'archived' && (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'assign_self')}
                                  disabled={isAssigning}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(59,130,246,0.10)",
                                    border: "1px solid rgba(59,130,246,0.18)",
                                    color: "#60A5FA",
                                    opacity: isAssigning ? 0.7 : 1,
                                  }}
                                >
                                  {isAssigning ? 'Assigning…' : 'Assign to me'}
                                </button>
                              )}

                              {dailyOwnershipView === 'team' && draft.status !== 'archived' && assignableOpsTeammates.length ? (
                                <button
                                  onClick={() => handleAssignTeammateStart(draft.id)}
                                  disabled={isAssigningTeammate}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(6,182,212,0.10)",
                                    border: "1px solid rgba(6,182,212,0.18)",
                                    color: "#67E8F9",
                                    opacity: isAssigningTeammate ? 0.7 : 1,
                                  }}
                                >
                                  {isAssigningTeammate ? 'Assigning…' : 'Assign teammate'}
                                </button>
                              ) : null}

                              {dailyOwnershipView === 'team' && draft.status !== 'archived' && opsWorkflow?.ownerUserId && (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'reassign_owner')}
                                  disabled={isReassigning}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(245,158,11,0.10)",
                                    border: "1px solid rgba(245,158,11,0.18)",
                                    color: "#F59E0B",
                                    opacity: isReassigning ? 0.7 : 1,
                                  }}
                                >
                                  {isReassigning ? 'Reassigning…' : 'Reassign'}
                                </button>
                              )}

                              {dailyOwnershipView === 'team' && draft.status !== 'archived' && opsWorkflow?.ownerUserId ? (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'ping_owner')}
                                  disabled={isPingingOwner}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(245,158,11,0.10)",
                                    border: "1px solid rgba(245,158,11,0.18)",
                                    color: "#F59E0B",
                                    opacity: isPingingOwner ? 0.7 : 1,
                                  }}
                                >
                                  {isPingingOwner ? 'Pinging…' : 'Ping owner'}
                                </button>
                              ) : null}

                              {draft.status !== 'archived' && draft.status !== 'rejected' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'due_today')}
                                    disabled={isDueToday}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                    style={{
                                      background: "rgba(245,158,11,0.10)",
                                      border: "1px solid rgba(245,158,11,0.18)",
                                      color: "#F59E0B",
                                      opacity: isDueToday ? 0.7 : 1,
                                    }}
                                  >
                                    {isDueToday ? 'Setting…' : 'Due today'}
                                  </button>
                                  <button
                                    onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'due_tomorrow')}
                                    disabled={isDueTomorrow}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                    style={{
                                      background: "rgba(255,255,255,0.06)",
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      color: "var(--heading)",
                                      opacity: isDueTomorrow ? 0.7 : 1,
                                    }}
                                  >
                                    {isDueTomorrow ? 'Setting…' : 'Due tomorrow'}
                                  </button>
                                </>
                              )}

                              {draft.status !== 'archived' && (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'add_note')}
                                  disabled={isAddingNote}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    color: "var(--heading)",
                                    opacity: isAddingNote ? 0.7 : 1,
                                  }}
                                >
                                  {isAddingNote ? 'Saving…' : 'Add note'}
                                </button>
                              )}

                              {draft.status === 'ready_for_ops' || draft.status === 'session_draft' ? (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'reject')}
                                  disabled={isRejecting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(239,68,68,0.10)",
                                    border: "1px solid rgba(239,68,68,0.18)",
                                    color: "#EF4444",
                                    opacity: isRejecting ? 0.7 : 1,
                                  }}
                                >
                                  {isRejecting ? 'Rejecting…' : 'Reject'}
                                </button>
                              ) : null}

                              {draft.status === 'session_draft' ? (
                                <>
                                <button
                                  onClick={() => handlePrepareOpsSessionDraftPublish(draft)}
                                  disabled={isPreparingPublish}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(16,185,129,0.10)",
                                    border: "1px solid rgba(16,185,129,0.18)",
                                    color: "#10B981",
                                    opacity: isPreparingPublish ? 0.7 : 1,
                                  }}
                                >
                                  {isPreparingPublish ? 'Preparing…' : (publishMeta?.targetDate ? 'Update publish plan' : 'Prepare publish')}
                                </button>
                                {!publishMeta?.publishedPlaySessionId && publishMeta?.targetDate && publishReview?.status !== 'blocked' ? (
                                  <button
                                    onClick={() => handlePublishOpsSessionDraft(draft)}
                                    disabled={isPublishing}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                    style={{
                                      background: "rgba(34,197,94,0.12)",
                                      border: "1px solid rgba(34,197,94,0.2)",
                                      color: "#22C55E",
                                      opacity: isPublishing ? 0.7 : 1,
                                    }}
                                  >
                                    {isPublishing ? 'Publishing…' : 'Publish to schedule'}
                                  </button>
                                ) : null}
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'archive')}
                                  disabled={isArchiving}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(148,163,184,0.12)",
                                    border: "1px solid rgba(148,163,184,0.18)",
                                    color: "#94A3B8",
                                    opacity: isArchiving ? 0.7 : 1,
                                  }}
                                >
                                  {isArchiving ? 'Archiving…' : 'Archive'}
                                </button>
                                </>
                              ) : null}

                              {(draft.status === 'rejected' || draft.status === 'archived') ? (
                                <button
                                  onClick={() => handleUpdateOpsSessionDraftWorkflow(draft.id, 'reopen_ready')}
                                  disabled={isReopening}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-opacity"
                                  style={{
                                    background: "rgba(16,185,129,0.10)",
                                    border: "1px solid rgba(16,185,129,0.18)",
                                    color: "#10B981",
                                    opacity: isReopening ? 0.7 : 1,
                                  }}
                                >
                                  {isReopening ? 'Reopening…' : 'Re-open'}
                                </button>
                              ) : null}

                              <Link
                                href={advisorHref}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  color: "var(--heading)",
                                }}
                              >
                                Open in Advisor
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            </div>

                            <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: "var(--t4)" }}>
                              <span>{draft.maxPlayers} max players</span>
                              <span>{timeAgo(draft.updatedAt)}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {proactiveOpportunities.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Proactive Opportunities
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  Membership lifecycle moments the agent is already surfacing for the club.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {proactiveOpportunities.map((opportunity) => {
                const iconColor = opportunity.kind === "trial_follow_up" ? "#10B981" : "#8B5CF6"
                const Icon = opportunity.kind === "trial_follow_up" ? UserPlus : Send
                    const href = actionHref(opportunity.action, opportunity.advisorPrompt)

                return (
                  <div
                    key={opportunity.id}
                    className="rounded-xl p-4"
                    style={{
                      background: opportunity.blockedCount > 0
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(139,92,246,0.08)",
                      border: opportunity.blockedCount > 0
                        ? "1px solid rgba(239,68,68,0.16)"
                        : "1px solid rgba(139,92,246,0.16)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${iconColor}15` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: iconColor }} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                            {opportunity.title}
                          </div>
                          <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                            {opportunity.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold tabular-nums" style={{ color: iconColor }}>
                          {opportunity.pendingCount + opportunity.blockedCount}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--t4)" }}>
                          open cases
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {opportunity.pendingCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>
                          {opportunity.pendingCount} pending
                        </span>
                      )}
                      {opportunity.blockedCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>
                          {opportunity.blockedCount} blocked
                        </span>
                      )}
                    </div>

                    {opportunity.sampleMembers.length > 0 && (
                      <div className="text-[11px] mt-3" style={{ color: "var(--t4)" }}>
                        Members: {opportunity.sampleMembers.join(", ")}
                      </div>
                    )}

                    {href ? (
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                        style={{ color: "var(--heading)" }}
                      >
                        {opportunity.ctaLabel}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <button
                        onClick={() => runSuggestionAction(opportunity.action)}
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                        style={{ color: "var(--heading)" }}
                      >
                        {opportunity.ctaLabel}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {policyScenarios.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: "#10B981" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Policy Simulator
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  What recent agent activity suggests would change if you move specific actions to auto-run.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {policyScenarios.slice(0, 4).map((scenario) => (
                <div
                  key={scenario.action}
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.16)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                        {actionLabel(scenario.action)} → Auto
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                        Based on the last {scenario.consideredCount} recent {actionLabel(scenario.action).toLowerCase()} actions.
                      </div>
                    </div>
                    <div
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        background: "rgba(245,158,11,0.12)",
                        color: "#F59E0B",
                      }}
                    >
                      {scenario.currentMode} now
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div
                      className="rounded-lg p-2"
                      style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.16)" }}
                    >
                      <div className="text-[11px]" style={{ color: "#10B981" }}>Would auto-run</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: "#10B981" }}>{scenario.autoGain}</div>
                    </div>
                    <div
                      className="rounded-lg p-2"
                      style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.16)" }}
                    >
                      <div className="text-[11px]" style={{ color: "#F59E0B" }}>Still review</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: "#F59E0B" }}>{scenario.stillPending}</div>
                    </div>
                    <div
                      className="rounded-lg p-2"
                      style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.16)" }}
                    >
                      <div className="text-[11px]" style={{ color: "#EF4444" }}>Still blocked</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: "#EF4444" }}>{scenario.stillBlocked}</div>
                    </div>
                  </div>

                  {scenario.requiresLiveMode && (
                    <div className="text-[11px] mt-3" style={{ color: "#F59E0B" }}>
                      This estimate assumes the club also switches Agent to Live mode.
                    </div>
                  )}

                  {scenario.topReasons.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] font-medium" style={{ color: "var(--heading)" }}>
                        What would still hold it back
                      </div>
                      <div className="space-y-1 mt-1.5">
                        {scenario.topReasons.slice(0, 2).map((reason) => (
                          <div key={reason.label} className="flex items-start justify-between gap-3">
                            <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                              {reason.label}
                            </div>
                            <div className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--t4)" }}>
                              {reason.count}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <Link
                      href={`/clubs/${clubId}/intelligence/settings`}
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--heading)" }}
                    >
                      Open settings
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      href={`/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(buildAdvisorPolicyPrompt(scenario))}`}
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "#10B981" }}
                    >
                      Apply in Advisor
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {(sandboxDrafts.length > 0 || sandboxRouting.configuredMode === 'test_recipients') && (
        <motion.div
          ref={previewInboxRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4" style={{ color: "#F472B6" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                    Preview Inbox
                  </h2>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                  Sandbox runs stop before live delivery and stage the exact audience, routing, and send window here for review.
                </p>
                {deepLinkFocus === 'preview-inbox' && (
                  <div className="text-[11px] mt-2 font-medium" style={{ color: "#67E8F9" }}>
                    Focused from the daily to-do or schedule layer.
                  </div>
                )}
              </div>
              <div
                className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{
                  background: sandboxRouting.configuredMode === 'test_recipients'
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(244,114,182,0.12)",
                  color: sandboxRouting.configuredMode === 'test_recipients' ? "#10B981" : "#F472B6",
                }}
              >
                {sandboxRouting.configuredMode === 'test_recipients' ? 'Test recipients armed' : 'Preview only'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {[
                {
                  label: 'Preview-ready drafts',
                  value: sandboxDrafts.length,
                  note: 'Sandbox runs staged in Advisor',
                  color: '#F472B6',
                },
                {
                  label: 'Email test recipients',
                  value: sandboxRouting.emailRecipients.length,
                  note: sandboxRouting.configuredMode === 'test_recipients' ? 'Approved inboxes for safe delivery tests' : 'Preview-only mode keeps email delivery off',
                  color: '#10B981',
                },
                {
                  label: 'SMS test recipients',
                  value: sandboxRouting.smsRecipients.length,
                  note: sandboxRouting.configuredMode === 'test_recipients' ? 'Approved phones for safe SMS tests' : 'Preview-only mode keeps SMS delivery off',
                  color: '#06B6D4',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl p-3"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="text-[11px] font-medium" style={{ color: item.color }}>
                    {item.label}
                  </div>
                  <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "var(--heading)" }}>
                    {item.value}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                    {item.note}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="rounded-xl p-3 mb-4"
              style={{
                background: sandboxRouting.configuredMode === 'test_recipients'
                  ? "rgba(16,185,129,0.08)"
                  : "rgba(244,114,182,0.08)",
                border: sandboxRouting.configuredMode === 'test_recipients'
                  ? "1px solid rgba(16,185,129,0.16)"
                  : "1px solid rgba(244,114,182,0.16)",
              }}
            >
              <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>
                {sandboxRouting.configuredMode === 'test_recipients'
                  ? 'Sandbox delivery is armed for approved test recipients only.'
                  : 'Sandbox stays in preview-only mode until we explicitly whitelist delivery targets.'}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                {sandboxRouting.configuredMode === 'test_recipients'
                  ? `Email: ${sandboxRouting.emailRecipients.length || 0} · SMS: ${sandboxRouting.smsRecipients.length || 0}. Live members remain protected.`
                  : 'No live messages will be sent. The agent only stages who would receive the action and why.'}
              </div>
            </div>

            {sandboxDrafts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--t4)", opacity: 0.5 }} />
                <p className="text-sm" style={{ color: "var(--t4)" }}>
                  No sandbox previews yet. Run a draft through Advisor and it will land here for review.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sandboxDrafts.slice(0, 6).map((draft) => {
                  const preview = draft.metadata?.sandboxPreview || null
                  const routing = preview?.routing || null
                  const routeEmails = routing?.emailRecipients || []
                  const routeSms = routing?.smsRecipients || []
                  const previewRecipients = preview?.recipients || []

                  return (
                    <div
                      key={draft.id}
                      className="rounded-xl p-4"
                      style={{
                        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                        border: "1px solid var(--card-border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                              {draft.title}
                            </div>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "rgba(244,114,182,0.12)", color: "#F472B6" }}
                            >
                              {formatSandboxDraftKind(draft.kind)}
                            </span>
                            {draft.selectedPlan === 'recommended' && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA" }}
                              >
                                Agent plan
                              </span>
                            )}
                          </div>
                          <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                            {draft.summary || draft.originalIntent || 'Sandbox preview ready for review.'}
                          </div>
                        </div>

                        <Link
                          href={buildAdvisorDraftHref(clubId, draft)}
                          className="inline-flex items-center gap-1 text-xs font-medium shrink-0"
                          style={{ color: "var(--heading)" }}
                        >
                          Open in Advisor
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(244,114,182,0.12)", color: "#F472B6" }}
                        >
                          {(preview?.recipientCount || 0)} eligible
                        </span>
                        {!!preview?.skippedCount && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}
                          >
                            {preview.skippedCount} skipped
                          </span>
                        )}
                        {preview?.scheduledLabel && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}
                          >
                            {preview.scheduledLabel}
                          </span>
                        )}
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: routing?.mode === 'test_recipients'
                              ? "rgba(16,185,129,0.12)"
                              : "rgba(148,163,184,0.12)",
                            color: routing?.mode === 'test_recipients' ? "#10B981" : "#94A3B8",
                          }}
                        >
                          {routing?.label || 'Preview only'}
                        </span>
                      </div>

                      <div className="text-[11px] mt-2" style={{ color: "var(--t4)" }}>
                        {routing?.note || preview?.note || 'Live members were not contacted.'}
                      </div>

                      {(routeEmails.length > 0 || routeSms.length > 0) && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {routeEmails.length > 0 && (
                            <div
                              className="rounded-lg p-2.5"
                              style={{
                                background: "rgba(16,185,129,0.08)",
                                border: "1px solid rgba(16,185,129,0.16)",
                              }}
                            >
                              <div className="text-[11px] font-medium" style={{ color: "#10B981" }}>
                                Email test route
                              </div>
                              <div className="text-[11px] mt-1 break-all" style={{ color: "var(--t3)" }}>
                                {routeEmails.join(', ')}
                              </div>
                            </div>
                          )}
                          {routeSms.length > 0 && (
                            <div
                              className="rounded-lg p-2.5"
                              style={{
                                background: "rgba(6,182,212,0.08)",
                                border: "1px solid rgba(6,182,212,0.16)",
                              }}
                            >
                              <div className="text-[11px] font-medium" style={{ color: "#06B6D4" }}>
                                SMS test route
                              </div>
                              <div className="text-[11px] mt-1 break-all" style={{ color: "var(--t3)" }}>
                                {routeSms.join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {previewRecipients.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[11px] font-medium" style={{ color: "var(--heading)" }}>
                            Would reach
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                            {previewRecipients.slice(0, 4).map((recipient) => recipient.name).join(', ')}
                            {preview?.recipientCount && preview.recipientCount > 4
                              ? ` +${preview.recipientCount - 4} more`
                              : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* ── Pending Actions Queue ── */}
      <motion.div
        ref={pendingQueueRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: "#F59E0B" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
                Pending Actions
              </h2>
              {pendingActions.length > 0 && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}
                >
                  {pendingActions.length}
                </span>
              )}
            </div>
            {deepLinkFocus === 'pending-queue' && (
              <div className="text-[11px] font-medium" style={{ color: "#67E8F9" }}>
                Focused from the daily to-do or schedule layer.
              </div>
            )}
          </div>

          {pendingActions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--t4)", opacity: 0.5 }} />
              <p className="text-sm" style={{ color: "var(--t4)" }}>
                No pending actions — all caught up!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {pendingActions.map((action) => (
                  <motion.div
                    key={action.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-3 rounded-xl p-3"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <TypeIcon type={action.type} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--heading)" }}>
                        {action.description}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <TriggerSourceBadge source={action.triggerSource} />
                        <TriggerOutcomeBadge outcome={action.triggerOutcome} />
                        <MembershipReasonBadge reason={getPrimaryReason(action.triggerReasons)} />
                        <span className="text-xs" style={{ color: "var(--t4)" }}>
                          {action.memberName}
                        </span>
                        {action.confidence !== null && (
                          <>
                            <span style={{ color: "var(--t4)", opacity: 0.4 }}>·</span>
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: (action.confidence ?? 0) >= 80 ? "#10B981"
                                  : (action.confidence ?? 0) >= 50 ? "#F59E0B" : "#9CA3AF",
                              }}
                            >
                              {action.confidence}% confidence
                            </span>
                          </>
                        )}
                        <span style={{ color: "var(--t4)", opacity: 0.4 }}>·</span>
                        <span className="text-xs" style={{ color: "var(--t4)" }}>
                          {timeAgo(action.createdAt)}
                        </span>
                      </div>
                      {getPrimaryReason(action.triggerReasons) && (
                        <div
                          className="text-[11px] mt-1"
                          style={{
                            color: isMembershipReason(getPrimaryReason(action.triggerReasons)) ? "#C4B5FD" : "var(--t4)",
                          }}
                        >
                          {getPrimaryReason(action.triggerReasons)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleApprove(action.id)}
                        disabled={processingId === action.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                        style={{
                          background: "rgba(16,185,129,0.12)",
                          color: "#10B981",
                          opacity: processingId === action.id ? 0.5 : 1,
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleSkip(action.id)}
                        disabled={processingId === action.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                          color: "var(--t3)",
                          opacity: processingId === action.id ? 0.5 : 1,
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 inline mr-1" />
                        Skip
                      </button>
                      <button
                        onClick={() => handleSnooze(action.id)}
                        disabled={processingId === action.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                          color: "var(--t3)",
                          opacity: processingId === action.id ? 0.5 : 1,
                        }}
                      >
                        <Timer className="w-3.5 h-3.5 inline mr-1" />
                        Tomorrow
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </Card>
      </motion.div>

      {/* ── Activity Feed ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: "#8B5CF6" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--heading)" }}>
              Activity Feed
            </h2>
            <span className="text-xs" style={{ color: "var(--t4)" }}>
              Last 7 days
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--t4)", opacity: 0.5 }} />
              <p className="text-sm" style={{ color: "var(--t4)" }}>
                No agent activity yet. The AI agent will start generating actions once enabled.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, i) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    background: i % 2 === 0
                      ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)")
                      : "transparent",
                  }}
                >
                  <TypeIcon type={log.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--heading)" }}>
                        {log.memberName}
                      </span>
                      <StatusBadge status={log.status} />
                      <TriggerSourceBadge source={log.triggerSource} />
                      <TriggerOutcomeBadge outcome={log.triggerOutcome || (log.autoApproved ? "auto" : null)} />
                      <MembershipReasonBadge reason={getPrimaryReason(log.triggerReasons)} />
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--t4)" }}>
                      {describeAction(log.type, log)}
                    </p>
                    {getPrimaryReason(log.triggerReasons) && (
                      <p
                        className="text-[11px] mt-1"
                        style={{
                          color: isMembershipReason(getPrimaryReason(log.triggerReasons)) ? "#C4B5FD" : "var(--t4)",
                        }}
                      >
                        {getPrimaryReason(log.triggerReasons)}
                      </p>
                    )}
                  </div>
                  <div className="text-xs shrink-0" style={{ color: "var(--t4)" }}>
                    {timeAgo(log.createdAt)}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
