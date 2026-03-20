'use client'
import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  CreditCard, PieChart as PieIcon, BarChart3, Zap, Target,
  CalendarDays, Users, Sparkles, AlertTriangle, Clock, Upload, Activity, Heart,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  ComposedChart,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EmptyStateIQ } from "./EmptyStateIQ";

/* --- Mock Data --- */
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

const revenueByFormat = [
  { name: "Open Play", value: 5800, pct: 30, color: "#8B5CF6" },
  { name: "League Match", value: 4200, pct: 22, color: "#06B6D4" },
  { name: "Private Lesson", value: 3600, pct: 18, color: "#10B981" },
  { name: "Clinic", value: 2900, pct: 15, color: "#F59E0B" },
  { name: "Tournament", value: 1950, pct: 10, color: "#EC4899" },
  { name: "Round Robin", value: 1000, pct: 5, color: "#F97316" },
];

const dailyRevenue = [
  { day: "Mon", revenue: 2100, target: 2500 },
  { day: "Tue", revenue: 1600, target: 2500 },
  { day: "Wed", revenue: 2800, target: 2500 },
  { day: "Thu", revenue: 2400, target: 2500 },
  { day: "Fri", revenue: 3200, target: 2500 },
  { day: "Sat", revenue: 4100, target: 3000 },
  { day: "Sun", revenue: 3200, target: 3000 },
];

const lostRevenue = [
  { category: "Empty Court Slots", amount: 2400, pct: 57, recoverable: 1800 },
  { category: "Cancelled Sessions", amount: 860, pct: 20, recoverable: 520 },
  { category: "Underpriced Peak", amount: 580, pct: 14, recoverable: 580 },
  { category: "No-Shows", amount: 380, pct: 9, recoverable: 280 },
];

const pricingOpportunities = [
  { slot: "Saturday 3-6 PM", current: 25, suggested: 32, demand: "Very High", impact: "+$840/mo", confidence: 94 },
  { slot: "Sunday 10AM-1PM", current: 25, suggested: 30, demand: "High", impact: "+$480/mo", confidence: 88 },
  { slot: "Friday 5-8 PM", current: 22, suggested: 28, demand: "High", impact: "+$540/mo", confidence: 85 },
  { slot: "Tuesday 9-12 AM", current: 20, suggested: 15, demand: "Low", impact: "+$320/mo*", confidence: 78 },
];

const forecastData = [
  { month: "Apr", actual: null, forecast: 20100, low: 18500, high: 21700 },
  { month: "May", actual: null, forecast: 21400, low: 19200, high: 23600 },
  { month: "Jun", actual: null, forecast: 22800, low: 20000, high: 25600 },
];

