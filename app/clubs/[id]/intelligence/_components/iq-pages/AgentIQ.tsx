'use client'
import Link from "next/link"
import { useState, useRef } from "react"
import { motion, useInView, AnimatePresence } from "motion/react"
import {
  Bot, Zap, TrendingUp, CheckCircle2, Clock, Send,
  XCircle, SkipForward, Timer, UserPlus, Heart, Puzzle,
  ArrowUpRight, Activity, Shield,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"

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
  membershipLifecycle?: string | null
  membershipStatus?: string | null
  membershipType?: string | null
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
  membershipLifecycle?: string | null
  membershipStatus?: string | null
  membershipType?: string | null
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
  isLoading: boolean
  agentLive: boolean
  approveAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  skipAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
  snoozeAction: { mutate: (input: any, opts?: any) => void; isPending: boolean }
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
        ctaLabel: pendingCount > 0 ? "Review pending actions" : "Open Advisor",
        action: pendingCount > 0 ? "scroll_pending" : "open_advisor",
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
      ctaLabel: pendingCount > 0 ? "Review pending actions" : "Open Advisor",
      action: pendingCount > 0 ? "scroll_pending" : "open_advisor",
    }
  })
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

// ── Component ──
export function AgentIQ({
  clubId,
  activity,
  pending,
  isLoading,
  agentLive,
  approveAction,
  skipAction,
  snoozeAction,
}: AgentIQProps) {
  const { isDark } = useTheme()
  const headerRef = useRef<HTMLDivElement>(null)
  const pendingQueueRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true })
  const [processingId, setProcessingId] = useState<string | null>(null)

  const stats = activity?.stats
  const logs = activity?.logs || []
  const pendingActions = pending || []
  const autopilotSummary = buildAutopilotSummary(logs)
  const autopilotSuggestions = buildAutopilotSuggestions(autopilotSummary, pendingActions.length)
  const proactiveOpportunities = buildProactiveOpportunities(logs, pendingActions)

  const actionHref = (action: AutopilotSuggestionAction) => {
    switch (action) {
      case "open_settings":
        return `/clubs/${clubId}/intelligence/settings`
      case "open_integrations":
        return `/clubs/${clubId}/intelligence/integrations`
      case "open_advisor":
        return `/clubs/${clubId}/intelligence/advisor`
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
                const href = actionHref(opportunity.action)

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
