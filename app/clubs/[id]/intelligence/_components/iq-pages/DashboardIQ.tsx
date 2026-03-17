'use client'
import { useState } from "react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import {
  Users, CalendarDays, DollarSign, TrendingUp, TrendingDown,
  Sparkles, ArrowUpRight, ArrowDownRight, Clock, Target,
  BarChart3, Zap, AlertTriangle, CheckCircle2, Brain,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useTheme } from "../IQThemeProvider";

/* --- Mock Data --- */
const kpis = [
  { label: "Active Members", value: "127", change: "+8.2%", up: true, icon: Users, gradient: "from-violet-500 to-purple-600", sparkData: [40, 45, 42, 50, 48, 55, 58, 62, 60, 65, 68, 72] },
  { label: "Court Occupancy", value: "62%", change: "+3.1%", up: true, icon: Target, gradient: "from-cyan-500 to-teal-500", sparkData: [50, 52, 48, 55, 58, 60, 56, 62, 64, 60, 63, 62] },
  { label: "Monthly Revenue", value: "$18.4K", change: "+12.5%", up: true, icon: DollarSign, gradient: "from-emerald-500 to-green-500", sparkData: [12, 13, 11, 14, 15, 14, 16, 17, 16, 18, 17, 18.4] },
  { label: "Lost Revenue", value: "$4.2K", change: "-2.3%", up: false, icon: AlertTriangle, gradient: "from-red-500 to-orange-500", sparkData: [6, 5.5, 5.8, 5.2, 5, 4.8, 5, 4.6, 4.5, 4.4, 4.3, 4.2] },
];

const revenueData = [
  { month: "Jul", revenue: 12400, bookings: 620, events: 1800 },
  { month: "Aug", revenue: 13200, bookings: 680, events: 2100 },
  { month: "Sep", revenue: 11800, bookings: 590, events: 1600 },
  { month: "Oct", revenue: 14500, bookings: 720, events: 2400 },
  { month: "Nov", revenue: 15200, bookings: 760, events: 2200 },
  { month: "Dec", revenue: 13800, bookings: 690, events: 1900 },
  { month: "Jan", revenue: 16100, bookings: 800, events: 2600 },
  { month: "Feb", revenue: 17200, bookings: 860, events: 2800 },
  { month: "Mar", revenue: 18400, bookings: 920, events: 3100 },
];

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

const recentActivities = [
  { type: "booking", text: "Court 3 booked by Sarah M.", time: "2 min ago", icon: CalendarDays, color: "text-cyan-400" },
  { type: "ai", text: "AI filled 2 empty slots for tomorrow", time: "15 min ago", icon: Sparkles, color: "text-violet-400" },
  { type: "member", text: "New member: Jake Rodriguez", time: "1 hr ago", icon: Users, color: "text-emerald-400" },
  { type: "revenue", text: "Event revenue: $420 from mixer", time: "2 hr ago", icon: DollarSign, color: "text-green-400" },
  { type: "alert", text: "3 members at churn risk", time: "3 hr ago", icon: AlertTriangle, color: "text-amber-400" },
  { type: "ai", text: "Campaign sent to 28 members", time: "5 hr ago", icon: Zap, color: "text-violet-400" },
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

/* ============================================= */
/*              DASHBOARD PAGE                    */
/* ============================================= */
export function DashboardIQ() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Welcome back, John. Here&apos;s your club overview.</p>
        </div>
        <div className="flex items-center gap-2">
          {(["week", "month", "quarter"] as const).map((p) => (
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

      {/* Revenue Chart + AI Summary */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>Revenue Trend</h3>
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Monthly breakdown by source</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {[
                { label: "Bookings", color: "#8B5CF6" },
                { label: "Events", color: "#06B6D4" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span style={{ color: "var(--t3)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Bookings Revenue" stroke="#8B5CF6" fill="url(#revGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="events" name="Events Revenue" stroke="#06B6D4" fill="url(#evGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
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

      {/* Heatmap + Segments + Activity */}
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

        {/* Recent Activity */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-3 p-2.5 rounded-xl transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--subtle)" }}>
                    <Icon className={`w-4 h-4 ${a.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "var(--t1)", fontWeight: 500 }}>{a.text}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" style={{ color: "var(--t4)" }} />
                      <span className="text-[10px]" style={{ color: "var(--t4)" }}>{a.time}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