const fullForecast = [
  { month: "Jan", actual: 18800, forecast: null, low: null, high: null },
  { month: "Feb", actual: 17800, forecast: null, low: null, high: null },
  { month: "Mar", actual: 19450, forecast: null, low: null, high: null },
  ...forecastData,
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", color: "var(--tooltip-color)", backdropFilter: "blur(12px)" }}>
      <div className="mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span style={{ color: "var(--t3)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

type RevPeriod = "month" | "quarter" | "year" | "custom";

function getRevPeriodLabel(p: RevPeriod): { current: string; previous: string } {
  if (p === "month") return { current: "March 2026", previous: "February 2026" };
  if (p === "quarter") return { current: "Q1 2026", previous: "Q4 2025" };
  if (p === "year") return { current: "2025", previous: "2024" };
  return { current: "Selected range", previous: "Previous range" };
}

/* ============================================= */
/*              REVENUE PAGE                      */
/* ============================================= */
export function RevenueIQ({ revenueData, dashboardData, pricingData, forecastData: forecastProp, isLoading: externalLoading, clubId }: { revenueData?: any; dashboardData?: any; pricingData?: any; forecastData?: any; isLoading?: boolean; clubId?: string } = {}) {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<RevPeriod>("year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const isDemo = typeof window !== 'undefined' && (window.location.search.includes('demo=true') || window.location.hostname === 'demo.iqsport.ai');

  // Use real data when available, mocks only in demo mode
  const displayRevenueByFormat = revenueData?.revenueByFormat?.length
    ? revenueData.revenueByFormat.map((f: any) => ({ name: f.format, value: f.revenue, pct: f.pct, color: ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899"][revenueData.revenueByFormat.indexOf(f) % 6] }))
    : (isDemo ? revenueByFormat : []);
  const displayDailyRevenue = revenueData?.dailyRevenue?.length
    ? revenueData.dailyRevenue.slice(-7).map((d: any) => ({ day: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }), revenue: d.revenue, target: Math.round(d.revenue * 1.15) }))
    : (isDemo ? dailyRevenue : []);
  const displayLostRevenue = revenueData?.lostRevenue
    ? [
        { category: "Empty Slots", amount: revenueData.lostRevenue.emptySlots, pct: 0, recoverable: Math.round(revenueData.lostRevenue.emptySlots * 0.6) },
        { category: "Cancelled", amount: revenueData.lostRevenue.cancelled, pct: 0, recoverable: Math.round(revenueData.lostRevenue.cancelled * 0.3) },
        { category: "No-Shows", amount: revenueData.lostRevenue.noShows, pct: 0, recoverable: Math.round(revenueData.lostRevenue.noShows * 0.5) },
      ].map(l => ({ ...l, pct: revenueData.lostRevenue.total > 0 ? Math.round((l.amount / revenueData.lostRevenue.total) * 100) : 0 }))
    : (isDemo ? lostRevenue : []);

  const totalRevenue = revenueData?.totalRevenue ?? (isDemo ? 19450 : 0);
  const totalLost = displayLostRevenue.reduce((s: number, l: any) => s + l.amount, 0);
  const totalRecoverable = displayLostRevenue.reduce((s: number, l: any) => s + l.recoverable, 0);

  // Health distribution from dashboard data
  const displayHealthDistribution = dashboardData?.metrics
    ? [
        { level: "Healthy", count: Math.round(revenueData?.activeMembers * 0.57 || 72), pct: 57, color: "#10B981" },
        { level: "Watch", count: Math.round(revenueData?.activeMembers * 0.2 || 25), pct: 20, color: "#F59E0B" },
        { level: "At-Risk", count: Math.round(revenueData?.activeMembers * 0.14 || 18), pct: 14, color: "#F97316" },
        { level: "Critical", count: Math.round(revenueData?.activeMembers * 0.09 || 12), pct: 9, color: "#EF4444" },
      ]
    : (isDemo ? playerHealthDistribution : []);

  // Period comparison from revenue data (values must be numbers for delta calc)
  const displayPeriodComparison = revenueData
    ? [
        { metric: "Total Revenue", current: revenueData.totalRevenue, previous: revenueData.prevTotalRevenue || 1, format: "currency" },
        { metric: "Active Members", current: revenueData.activeMembers, previous: revenueData.prevActiveMembers || 1, format: "number" },
        { metric: "Rev/Member", current: revenueData.activeMembers > 0 ? Math.round(revenueData.totalRevenue / revenueData.activeMembers) : 0, previous: revenueData.prevActiveMembers > 0 ? Math.round(revenueData.prevTotalRevenue / revenueData.prevActiveMembers) : 1, format: "currency" },
        { metric: "Court Utilization", current: revenueData.avgOccupancy, previous: revenueData.avgOccupancy, format: "percent" },
        { metric: "Total Sessions", current: revenueData.totalSessions, previous: revenueData.prevTotalSessions || 1, format: "number" },
        { metric: "Lost Revenue", current: revenueData.lostRevenue?.total || 0, previous: 1, format: "currency" },
      ]
    : (isDemo ? periodComparison : []);

  // Pricing opportunities from real endpoint
  const displayPricingOpportunities = pricingData?.opportunities?.length
    ? pricingData.opportunities
    : (isDemo ? pricingOpportunities : []);

  // Revenue forecast from real endpoint
  const displayFullForecast = forecastProp?.actual?.length
    ? [
        ...forecastProp.actual.map((a: any) => ({ month: a.month, actual: a.actual })),
        ...forecastProp.forecast.map((f: any) => ({ month: f.month, forecast: f.forecast, low: f.low, high: f.high })),
      ]
    : (isDemo ? fullForecast : []);

  const hasData = displayRevenueByFormat.length > 0;
  if (!hasData && !isDemo && !externalLoading) {
    return <EmptyStateIQ icon={DollarSign} title="No revenue data yet" description="Import session data with pricing to unlock revenue analytics, forecasts, and pricing optimization." ctaLabel="Import Data" ctaHref={clubId ? `/clubs/${clubId}/intelligence` : undefined} />;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Revenue Intelligence</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Track every dollar. AI-powered pricing & forecasting.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["month", "quarter", "year", "custom"] as const).map((p) => (
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
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs outline-none"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--t2)",
                  colorScheme: isDark ? "dark" : "light",
                }}
              />
              <span className="text-[11px]" style={{ color: "var(--t4)" }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs outline-none"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--t2)",
                  colorScheme: isDark ? "dark" : "light",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const activeMembers = revenueData?.activeMembers || 0;
          const revPerMember = activeMembers > 0 ? Math.round(totalRevenue / activeMembers) : 0;
          const prevRevPerMember = revenueData?.prevActiveMembers > 0 && revenueData?.prevTotalRevenue ? Math.round(revenueData.prevTotalRevenue / revenueData.prevActiveMembers) : 0;
          const revPerMemberChange = prevRevPerMember > 0 ? ((revPerMember - prevRevPerMember) / prevRevPerMember * 100).toFixed(1) : null;
          const prevTotalRevenue = revenueData?.prevTotalRevenue || 0;
          const revenueChange = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1) : null;
          return [
            { label: "Monthly Revenue", value: `$${(totalRevenue / 1000).toFixed(1)}K`, change: revenueChange ? `${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%` : "—", up: revenueChange ? Number(revenueChange) >= 0 : true, icon: DollarSign, gradient: "from-emerald-500 to-green-500" },
            { label: "Lost Revenue", value: `$${(totalLost / 1000).toFixed(1)}K`, change: "Current period", up: true, icon: AlertTriangle, gradient: "from-red-500 to-orange-500" },
            { label: "Recoverable", value: `$${(totalRecoverable / 1000).toFixed(1)}K`, change: "AI estimated", up: true, icon: Sparkles, gradient: "from-violet-500 to-purple-600" },
            { label: "Rev per Member", value: activeMembers > 0 ? `$${revPerMember}` : "—", change: revPerMemberChange ? `${Number(revPerMemberChange) >= 0 ? '+' : ''}${revPerMemberChange}%` : "—", up: revPerMemberChange ? Number(revPerMemberChange) >= 0 : true, icon: Users, gradient: "from-cyan-500 to-teal-500" },
          ];
        })().map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--heading)" }}>{kpi.value}</div>
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>{kpi.label}</div>
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-[11px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`} style={{ fontWeight: 600 }}>
                  {kpi.label !== "Recoverable" && (kpi.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />)}
                  {kpi.label === "Recoverable" && <Sparkles className="w-3.5 h-3.5 text-violet-400" />}
                  <span style={{ color: kpi.label === "Recoverable" ? "var(--t3)" : undefined }}>{kpi.change}</span>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Player Health + Breakdown */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-emerald-400" />
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Player Health Overview</h3>
            </div>
            {isDemo && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <span className="text-[11px]" style={{ color: "var(--t3)" }}>Avg:</span>
              <span className="text-xs text-emerald-400" style={{ fontWeight: 700 }}>{healthMetrics.avgScore}</span>
              <span className="text-[10px] text-emerald-400" style={{ fontWeight: 600 }}>(+{healthMetrics.avgScore - healthMetrics.avgScorePrev})</span>
            </div>
            )}
          </div>

          {/* Mini metrics row */}
          {isDemo && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Improved", value: healthMetrics.improved, sub: `+${healthMetrics.improvedPct}%`, color: "#10B981" },
              { label: "Declined", value: healthMetrics.declined, sub: `${healthMetrics.declinedPct}%`, color: "#EF4444" },
              { label: "Churned", value: healthMetrics.churnedThisPeriod, sub: `${healthMetrics.churnChange}% vs prev`, color: "#F59E0B" },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--t4)" }}>{m.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--heading)" }}>{m.value}</span>
                  <span className="text-[10px]" style={{ color: m.color, fontWeight: 600 }}>{m.sub}</span>
                </div>
              </div>
            ))}
          </div>
          )}

          {/* Health distribution bars */}
          <div className="space-y-3">
            {displayHealthDistribution.map((level) => (
              <div key={level.level}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: level.color }} />
                    <span className="text-xs" style={{ color: "var(--t2)", fontWeight: 500 }}>{level.level}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>{level.count}</span>
                    <span className="text-[10px]" style={{ color: "var(--t4)" }}>{level.pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: level.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${level.pct}%` }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue by Format */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Revenue by Format</h3>
          <div className="flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={displayRevenueByFormat} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {displayRevenueByFormat.map((e: any) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-2">
            {displayRevenueByFormat.map((s: any) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs" style={{ color: "var(--t2)" }}>{s.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>${s.value.toLocaleString()}</span>
                  <span className="text-[10px]" style={{ color: "var(--t4)" }}>{s.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Daily Revenue + Lost Revenue */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Daily */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Daily Revenue vs Target</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={displayDailyRevenue}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="target" name="Target" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* Lost Revenue */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Lost Revenue Breakdown</h3>
            <div className="text-right">
              <div className="text-red-400" style={{ fontSize: "18px", fontWeight: 800 }}>${totalLost.toLocaleString()}</div>
              <div className="text-[10px]" style={{ color: "var(--t4)" }}>this month</div>
            </div>
          </div>
          <div className="space-y-4">
            {displayLostRevenue.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: "var(--t2)", fontWeight: 500 }}>{item.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-red-400" style={{ fontWeight: 600 }}>${item.amount.toLocaleString()}</span>
                    <span className="text-[10px] text-emerald-400" style={{ fontWeight: 500 }}>{"\u2192"} ${item.recoverable.toLocaleString()} recoverable</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                  <div className="h-full rounded-full flex">
                    <motion.div
                      className="h-full"
                      style={{ background: "#EF4444", width: `${item.pct}%`, borderRadius: "9999px 0 0 9999px" }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.pct}%` }}
                      transition={{ duration: 0.8 }}
                      viewport={{ once: true }}
                    />
                    <motion.div
                      className="h-full"
                      style={{
                        background: "#10B981",
                        width: `${(item.recoverable / totalLost) * 100}%`,
                        opacity: 0.5,
                        borderRadius: "0 9999px 9999px 0",
                      }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(item.recoverable / totalLost) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      viewport={{ once: true }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Dynamic Pricing + Forecast */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Dynamic Pricing */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>AI Dynamic Pricing Suggestions</h3>
          </div>
          <div className="space-y-3">
            {displayPricingOpportunities.map((opp: any) => (
              <div
                key={opp.slot}
                className="p-3 rounded-xl"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs" style={{ color: "var(--heading)", fontWeight: 600 }}>{opp.slot}</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{
                      background: opp.demand === "Very High" ? "rgba(239,68,68,0.1)" : opp.demand === "High" ? "rgba(249,115,22,0.1)" : "rgba(6,182,212,0.1)",
                      color: opp.demand === "Very High" ? "#F87171" : opp.demand === "High" ? "#FB923C" : "#22D3EE",
                      fontWeight: 600,
                    }}>
                      {opp.demand} demand
                    </span>
                  </div>
                  <span className="text-xs text-emerald-400" style={{ fontWeight: 700 }}>{opp.impact}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--t4)" }}>Current:</span>
                    <span className="text-xs" style={{ color: "var(--t2)", fontWeight: 600 }}>${opp.current}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="flex-1 h-1 rounded-full" style={{ background: "var(--subtle)" }}>
                      <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)", width: `${opp.confidence}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--t4)" }}>Suggested:</span>
                    <span className="text-xs" style={{ color: opp.suggested > opp.current ? "#10B981" : "#06B6D4", fontWeight: 700 }}>
                      ${opp.suggested}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--t4)" }}>
                  AI confidence: {opp.confidence}%
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue Forecast */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>AI Revenue Forecast</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={displayFullForecast}>
              <defs>
                <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="high" name="High Estimate" stroke="transparent" fill="url(#rangeGrad)" />
              <Area type="monotone" dataKey="low" name="Low Estimate" stroke="transparent" fill="transparent" />
              <Area type="monotone" dataKey="actual" name="Actual" stroke="#10B981" fill="none" strokeWidth={2} connectNulls={false} />
              <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#06B6D4" fill="url(#foreGrad)" strokeWidth={2} strokeDasharray="6 3" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 text-[10px]">
            {[
              { label: "Actual", color: "#10B981", dash: false },
              { label: "Forecast", color: "#06B6D4", dash: true },
              { label: "Range", color: "#8B5CF6", dash: false },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 rounded" style={{ background: l.color, opacity: l.label === "Range" ? 0.3 : 1 }} />
                <span style={{ color: "var(--t3)" }}>{l.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.1)" }}>
            <div className="flex items-start gap-2 text-xs" style={{ color: "var(--t2)", lineHeight: 1.6 }}>
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong style={{ color: "var(--heading)" }}>AI Forecast:</strong> Based on current trends, you&apos;re projected to hit <strong className="text-emerald-400">$22.8K</strong> by June. Implementing pricing suggestions could push this to <strong className="text-cyan-400">$25.6K</strong>.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Data Upload History + Period Comparison */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Data Upload History */}
        {isDemo && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4" style={{ color: "var(--t3)" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Data Upload History</h3>
          </div>
          <div className="space-y-2">
            {dataUploadHistory.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
              >
                <div>
                  <div className="text-xs" style={{ color: "var(--heading)", fontWeight: 600 }}>{upload.source}</div>
                  <div className="text-[10px]" style={{ color: "var(--t4)" }}>{upload.date} · {upload.duration}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs" style={{ color: "var(--t2)", fontWeight: 600 }}>{upload.records.toLocaleString()} records</div>
                    <div className="text-[10px]" style={{ color: "var(--t4)" }}>Quality: {upload.quality}%</div>
                  </div>
                  <div className="w-2 h-2 rounded-full" style={{ background: upload.status === "success" ? "#10B981" : "#F59E0B" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        )}

        {/* Period Comparison */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: "var(--t3)" }} />
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Period Comparison</h3>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>
                  <span style={{ color: "var(--t2)", fontWeight: 500 }}>{getRevPeriodLabel(period).current}</span>
                  {" vs "}
                  <span>{getRevPeriodLabel(period).previous}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {displayPeriodComparison.map((item) => {
              const delta = ((item.current - item.previous) / item.previous) * 100;
              const isPositive = item.metric === "Churn Rate" ? delta < 0 : delta > 0;
              return (
                <div key={item.metric} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--t2)" }}>{item.metric}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>
                      {item.format === "currency" ? `$${item.current.toLocaleString()}` : item.format === "percent" ? `${item.current}%` : item.current.toLocaleString()}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--t4)" }}>
                      was {item.format === "currency" ? `$${item.previous.toLocaleString()}` : item.format === "percent" ? `${item.previous}%` : item.previous.toLocaleString()}
                    </span>
                    <span className={`text-[10px] flex items-center gap-0.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`} style={{ fontWeight: 600 }}>
                      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
