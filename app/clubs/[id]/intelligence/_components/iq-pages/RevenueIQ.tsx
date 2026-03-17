'use client'
import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  CreditCard, PieChart as PieIcon, BarChart3, Zap, Target,
  CalendarDays, Users, Sparkles, AlertTriangle, Clock,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  ComposedChart,
} from "recharts";
import { useTheme } from "../IQThemeProvider";

/* --- Mock Data --- */
const monthlyRevenue = [
  { month: "Apr", bookings: 8200, events: 1400, lessons: 2800, merchandise: 600, total: 13000 },
  { month: "May", bookings: 8800, events: 1800, lessons: 3000, merchandise: 700, total: 14300 },
  { month: "Jun", bookings: 9400, events: 2200, lessons: 3200, merchandise: 650, total: 15450 },
  { month: "Jul", bookings: 8600, events: 1600, lessons: 2900, merchandise: 500, total: 13600 },
  { month: "Aug", bookings: 9200, events: 2000, lessons: 3100, merchandise: 800, total: 15100 },
  { month: "Sep", bookings: 8400, events: 1500, lessons: 2700, merchandise: 550, total: 13150 },
  { month: "Oct", bookings: 10200, events: 2400, lessons: 3400, merchandise: 900, total: 16900 },
  { month: "Nov", bookings: 10800, events: 2200, lessons: 3600, merchandise: 850, total: 17450 },
  { month: "Dec", bookings: 9800, events: 1900, lessons: 3300, merchandise: 750, total: 15750 },
  { month: "Jan", bookings: 11400, events: 2600, lessons: 3800, merchandise: 1000, total: 18800 },
  { month: "Feb", bookings: 11000, events: 2400, lessons: 3500, merchandise: 900, total: 17800 },
  { month: "Mar", bookings: 11800, events: 2800, lessons: 3900, merchandise: 950, total: 19450 },
];

const revenueBySource = [
  { name: "Court Bookings", value: 11800, pct: 61, color: "#8B5CF6" },
  { name: "Events", value: 2800, pct: 14, color: "#06B6D4" },
  { name: "Lessons & Clinics", value: 3900, pct: 20, color: "#10B981" },
  { name: "Merchandise", value: 950, pct: 5, color: "#F59E0B" },
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
  ...monthlyRevenue.slice(-3).map((m) => ({ month: m.month, actual: m.total, forecast: null, low: null, high: null })),
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

/* ============================================= */
/*              REVENUE PAGE                      */
/* ============================================= */
export function RevenueIQ() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const totalRevenue = 19450;
  const totalLost = lostRevenue.reduce((s, l) => s + l.amount, 0);
  const totalRecoverable = lostRevenue.reduce((s, l) => s + l.recoverable, 0);

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
        <div className="flex items-center gap-2">
          {(["month", "quarter", "year"] as const).map((p) => (
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

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Monthly Revenue", value: `$${(totalRevenue / 1000).toFixed(1)}K`, change: "+12.5%", up: true, icon: DollarSign, gradient: "from-emerald-500 to-green-500" },
          { label: "Lost Revenue", value: `$${(totalLost / 1000).toFixed(1)}K`, change: "-8.2%", up: true, icon: AlertTriangle, gradient: "from-red-500 to-orange-500" },
          { label: "Recoverable", value: `$${(totalRecoverable / 1000).toFixed(1)}K`, change: "AI estimated", up: true, icon: Sparkles, gradient: "from-violet-500 to-purple-600" },
          { label: "Rev per Member", value: "$153", change: "+6.3%", up: true, icon: Users, gradient: "from-cyan-500 to-teal-500" },
        ].map((kpi, i) => {
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

      {/* Revenue Trend + Breakdown */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Revenue Trend (12 months)</h3>
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { label: "Bookings", color: "#8B5CF6" },
                { label: "Events", color: "#06B6D4" },
                { label: "Lessons", color: "#10B981" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  <span style={{ color: "var(--t3)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyRevenue}>
              <defs>
                <linearGradient id="bookGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lessonGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="bookings" name="Bookings" stroke="#8B5CF6" fill="url(#bookGrad)" strokeWidth={2} stackId="1" />
              <Area type="monotone" dataKey="events" name="Events" stroke="#06B6D4" fill="url(#eventGrad)" strokeWidth={2} stackId="1" />
              <Area type="monotone" dataKey="lessons" name="Lessons" stroke="#10B981" fill="url(#lessonGrad)" strokeWidth={2} stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Breakdown Pie */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Revenue by Source</h3>
          <div className="flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={revenueBySource} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {revenueBySource.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-2">
            {revenueBySource.map((s) => (
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
            <ComposedChart data={dailyRevenue}>
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
            {lostRevenue.map((item) => (
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
            {pricingOpportunities.map((opp) => (
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
            <AreaChart data={fullForecast}>
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
    </motion.div>
  );
}
