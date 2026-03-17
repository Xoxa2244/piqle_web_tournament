'use client'
import { useState } from "react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import {
  Users, CalendarDays, DollarSign, TrendingUp, TrendingDown,
  Sparkles, ArrowUpRight, ArrowDownRight, Clock, Target,
  BarChart3, Zap, AlertTriangle, CheckCircle2, Brain,
  Upload, Heart, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { useTheme } from "../IQThemeProvider";

/* --- Mock Data --- */
const kpis = [
  { label: "Active Members", value: "127", change: "+8.2%", up: true, icon: Users, gradient: "from-violet-500 to-purple-600", sparkData: [40, 45, 42, 50, 48, 55, 58, 62, 60, 65, 68, 72] },
  { label: "Court Occupancy", value: "62%", change: "+3.1%", up: true, icon: Target, gradient: "from-cyan-500 to-teal-500", sparkData: [50, 52, 48, 55, 58, 60, 56, 62, 64, 60, 63, 62] },
  { label: "Monthly Revenue", value: "$18.4K", change: "+12.5%", up: true, icon: DollarSign, gradient: "from-emerald-500 to-green-500", sparkData: [12, 13, 11, 14, 15, 14, 16, 17, 16, 18, 17, 18.4] },
  { label: "Lost Revenue", value: "$4.2K", change: "-2.3%", up: false, icon: AlertTriangle, gradient: "from-red-500 to-orange-500", sparkData: [6, 5.5, 5.8, 5.2, 5, 4.8, 5, 4.6, 4.5, 4.4, 4.3, 4.2] },
];

const playerHealthDistribution = [
  { level: "Healthy", count: 72, pct: 57, color: "#10B981" },
  { level: "Watch", count: 25, pct: 20, color: "#F59E0B" },
  { level: "At-Risk", count: 18, pct: 14, color: "#F97316" },
  { level: "Critical", count: 12, pct: 9, color: "#EF4444" },
];

const healthMetrics = {
  improved: 23, improvedPct: 18.1,
  declined: 9, declinedPct: 7.1,
  avgScore: 68, avgScorePrev: 64,
  churnedThisPeriod: 5, churnedPrevPeriod: 8, churnChange: -37.5,
};

const occupancyHeatmap = [
  { day: "Mon", slots: [30, 45, 72, 85, 60, 40, 25] },
  { day: "Tue", slots: [25, 38, 65, 78, 55, 35, 20] },
  { day: "Wed", slots: [35, 50, 80, 90, 68, 45, 30] },
  { day: "Thu", slots: [28, 42, 70, 82, 58, 38, 22] },
  { day: "Fri", slots: [40, 55, 88, 95, 75, 55, 40] },
  { day: "Sat", slots: [60, 75, 92, 98, 85, 70, 55] },
  { day: "Sun", slots: [55, 68, 88, 92, 80, 62, 48] },
];
const heatmapTimes = ["6AM", "9AM", "12PM", "3PM", "6PM", "8PM", "10PM"];

const memberSegments = [
  { name: "Power Players", value: 35, color: "#8B5CF6" },
  { name: "Regular", value: 42, color: "#06B6D4" },
  { name: "Casual", value: 28, color: "#10B981" },
  { name: "At-Risk", value: 12, color: "#F59E0B" },
  { name: "Dormant", value: 10, color: "#EF4444" },
];

const dataUploadHistory = [
  { id: "u1", date: "Mar 15, 2026", records: 1247, quality: 98, status: "success" as const, source: "CourtReserve CSV", duration: "2.4s" },
  { id: "u2", date: "Mar 8, 2026", records: 1183, quality: 95, status: "success" as const, source: "CourtReserve CSV", duration: "2.1s" },
  { id: "u3", date: "Mar 1, 2026", records: 1156, quality: 92, status: "warning" as const, source: "Manual Upload", duration: "3.8s" },
  { id: "u4", date: "Feb 22, 2026", records: 1098, quality: 97, status: "success" as const, source: "CourtReserve CSV", duration: "1.9s" },
  { id: "u5", date: "Feb 15, 2026", records: 1042, quality: 88, status: "warning" as const, source: "Manual Upload", duration: "4.2s" },
];

