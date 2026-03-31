'use client'
import React from "react"
import { motion } from "motion/react"
import {
  ArrowLeft, Calendar, Clock, MapPin, Trophy,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Mail, Shield,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts"
import { useTheme } from "../IQThemeProvider"
import { trpc } from "@/lib/trpc"

interface PlayerProfileIQProps {
  userId: string
  clubId: string
  onBack: () => void
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  )
}

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: "var(--subtle)" }} />
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", color: "var(--tooltip-color)", backdropFilter: "blur(12px)" }}>
      <div className="mb-1" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || "#8B5CF6" }} />
          <span>{p.value} sessions</span>
        </div>
      ))}
    </div>
  )
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM"
  if (h < 12) return `${h} AM`
  if (h === 12) return "12 PM"
  return `${h - 12} PM`
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A"
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const RISK_COLORS = {
  low: { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)", text: "#10B981", label: "Low Risk" },
  medium: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)", text: "#F59E0B", label: "Medium Risk" },
  high: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", text: "#EF4444", label: "High Risk" },
}

const MEMBERSHIP_COLORS: Record<string, { bg: string; text: string }> = {
  "Currently Active": { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  "Suspended": { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
  "Expired": { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
  "No Membership": { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
}

function PatternCard({ title, icon: Icon, items }: { title: string; icon: any; items: { label: string; count: number }[] }) {
  const max = items[0]?.count || 1
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: "#8B5CF6" }} />
        <span className="text-xs" style={{ fontWeight: 700, color: "var(--heading)" }}>{title}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <span className="text-xs" style={{ color: "var(--t4)" }}>No data yet</span>}
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--t2)" }}>{item.label}</span>
              <span style={{ color: "var(--t3)", fontWeight: 600 }}>{item.count}x</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.count / max) * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function PlayerProfileIQ({ userId, clubId, onBack }: PlayerProfileIQProps) {
  const { isDark } = useTheme()
  const { data, isLoading } = trpc.intelligence.getPlayerProfile.useQuery({ userId, clubId })

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <Shimmer className="w-8 h-8 rounded-lg" />
          <Shimmer className="h-6 w-48" />
        </div>
        <Shimmer className="h-24 w-full rounded-2xl" />
        <Shimmer className="h-64 w-full rounded-2xl" />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Shimmer key={i} className="h-32 rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Shimmer className="h-48 rounded-2xl" />
          <Shimmer className="h-48 rounded-2xl" />
        </div>
      </motion.div>
    )
  }

  if (!data) return null
  const { player, activity, patterns, risk, recentSessions } = data
  const lastPlayedDays = daysSince(player.lastPlayed)
  const memberSinceDate = formatDate(player.memberSince)
  const riskCfg = RISK_COLORS[risk.level]
  const memColor = MEMBERSHIP_COLORS[player.membershipStatus || ""] || MEMBERSHIP_COLORS["No Membership"]

  // Chart data — highlight last 4 weeks
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)
  const chartData = activity.sessionsPerWeek.map(w => ({
    week: new Date(w.week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    count: w.count,
    isRecent: w.week >= fourWeeksAgo,
  }))

  const TrendIcon = activity.trend === "increasing" ? TrendingUp : activity.trend === "declining" ? TrendingDown : Minus
  const trendColor = activity.trend === "increasing" ? "#10B981" : activity.trend === "declining" ? "#EF4444" : "#06B6D4"
  const trendLabel = activity.trend === "increasing" ? "Increasing" : activity.trend === "declining" ? "Declining" : "Stable"

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6 max-w-[1400px] mx-auto">
      {/* Section 1: Player Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs mb-4 transition-colors" style={{ color: "#8B5CF6", fontWeight: 600 }}>
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </button>
        <Card>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg text-white shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
              {(player.name || "??").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--heading)" }}>{player.name}</h1>
                {player.membershipStatus && (
                  <span className="px-2.5 py-1 rounded-lg text-[11px]" style={{ background: memColor.bg, color: memColor.text, fontWeight: 600 }}>
                    {player.membershipStatus}
                  </span>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
                Active since {memberSinceDate} &middot; Last played {lastPlayedDays === 0 ? "today" : `${lastPlayedDays} days ago`} &middot; {player.totalSessions} sessions
              </p>
              {player.membershipType && (
                <p className="text-xs mt-1" style={{ color: "var(--t4)" }}>{player.membershipType}</p>
              )}
            </div>
            {player.healthScore != null && (
              <div className="flex flex-col items-center gap-1">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>Health</div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${player.healthScore}%`,
                      background: player.healthScore <= 30 ? "#EF4444" : player.healthScore <= 50 ? "#F59E0B" : player.healthScore <= 70 ? "#06B6D4" : "#10B981",
                    }} />
                  </div>
                  <span className="text-sm" style={{
                    fontWeight: 700,
                    color: player.healthScore <= 30 ? "#EF4444" : player.healthScore <= 50 ? "#F59E0B" : player.healthScore <= 70 ? "#06B6D4" : "#10B981",
                  }}>{player.healthScore}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Section 2: Activity Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Activity Timeline</h2>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: `${trendColor}20`, color: trendColor, fontWeight: 600 }}>
            <TrendIcon className="w-3.5 h-3.5" /> {trendLabel}
          </span>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Sessions" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isRecent ? "#8B5CF6" : "#8B5CF640"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-32 text-xs" style={{ color: "var(--t4)" }}>No activity data in the last 90 days</div>
        )}
        <p className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>Last 12 weeks &middot; Highlighted bars = last 4 weeks</p>
      </Card>

      {/* Section 3: Play Patterns */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PatternCard
          title="Favorite Format"
          icon={Trophy}
          items={patterns.topFormats.map(f => ({ label: f.format.replace(/_/g, " "), count: f.count }))}
        />
        <PatternCard
          title="Preferred Time"
          icon={Clock}
          items={patterns.topTimes.map(t => ({ label: formatHour(t.hour), count: t.count }))}
        />
        <PatternCard
          title="Active Days"
          icon={Calendar}
          items={patterns.topDays.map(d => ({ label: d.day, count: d.count }))}
        />
        <PatternCard
          title="Favorite Courts"
          icon={MapPin}
          items={patterns.topCourts.map(c => ({ label: c.court, count: c.count }))}
        />
      </div>

      {/* Section 4: Risk + Recent Sessions */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Risk Card */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4" style={{ color: riskCfg.text }} />
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Risk Assessment</h2>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-lg text-xs" style={{ background: riskCfg.bg, border: `1px solid ${riskCfg.border}`, color: riskCfg.text, fontWeight: 700 }}>
              {riskCfg.label}
            </span>
          </div>
          <div className="space-y-2 text-xs" style={{ color: "var(--t2)" }}>
            <div className="flex justify-between">
              <span>Avg gap between sessions</span>
              <span style={{ fontWeight: 600 }}>{risk.avgGapDays} days</span>
            </div>
            <div className="flex justify-between">
              <span>Current gap</span>
              <span style={{ fontWeight: 600, color: risk.currentGapDays > risk.avgGapDays * 1.5 ? "#F59E0B" : "var(--t1)" }}>{risk.currentGapDays} days</span>
            </div>
            <div className="flex justify-between">
              <span>Frequency change (4w)</span>
              <span style={{ fontWeight: 600, color: risk.frequencyChange < 0 ? "#EF4444" : risk.frequencyChange > 0 ? "#10B981" : "var(--t1)" }}>
                {risk.frequencyChange > 0 ? "+" : ""}{risk.frequencyChange}%
              </span>
            </div>
          </div>
          {(risk.level === "high" || risk.level === "medium") && (
            <div className="mt-4 px-3 py-2.5 rounded-lg flex items-start gap-2 text-xs" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
              <span style={{ color: "#F59E0B" }}>
                {risk.level === "high"
                  ? "This member shows signs of churning. Consider a personalized reactivation email with a special offer."
                  : "Activity is declining. A check-in message could help re-engage this member."}
              </span>
            </div>
          )}
          {(risk.level === "high" || risk.level === "medium") && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs text-white"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600, boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
            >
              <Mail className="w-3.5 h-3.5" />
              Send Reactivation Email
            </motion.button>
          )}
        </Card>

        {/* Recent Sessions */}
        <Card>
          <h2 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Recent Sessions</h2>
          {recentSessions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs" style={{ color: "var(--t4)" }}>No sessions found</div>
          ) : (
            <div className="space-y-0 overflow-hidden rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
              {recentSessions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 text-xs"
                  style={{ borderBottom: i < recentSessions.length - 1 ? "1px solid var(--divider)" : "none", background: i % 2 === 0 ? "transparent" : "var(--subtle)" }}
                >
                  <span className="w-20 shrink-0" style={{ color: "var(--t3)", fontWeight: 500 }}>
                    {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="flex-1 truncate" style={{ color: "var(--t2)", fontWeight: 600 }}>
                    {(s.format || "").replace(/_/g, " ")}
                  </span>
                  <span className="w-20 truncate hidden sm:block" style={{ color: "var(--t3)" }}>{s.court}</span>
                  <span className="w-24 text-right shrink-0" style={{ color: "var(--t4)" }}>
                    {s.startTime}–{s.endTime}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
