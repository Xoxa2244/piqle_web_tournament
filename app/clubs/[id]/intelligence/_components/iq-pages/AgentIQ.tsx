'use client'
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
}

interface PendingAction {
  id: string
  type: string
  memberName: string
  confidence?: number | null
  description: string
  createdAt: string | Date
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
  switch (type) {
    case "CHECK_IN":           return `Check-in for ${log.transition || "watch member"}`
    case "RETENTION_BOOST":    return `Win-back for ${log.transition || "at-risk member"}`
    case "SLOT_FILLER":        return `Fill session: ${log.sessionTitle || "underfilled session"}`
    case "NEW_MEMBER_WELCOME": return "Welcome new member"
    case "REACTIVATION":       return "Reactivation outreach"
    default:                   return type
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
  const headerInView = useInView(headerRef, { once: true })
  const [processingId, setProcessingId] = useState<string | null>(null)

  const stats = activity?.stats
  const logs = activity?.logs || []
  const pendingActions = pending || []

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

      {/* ── Pending Actions Queue ── */}
      <motion.div
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
                      {log.autoApproved && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: "rgba(139,92,246,0.1)",
                            color: "#A78BFA",
                          }}
                        >
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--t4)" }}>
                      {describeAction(log.type, log)}
                    </p>
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