const periodComparison = [
  { metric: "Total Revenue", current: 19450, previous: 17300, format: "currency" as const },
  { metric: "Active Members", current: 127, previous: 118, format: "number" as const },
  { metric: "Rev per Member", current: 153, previous: 147, format: "currency" as const },
  { metric: "Court Utilization", current: 74, previous: 68, format: "percent" as const },
  { metric: "Avg Health Score", current: 68, previous: 64, format: "number" as const },
  { metric: "Churn Rate", current: 3.9, previous: 5.2, format: "percent" as const },
];

const aiInsights = [
  { title: "Weekend Peak Optimization", desc: "Saturday 3-6PM is at 98% capacity. Consider adding overflow courts or waitlist pricing.", priority: "high", icon: TrendingUp },
  { title: "Tuesday Morning Gap", desc: "Only 38% occupancy Tue 9-12. Recommend a beginner clinic — 23 eligible members identified.", priority: "medium", icon: Target },
  { title: "Reactivation Opportunity", desc: "12 members haven't played in 30+ days. Personalized win-back campaign ready to launch.", priority: "medium", icon: Users },
];

/* --- Sparkline Mini Chart --- */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --- Card Wrapper --- */
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
  );
}

/* --- Heatmap Cell Color --- */
function heatColor(val: number, isDark: boolean): string {
  if (val >= 90) return isDark ? "rgba(239, 68, 68, 0.6)" : "rgba(239, 68, 68, 0.5)";
  if (val >= 75) return isDark ? "rgba(249, 115, 22, 0.5)" : "rgba(249, 115, 22, 0.4)";
  if (val >= 50) return isDark ? "rgba(139, 92, 246, 0.4)" : "rgba(139, 92, 246, 0.3)";
  if (val >= 25) return isDark ? "rgba(6, 182, 212, 0.3)" : "rgba(6, 182, 212, 0.25)";
  return isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
}

/* --- Custom Tooltip --- */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: "var(--tooltip-bg)",
        border: "1px solid var(--tooltip-border)",
        color: "var(--tooltip-color)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--t3)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === "number" && p.name.toLowerCase().includes("revenue") ? `$${p.value.toLocaleString()}` : p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* --- Format helper --- */
function formatValue(v: number, fmt: "currency" | "number" | "percent") {
  if (fmt === "currency") return `$${v.toLocaleString()}`;
  if (fmt === "percent") return `${v}%`;
  return v.toLocaleString();
}

