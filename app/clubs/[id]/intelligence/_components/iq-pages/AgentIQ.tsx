'use client'
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, useInView, AnimatePresence } from "motion/react"
import {
  Bot, Zap, TrendingUp, CheckCircle2, Clock, Send,
  XCircle, SkipForward, Timer, UserPlus, Heart, Puzzle,
  ArrowUpRight, Activity, Shield, CalendarDays,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { buildAgentPolicyScenarios } from "@/lib/ai/agent-policy-simulator"
import { resolveAgentAutonomyPolicy } from "@/lib/ai/agent-autonomy"
import { buildAdvisorSandboxRoutingSummary } from "@/lib/ai/advisor-sandbox-routing"
import type {
  MembershipSignal,
  NormalizedMembershipStatus,
  NormalizedMembershipType,
} from "@/types/intelligence"
import type { AgentPolicyScenario } from "@/lib/ai/agent-policy-simulator"

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
    }> | null
  } | null
  updatedAt: string | Date
  createdAt: string | Date
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
  metadata?: {
    sessionDraft?: {
      stage?: string
      createdAt?: string
      publishMode?: string
      nextStep?: string
      title?: string
      recommendedWindow?: string
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

interface ProgrammingOpsStage {
  key: ProgrammingOpsStageKey
  label: string
  description: string
  color: string
  cards: ProgrammingDraftCard[]
}

type OpsSessionDraftStageKey = 'ready_for_ops' | 'session_draft' | 'rejected' | 'archived'
type AgentDeepLinkFocus = 'programming-cockpit' | 'ops-board' | 'ops-queue' | 'preview-inbox' | 'pending-queue'
type DailyAdminTodoBucket = 'today' | 'tomorrow' | 'waiting' | 'blocked' | 'recommended'

interface DailyAdminTodoItem {
  id: string
  title: string
  description: string
  ctaLabel: string
  href: string
  tone: 'default' | 'warn' | 'danger' | 'success'
  count?: string | number | null
}

interface DailyAdminTodoSection {
  key: DailyAdminTodoBucket
  label: string
  description: string
  color: string
  items: DailyAdminTodoItem[]
}

type DailyAdminTodoDecision = 'accepted' | 'declined' | 'not_now'

interface OpsSessionDraftStage {
  key: OpsSessionDraftStageKey
  label: string
  description: string
  color: string
  drafts: OpsSessionDraftItem[]
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
  isLoading: boolean
  agentLive: boolean
  intelligenceSettings?: any
  approveAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  skipAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  snoozeAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  promoteOpsSessionDraft: { mutate: (input: any, opts?: any) => void; isPending: boolean }
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

function sortProgrammingDrafts(drafts: ProgrammingDraftCard[]) {
  return [...drafts].sort((left, right) => {
    if (right.primary.confidence !== left.primary.confidence) return right.primary.confidence - left.primary.confidence
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
  const strongest = ranked[0] || null
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

function sortOpsSessionDrafts(drafts: OpsSessionDraftItem[]) {
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

function buildOpsSessionDraftQueue(drafts: OpsSessionDraftItem[]) {
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
    stage.drafts = sortOpsSessionDrafts(stage.drafts)
  }

  return stages
}

function buildDailyAdminTodoSections(args: {
  clubId: string
  pendingActions: PendingAction[]
  autopilotSummary: ReturnType<typeof buildAutopilotSummary>
  proactiveOpportunities: ProactiveOpportunity[]
  membershipLifecycleCards: MembershipLifecycleAutopilotCard[]
  programmingCockpit: ReturnType<typeof buildProgrammingCockpit>
  opsSessionDraftQueue: ReturnType<typeof buildOpsSessionDraftQueue>
  sandboxDrafts: AdvisorDraftWorkspaceItem[]
  policyScenarios: AgentPolicyScenario[]
}) {
  const {
    clubId,
    pendingActions,
    autopilotSummary,
    proactiveOpportunities,
    membershipLifecycleCards,
    programmingCockpit,
    opsSessionDraftQueue,
    sandboxDrafts,
    policyScenarios,
  } = args

  const newestSandboxDraft = [...sandboxDrafts]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] || null
  const readyOpsDraft = opsSessionDraftQueue.find((stage) => stage.key === 'ready_for_ops')?.drafts[0] || null
  const sessionDraft = opsSessionDraftQueue.find((stage) => stage.key === 'session_draft')?.drafts[0] || null
  const pendingLifecycleOpportunity = proactiveOpportunities.find((opportunity) => opportunity.pendingCount > 0) || null
  const blockedLifecycleCard = [...membershipLifecycleCards]
    .sort((left, right) => right.blockedCount - left.blockedCount)[0] || null
  const bestScenario = [...policyScenarios]
    .sort((left, right) => right.autoGain - left.autoGain)[0] || null

  return [
    {
      key: 'today',
      label: 'Today',
      description: 'Operational work to clear right now.',
      color: '#10B981',
      items: [
        pendingActions.length > 0 ? {
          id: 'today-pending',
          title: 'Clear the approval queue',
          description: `${pendingActions.length} action${pendingActions.length === 1 ? '' : 's'} are waiting for manual review right now.`,
          ctaLabel: 'Open pending actions',
          href: buildAgentFocusHref(clubId, { focus: 'pending-queue' }),
          tone: 'warn' as const,
          count: pendingActions.length,
        } : null,
        readyOpsDraft ? {
          id: `today-ops-${readyOpsDraft.id}`,
          title: 'Move a ready ops draft forward',
          description: `${readyOpsDraft.title} is ready for scheduling ops review and can be converted into a session draft.`,
          ctaLabel: 'Open ops queue',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: readyOpsDraft.dayOfWeek,
            opsDraftId: readyOpsDraft.id,
          }),
          tone: 'success' as const,
          count: `${readyOpsDraft.projectedOccupancy}%`,
        } : null,
        newestSandboxDraft ? {
          id: `today-sandbox-${newestSandboxDraft.id}`,
          title: 'Review the latest sandbox preview',
          description: `${newestSandboxDraft.title} has a safe preview ready before anything reaches real members.`,
          ctaLabel: 'Open preview inbox',
          href: buildAgentFocusHref(clubId, { focus: 'preview-inbox' }),
          tone: 'default' as const,
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
          href: buildAgentFocusHref(clubId, {
            focus: 'programming-cockpit',
            day: programmingCockpit.strongest.primary.dayOfWeek,
            draftId: programmingCockpit.strongest.id,
          }),
          tone: 'default' as const,
          count: `${programmingCockpit.strongest.primary.projectedOccupancy}% fill`,
        } : null,
        sessionDraft ? {
          id: `tomorrow-session-draft-${sessionDraft.id}`,
          title: 'Finish the next internal session draft',
          description: `${sessionDraft.title} is already in session-draft mode and is the cleanest ops handoff for tomorrow.`,
          ctaLabel: 'Open session draft queue',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: sessionDraft.dayOfWeek,
            opsDraftId: sessionDraft.id,
          }),
          tone: 'success' as const,
          count: sessionDraft.estimatedInterestedMembers,
        } : null,
        pendingLifecycleOpportunity && pendingActions.length === 0 ? {
          id: `tomorrow-lifecycle-${pendingLifecycleOpportunity.id}`,
          title: 'Prepare the next lifecycle push',
          description: pendingLifecycleOpportunity.description,
          ctaLabel: pendingLifecycleOpportunity.ctaLabel,
          href: pendingLifecycleOpportunity.advisorPrompt
            ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(pendingLifecycleOpportunity.advisorPrompt)}`
            : buildAgentFocusHref(clubId, { focus: 'pending-queue' }),
          tone: 'default' as const,
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
        pendingLifecycleOpportunity ? {
          id: `waiting-lifecycle-${pendingLifecycleOpportunity.id}`,
          title: pendingLifecycleOpportunity.title,
          description: pendingLifecycleOpportunity.description,
          ctaLabel: pendingLifecycleOpportunity.ctaLabel,
          href: pendingLifecycleOpportunity.pendingCount > 0
            ? buildAgentFocusHref(clubId, { focus: 'pending-queue' })
            : pendingLifecycleOpportunity.advisorPrompt
              ? `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(pendingLifecycleOpportunity.advisorPrompt)}`
              : buildAgentFocusHref(clubId, { focus: 'pending-queue' }),
          tone: 'warn' as const,
          count: pendingLifecycleOpportunity.pendingCount || null,
        } : null,
        readyOpsDraft ? {
          id: `waiting-ready-ops-${readyOpsDraft.id}`,
          title: 'An ops draft is waiting for review',
          description: `${readyOpsDraft.title} is sitting in Ready For Ops until someone converts it into a session draft.`,
          ctaLabel: 'Review ops draft',
          href: buildAgentFocusHref(clubId, {
            focus: 'ops-queue',
            day: readyOpsDraft.dayOfWeek,
            opsDraftId: readyOpsDraft.id,
          }),
          tone: 'warn' as const,
          count: readyOpsDraft.confidence,
        } : null,
        newestSandboxDraft ? {
          id: `waiting-sandbox-${newestSandboxDraft.id}`,
          title: 'A sandbox run needs sign-off',
          description: `${newestSandboxDraft.title} is staged in preview so routing and audience can be reviewed safely.`,
          ctaLabel: 'Review preview',
          href: buildAgentFocusHref(clubId, { focus: 'preview-inbox' }),
          tone: 'warn' as const,
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
          tone: 'danger' as const,
          count: autopilotSummary.counts.blocked,
        } : null,
        blockedLifecycleCard && blockedLifecycleCard.blockedCount > 0 ? {
          id: `blocked-lifecycle-${blockedLifecycleCard.id}`,
          title: blockedLifecycleCard.title,
          description: `${blockedLifecycleCard.blockedCount} lifecycle cases are still held back. ${blockedLifecycleCard.topReasons[0]?.label || ''}`.trim(),
          ctaLabel: 'Tune in Advisor',
          href: `/clubs/${clubId}/intelligence/advisor?prompt=${encodeURIComponent(blockedLifecycleCard.advisorPrompt)}`,
          tone: 'danger' as const,
          count: blockedLifecycleCard.blockedCount,
        } : null,
        autopilotSummary.membershipHeldCount > 0 ? {
          id: 'blocked-membership',
          title: 'Membership rules are holding actions',
          description: 'Weak or unknown membership signals are forcing the agent back into safer review-first paths.',
          ctaLabel: 'Open integrations',
          href: `/clubs/${clubId}/intelligence/integrations`,
          tone: 'danger' as const,
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
          tone: 'default' as const,
          count: bestScenario.autoGain,
        } : null,
        programmingCockpit.strongest ? {
          id: `recommended-programming-${programmingCockpit.strongest.id}`,
          title: 'Back the strongest schedule idea',
          description: `${programmingCockpit.strongest.primary.title} currently has the best projected fill and demand signal in the club.`,
          ctaLabel: 'Open programming cockpit',
          href: buildAgentFocusHref(clubId, {
            focus: 'programming-cockpit',
            day: programmingCockpit.strongest.primary.dayOfWeek,
            draftId: programmingCockpit.strongest.id,
          }),
          tone: 'default' as const,
          count: `${programmingCockpit.strongest.primary.projectedOccupancy}%`,
        } : null,
        autopilotSummary.counts.auto === 0 && autopilotSummary.counts.pending > 0 ? {
          id: 'recommended-advisor',
          title: 'Let Advisor reshape the bottleneck',
          description: 'The club is still review-heavy. Advisor can propose the safest next policy move based on recent outcomes.',
          ctaLabel: 'Open Advisor',
          href: `/clubs/${clubId}/intelligence/advisor`,
          tone: 'default' as const,
          count: autopilotSummary.counts.pending,
        } : null,
      ].filter(Boolean) as DailyAdminTodoItem[],
    },
  ] satisfies DailyAdminTodoSection[]
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

function buildProgrammingRiskCheck(
  primary: ProgrammingPreviewProposal,
  alternative?: ProgrammingPreviewProposal | null,
) {
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
  const nextBest = draft.alternatives[0] || null
  return {
    nextBest,
    fillDelta: nextBest ? draft.primary.projectedOccupancy - nextBest.projectedOccupancy : null,
    demandDelta: nextBest ? draft.primary.estimatedInterestedMembers - nextBest.estimatedInterestedMembers : null,
    confidenceBand: buildProgrammingConfidenceBand(draft.primary.confidence),
    riskCheck: buildProgrammingRiskCheck(draft.primary, nextBest),
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
  isLoading,
  agentLive,
  intelligenceSettings,
  approveAction,
  skipAction,
  snoozeAction,
  promoteOpsSessionDraft,
}: AgentIQProps) {
  const { isDark } = useTheme()
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
  const [dailyTodoDecisions, setDailyTodoDecisions] = useState<Record<string, DailyAdminTodoDecision>>({})
  const [dailyTodoDateKey] = useState(() => new Date().toLocaleDateString('en-CA'))

  const stats = activity?.stats
  const logs = activity?.logs || []
  const pendingActions = pending || []
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
  const opsSessionDraftQueue = buildOpsSessionDraftQueue(opsSessionDrafts || [])
  const deepLinkFocus = isAgentDeepLinkFocus(searchParams.get('focus')) ? searchParams.get('focus') : null
  const deepLinkDay = searchParams.get('day')
  const deepLinkDraftId = searchParams.get('draftId')
  const deepLinkOpsDraftId = searchParams.get('opsDraftId')
  const deepLinkKey = [deepLinkFocus, deepLinkDay, deepLinkDraftId, deepLinkOpsDraftId].filter(Boolean).join(':')
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
  const dailyAdminTodoSections = buildDailyAdminTodoSections({
    clubId,
    pendingActions,
    autopilotSummary,
    proactiveOpportunities,
    membershipLifecycleCards,
    programmingCockpit,
    opsSessionDraftQueue,
    sandboxDrafts,
    policyScenarios,
  })
  const dailyTodoStorageKey = `iqsport:agent-daily-todo:${clubId}:${dailyTodoDateKey}`
  const handledDailyTodoItems = dailyAdminTodoSections
    .flatMap((section) => section.items)
    .filter((item) => !!dailyTodoDecisions[item.id])
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
    try {
      const raw = window.localStorage.getItem(dailyTodoStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, DailyAdminTodoDecision>
      setDailyTodoDecisions(parsed)
    } catch {
      setDailyTodoDecisions({})
    }
  }, [dailyTodoStorageKey])

  useEffect(() => {
    try {
      if (Object.keys(dailyTodoDecisions).length === 0) {
        window.localStorage.removeItem(dailyTodoStorageKey)
        return
      }
      window.localStorage.setItem(dailyTodoStorageKey, JSON.stringify(dailyTodoDecisions))
    } catch {
      // Ignore local persistence failures; the board still works in-memory.
    }
  }, [dailyTodoDecisions, dailyTodoStorageKey])

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

  const handlePromoteOpsSessionDraft = (opsSessionDraftId: string) => {
    setProcessingId(`ops:${opsSessionDraftId}`)
    promoteOpsSessionDraft.mutate(
      { clubId, opsSessionDraftId },
      { onSettled: () => setProcessingId(null) }
    )
  }

  const handleDailyTodoDecision = (item: DailyAdminTodoItem, decision: DailyAdminTodoDecision) => {
    setDailyTodoDecisions((current) => ({
      ...current,
      [item.id]: decision,
    }))

    if (decision === 'accepted') {
      router.push(item.href)
    }
  }

  const resetDailyTodoDecisions = () => {
    setDailyTodoDecisions({})
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

      {/* ── Daily Admin To-Do ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.13 }}
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
                The agent&apos;s recommended worklist for the club manager across today, tomorrow, and the next blockers.
              </p>
            </div>
            {handledDailyTodoItems.length > 0 && (
              <button
                onClick={resetDailyTodoDecisions}
                className="text-[11px] font-medium shrink-0"
                style={{ color: "var(--t3)" }}
              >
                Reset today
              </button>
            )}
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
                                  onClick={() => handleDailyTodoDecision(item, 'accepted')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.22)", color: "#10B981" }}
                                >
                                  Accept
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDailyTodoDecision(item, 'not_now')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", color: "#F59E0B" }}
                                >
                                  Not now
                                </button>
                                <button
                                  onClick={() => handleDailyTodoDecision(item, 'declined')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444" }}
                                >
                                  Decline
                                </button>
                              </div>
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
                          {impact.fillDelta !== null
                            ? `${impact.fillDelta >= 0 ? "+" : ""}${impact.fillDelta} fill pts vs next best.`
                            : impact.riskCheck.note}
                        </div>
                      </div>
                    </div>

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
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
              {opsSessionDraftQueue.map((stage) => (
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
                              {nextStep || draft.note || 'Internal session draft ready for manual scheduling review.'}
                            </div>

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