/* ============================================= */
/*              DASHBOARD PAGE                    */
/* ============================================= */
export function DashboardIQ() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "custom">("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Welcome back, John. Here&apos;s your club overview.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["week", "month", "quarter", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-4 py-2 rounded-xl text-xs capitalize transition-all"
              style={{
                background: period === p ? "var(--pill-active)" : "transparent",
                color: period === p ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: period === p ? 600 : 500,
                border: period === p ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
              }}
            >
              {p}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 px-2 text-xs rounded-lg outline-none"
                style={{
                  background: "var(--subtle)",
                  border: "1px solid var(--card-border)",
                  color: "var(--t2)",
                  colorScheme: isDark ? "dark" : "light",
                }}
              />
              <span className="text-xs" style={{ color: "var(--t4)" }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 px-2 text-xs rounded-lg outline-none"
                style={{
                  background: "var(--subtle)",
                  border: "1px solid var(--card-border)",
                  color: "var(--t2)",
                  colorScheme: isDark ? "dark" : "light",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="relative overflow-hidden">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <Sparkline data={kpi.sparkData} color={kpi.up ? "#10B981" : "#EF4444"} />
                </div>
                <div className="mb-1" style={{ fontSize: "28px", fontWeight: 800, color: "var(--heading)" }}>{kpi.value}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--t3)" }}>{kpi.label}</span>
                  <div className={`flex items-center gap-1 text-xs ${kpi.up ? "text-emerald-400" : "text-red-400"}`} style={{ fontWeight: 600 }}>
                    {kpi.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {kpi.change}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Player Health Overview + AI Summary */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10B981, #06B6D4)" }}>
                <Heart className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>Player Health Overview</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>Member engagement &amp; retention health</p>
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.15)",
                color: "#10B981",
                fontWeight: 600,
              }}
            >
              Avg: {healthMetrics.avgScore} <span style={{ fontSize: "10px" }}>(+{healthMetrics.avgScore - healthMetrics.avgScorePrev})</span>
            </div>
          </div>

          {/* Mini metrics row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Improved", value: healthMetrics.improved, sub: `+${healthMetrics.improvedPct}%`, color: "#10B981" },
              { label: "Declined", value: healthMetrics.declined, sub: `${healthMetrics.declinedPct}%`, color: "#F97316" },
              { label: "Churned", value: healthMetrics.churnedThisPeriod, sub: `${healthMetrics.churnChange}%`, color: "#EF4444" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl p-3 text-center"
                style={{ background: "var(--subtle)" }}
              >
                <div className="text-lg" style={{ fontWeight: 700, color: "var(--heading)" }}>{m.value}</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{m.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: m.color, fontWeight: 600 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Health distribution bars */}
          <div className="space-y-3">
            {playerHealthDistribution.map((h, i) => (
              <div key={h.level} className="flex items-center gap-3">
                <div className="w-14 text-xs text-right shrink-0" style={{ color: "var(--t3)", fontWeight: 500 }}>{h.level}</div>
                <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ background: "var(--subtle)" }}>
                  <motion.div
                    className="h-full rounded-lg flex items-center px-2.5"
                    style={{ background: h.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${h.pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                  >
                    <span className="text-[10px] text-white" style={{ fontWeight: 600 }}>{h.count}</span>
                  </motion.div>
                </div>
                <div className="w-10 text-right text-xs" style={{ color: "var(--t3)", fontWeight: 600 }}>{h.pct}%</div>
              </div>
            ))}
          </div>
        </Card>

        {/* AI Weekly Summary */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>AI Weekly Summary</h3>
                <p className="text-[10px]" style={{ color: "var(--t4)" }}>Generated just now</p>
              </div>
            </div>

            <div className="space-y-4 text-sm" style={{ color: "var(--t2)", lineHeight: 1.7 }}>
              <p>
                <span style={{ fontWeight: 600, color: "var(--heading)" }}>Great week overall.</span>{" "}
                Revenue is up 12.5% vs last month, driven by strong weekend bookings and the Thursday mixer event.
              </p>
              <p>
                <span className="text-amber-400" style={{ fontWeight: 600 }}>Watch out:</span>{" "}
                Tuesday mornings are consistently under 40% occupancy. Consider a recurring beginner clinic — I&apos;ve identified 23 members who&apos;d be a good fit.
              </p>
              <p>
                <span className="text-emerald-400" style={{ fontWeight: 600 }}>Quick win:</span>{" "}
                12 dormant members haven&apos;t played in 30+ days. A reactivation campaign could recover ~$1,800/mo.
              </p>
            </div>

            <div className="mt-4 pt-4 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--divider)" }}>
              {aiInsights.map((insight) => (
                <div
                  key={insight.title}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-all hover:scale-105"
                  style={{
                    background: insight.priority === "high" ? "rgba(239,68,68,0.1)" : "rgba(139,92,246,0.1)",
                    border: `1px solid ${insight.priority === "high" ? "rgba(239,68,68,0.15)" : "rgba(139,92,246,0.15)"}`,
                    color: insight.priority === "high" ? "#F87171" : "#A78BFA",
                    fontWeight: 500,
                  }}
                >
                  <insight.icon className="w-3 h-3" />
                  {insight.title}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Heatmap + Segments + Data Uploads */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Occupancy Heatmap */}
        <Card className="lg:col-span-1">
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Occupancy Heatmap</h3>
          <div className="space-y-1.5">
            <div className="flex gap-1.5 pl-10">
              {heatmapTimes.map((t) => (
                <div key={t} className="flex-1 text-center text-[9px]" style={{ color: "var(--t4)" }}>{t}</div>
              ))}
            </div>
            {occupancyHeatmap.map((row) => (
              <div key={row.day} className="flex items-center gap-1.5">
                <div className="w-8 text-right text-[10px] shrink-0" style={{ color: "var(--t3)", fontWeight: 500 }}>{row.day}</div>
                {row.slots.map((val, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-md flex items-center justify-center text-[9px] cursor-pointer"
                    style={{
                      height: 28,
                      background: heatColor(val, isDark),
                      color: val >= 75 ? "rgba(255,255,255,0.8)" : "var(--t4)",
                      fontWeight: val >= 75 ? 600 : 400,
                    }}
                    whileHover={{ scale: 1.15, zIndex: 10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    {val}%
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 mt-4 text-[9px]" style={{ color: "var(--t4)" }}>
            {[
              { label: "Low", bg: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
              { label: "Med", bg: isDark ? "rgba(6,182,212,0.3)" : "rgba(6,182,212,0.25)" },
              { label: "High", bg: isDark ? "rgba(139,92,246,0.4)" : "rgba(139,92,246,0.3)" },
              { label: "Peak", bg: isDark ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.5)" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: l.bg }} />
                {l.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Member Segments */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Member Segments</h3>
          <div className="flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={memberSegments}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {memberSegments.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {memberSegments.map((seg) => (
              <div key={seg.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
                  <span style={{ color: "var(--t2)" }}>{seg.name}</span>
                </div>
                <span style={{ color: "var(--t1)", fontWeight: 600 }}>{seg.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Data Upload History */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4" style={{ color: "var(--t3)" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Data Uploads</h3>
          </div>
          <div className="space-y-2.5">
            {dataUploadHistory.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ background: "var(--subtle)" }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: u.status === "success" ? "#10B981" : "#F59E0B" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color: "var(--t1)", fontWeight: 500 }}>{u.source}</p>
                  <p className="text-[10px]" style={{ color: "var(--t4)" }}>{u.date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px]" style={{ color: "var(--t2)", fontWeight: 600 }}>{u.records.toLocaleString()} rows</p>
                  <p className="text-[10px]" style={{ color: u.quality >= 95 ? "#10B981" : "#F59E0B", fontWeight: 500 }}>{u.quality}% quality</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* Period Comparison */}
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>Period Comparison</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>Current vs previous period</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {periodComparison.map((row) => {
            const rawDelta = row.previous === 0 ? 0 : ((row.current - row.previous) / row.previous) * 100;
            const delta = Math.round(rawDelta * 10) / 10;
            const isChurn = row.metric === "Churn Rate";
            const isPositive = isChurn ? delta < 0 : delta > 0;
            return (
              <div
                key={row.metric}
                className="rounded-xl p-4"
                style={{ background: "var(--subtle)" }}
              >
                <div className="text-[11px] mb-2" style={{ color: "var(--t3)", fontWeight: 500 }}>{row.metric}</div>
                <div className="flex items-end justify-between">
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--heading)" }}>
                      {formatValue(row.current, row.format)}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>
                      was {formatValue(row.previous, row.format)}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-0.5 text-xs px-2 py-1 rounded-md"
                    style={{
                      background: isPositive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      color: isPositive ? "#10B981" : "#EF4444",
                      fontWeight: 600,
                    }}
                  >
                    {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {delta > 0 ? "+" : ""}{delta}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
}
