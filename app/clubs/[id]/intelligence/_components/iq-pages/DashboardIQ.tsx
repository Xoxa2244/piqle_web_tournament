'use client'
import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion, useInView, AnimatePresence } from "motion/react";
import { useRef } from "react";
import {
  Users, CalendarDays, DollarSign, TrendingUp, TrendingDown,
  Sparkles, ArrowUpRight, ArrowDownRight, Clock, Target,
  BarChart3, Zap, AlertTriangle, CheckCircle2, Brain,
  Upload, Heart, Activity, UserPlus, MapPin, Calendar,
} from "lucide-react";
import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { useParams, useRouter } from "next/navigation";
import { IQFileDropZone } from "./IQFileDropZone";
import { AILoadingAnimation } from "./AILoadingAnimation";
import { MonthCalendar } from "../MonthCalendar";
import { X, Check, ChevronRight, FileSpreadsheet, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CourtReserveConnector } from "./shared/CourtReserveConnector";
import { AIRevenueTile } from "../ai-revenue-tile";
import { mockClubInsights } from "../../_data/mock";

type ExcelFileSlot = { type: 'members' | 'reservations' | 'events'; name: string; rows: Record<string, any>[] }

function ExcelSlot({ label, description, file, onFile, isDark }: {
  label: string; description: string; file: ExcelFileSlot | null;
  onFile: (f: ExcelFileSlot | null) => void; isDark: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const type = description.includes('Member') ? 'members' : description.includes('Reservation') ? 'reservations' : 'events'

  const handleFile = async (raw: File) => {
    const XLSX = await import('xlsx')
    const arrayBuffer = await raw.arrayBuffer()
    const wb = XLSX.read(arrayBuffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]
    onFile({ type, name: raw.name, rows })
  }

  if (file) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.3)' }}>
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--heading)' }}>{file.name}</p>
          <p className="text-xs" style={{ color: 'var(--t4)' }}>{label}</p>
        </div>
        <button onClick={() => onFile(null as any)} className="p-1 rounded" style={{ color: 'var(--t4)' }}>
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-3 cursor-pointer transition-all"
      style={{ background: dragOver ? (isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)') : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'), border: dragOver ? '2px solid rgba(139,92,246,0.5)' : '1px dashed var(--card-border)' }}
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
    >
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="w-4 h-4 shrink-0" style={{ color: isDark ? '#A78BFA' : '#7C3AED' }} />
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--heading)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--t4)' }}>{description}</p>
        </div>
        <Upload className="w-3.5 h-3.5 shrink-0 ml-auto" style={{ color: 'var(--t4)' }} />
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
    </div>
  )
}

/* --- Period-dependent Mock Data --- */
type Period = "week" | "month" | "quarter" | "custom";

/** Safety net: auto-fires onComplete after 3s if animation callback didn't fire */
function SafetyAutoComplete({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      console.log('[Import] Safety auto-complete fired (animation callback missed)')
      onComplete()
    }, 3000)
    return () => clearTimeout(t)
  }, [onComplete])
  return null
}

function getPeriodLabel(p: Period): { current: string; previous: string } {
  if (p === "week") return { current: "Mar 10 – 17", previous: "Mar 3 – 10" };
  if (p === "month") return { current: "March 2026", previous: "February 2026" };
  if (p === "quarter") return { current: "Q1 2026", previous: "Q4 2025" };
  return { current: "Selected range", previous: "Previous range" };
}

type KpiItem = { label: string; value: string; change: string; up: boolean; icon: any; gradient: string; sparkData: number[]; href: string };

const emptyHealth = [
  { level: "Healthy", count: 0, pct: 0, color: "#10B981" },
  { level: "Watch", count: 0, pct: 0, color: "#F59E0B" },
  { level: "At-Risk", count: 0, pct: 0, color: "#F97316" },
  { level: "Critical", count: 0, pct: 0, color: "#EF4444" },
];
const emptyHealthMetrics = { improved: 0, improvedPct: 0, declined: 0, declinedPct: 0, avgScore: 0, avgScorePrev: 0, churnedThisPeriod: 0, churnChange: 0 };
const emptyComparison: { metric: string; current: number; previous: number; format: "currency" | "number" | "percent" }[] = [];





type AiInsight = { title: string; desc: string; priority: string; icon: any };
function generateInsights(dashboardData: any, healthData: any, heatmapData: any, goals?: string[]): AiInsight[] {
  const insights: AiInsight[] = [];
  // 1. Find peak slots from heatmap
  if (heatmapData?.heatmap) {
    let peakSlot = { day: '', time: '', value: 0 };
    let lowSlot = { day: '', time: '', value: 100 };
    heatmapData.heatmap.forEach((row: any) => {
      row.slots?.forEach((slot: any) => {
        if (slot.value > peakSlot.value) peakSlot = { day: row.day, time: slot.time, value: slot.value };
        if (slot.value > 0 && slot.value < lowSlot.value) lowSlot = { day: row.day, time: slot.time, value: slot.value };
      });
    });
    if (peakSlot.value > 80) {
      insights.push({ title: "Peak Hour Detected", desc: `${peakSlot.day} ${peakSlot.time} is at ${peakSlot.value}% capacity. Consider adding a session or raising price.`, priority: "high", icon: TrendingUp });
    }
    if (lowSlot.value < 40 && lowSlot.value > 0) {
      insights.push({ title: "Low Demand Slot", desc: `${lowSlot.day} ${lowSlot.time} is only ${lowSlot.value}% full. Try moving to peak hours or send targeted invites.`, priority: "medium", icon: Target });
    }
  }
  // 2. At-risk members
  if (healthData?.summary) {
    const total = (healthData.summary.healthy || 0) + (healthData.summary.watch || 0) + (healthData.summary.atRisk || 0) + (healthData.summary.critical || 0);
    const atRiskPct = total > 0 ? Math.round(((healthData.summary.atRisk || 0) + (healthData.summary.critical || 0)) / total * 100) : 0;
    if (atRiskPct > 10) {
      insights.push({ title: "Reactivation Opportunity", desc: `${(healthData.summary.atRisk || 0) + (healthData.summary.critical || 0)} members at risk (${atRiskPct}%). Launch a personalized win-back campaign.`, priority: "high", icon: Users });
    }
  }
  // 3. Lost revenue
  if (dashboardData?.metrics?.lostRevenue) {
    const lost = dashboardData.metrics.lostRevenue;
    if (lost.value && typeof lost.value === 'string' && parseInt(lost.value.replace(/[^0-9]/g, '')) > 500) {
      insights.push({ title: "Revenue Recovery", desc: `You're losing ${lost.value} from empty slots. Slot Filler can recover up to 60% of this.`, priority: "medium", icon: DollarSign });
    }
  }

  // 4. Goal-specific insights
  if (goals?.length) {
    const occVal = dashboardData?.metrics?.occupancy?.value;
    const occNum = parseInt(String(occVal || '0').replace('%', '')) || 0;
    const atRisk = (healthData?.summary?.atRisk || 0) + (healthData?.summary?.critical || 0);

    if (goals.includes('fill_sessions') && occNum < 70 && !insights.some(i => i.title === "Low Demand Slot")) {
      insights.push({ title: "Fill Empty Slots", desc: `Occupancy is ${occNum}% — below your 70% target. Use Slot Filler to send targeted invites and fill open sessions.`, priority: "high", icon: Target });
    }
    if (goals.includes('improve_retention') && atRisk > 0 && !insights.some(i => i.title === "Reactivation Opportunity")) {
      insights.push({ title: "Re-engagement Opportunity", desc: `${atRisk} members show reduced activity recently. A reactivation campaign could help bring them back.`, priority: "high", icon: Heart });
    }
    if (goals.includes('increase_revenue')) {
      const lostVal = dashboardData?.metrics?.lostRevenue?.value;
      const lostNum = lostVal ? parseInt(String(lostVal).replace(/[^0-9]/g, '')) : 0;
      if (lostNum > 0 && !insights.some(i => i.title === "Revenue Recovery")) {
        insights.push({ title: "Revenue Opportunity", desc: `${lostVal} in potential revenue is being left on the table. Dynamic pricing and targeted promotions can help capture it.`, priority: "medium", icon: DollarSign });
      }
    }
    if (goals.includes('reduce_no_shows')) {
      insights.push({ title: "No-Show Prevention", desc: `Enable automated reminders 24h and 2h before sessions to reduce no-shows and protect your revenue.`, priority: "medium", icon: Clock });
    }
    if (goals.includes('grow_membership')) {
      const totalMembers = healthData?.summary ? (healthData.summary.healthy + healthData.summary.watch + healthData.summary.atRisk + healthData.summary.critical) : 0;
      if (totalMembers > 0) {
        insights.push({ title: "Growth Opportunity", desc: `You have ${totalMembers} active members. Referral incentives and trial session offers can accelerate growth.`, priority: "medium", icon: Users });
      }
    }
  }

  return insights.slice(0, 4);
}

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
  if (val >= 90) return isDark ? "rgba(16, 185, 129, 0.6)" : "rgba(16, 185, 129, 0.5)";
  if (val >= 75) return isDark ? "rgba(234, 179, 8, 0.55)" : "rgba(234, 179, 8, 0.45)";
  if (val >= 50) return isDark ? "rgba(249, 115, 22, 0.5)" : "rgba(249, 115, 22, 0.4)";
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
type DashboardIQProps = {
  dashboardData?: any; // DashboardV2Data from tRPC
  healthData?: any; // MemberHealthResult from tRPC
  heatmapData?: any; // from getOccupancyHeatmap
  memberGrowthData?: any; // from getMemberGrowth
  uploadHistoryData?: any; // from getUploadHistory
  settingsData?: any; // from useIntelligenceSettings — contains goals[]
  isLoading?: boolean;
  clubId?: string;
  isDemo?: boolean;
};

type PeriodData = {
  kpis: KpiItem[];
  health: { level: string; count: number; pct: number; color: string }[];
  healthMetrics: { improved: number; improvedPct: number; declined: number; declinedPct: number; avgScore: number; avgScorePrev: number; churnedThisPeriod: number; churnChange: number };
  comparison: { metric: string; current: number; previous: number; format: "currency" | "number" | "percent" }[];
};

function mapRealDataToPeriod(dashboardData: any, healthData: any, pricingModel?: string): PeriodData | null {
  if (!dashboardData) return null;
  const m = dashboardData.metrics;
  const hs = healthData?.summary;
  return {
    kpis: (() => {
      // Prefer explicit pricingModel from onboarding settings; fall back to heuristic detection
      // Default to membership when pricingModel not configured
      const isMembership = pricingModel == null || pricingModel === 'membership' || pricingModel === 'free';
      return [
        { label: "Active Players", value: m.members.value, change: `${m.members.trend.direction === 'up' ? '+' : ''}${m.members.trend.changePercent}%`, up: m.members.trend.direction === 'up', icon: Users, gradient: "from-violet-500 to-purple-600", href: "/members", sparkData: m.members.trend.sparkline || [] },
        { label: "Court Occupancy", value: m.occupancy.value, change: `${m.occupancy.trend.direction === 'up' ? '+' : ''}${m.occupancy.trend.changePercent}%`, up: m.occupancy.trend.direction === 'up', icon: Target, gradient: "from-cyan-500 to-teal-500", href: "/sessions", sparkData: m.occupancy.trend.sparkline || [] },
        {
          label: "Player Sessions",
          value: m.bookings.value,
          change: `${m.bookings.trend.direction === 'up' ? '+' : ''}${m.bookings.trend.changePercent}%`,
          up: m.bookings.trend.direction === 'up',
          icon: Activity,
          gradient: "from-emerald-500 to-green-500",
          href: "/sessions",
          sparkData: m.bookings.trend.sparkline || [],
        },
        isMembership
        ? (() => {
            const mb = dashboardData?.players?.membershipBreakdown;
            const notActive = (mb?.suspended || 0) + (mb?.expired || 0) + (mb?.noMembership || 0);
            return {
              label: "Not Active",
              value: notActive || dashboardData?.players?.inactiveCount || 0,
              change: "",
              up: false,
              icon: UserPlus,
              gradient: "from-amber-500 to-orange-500",
              href: "/members",
              sparkData: [],
            };
          })()
        : {
            label: "Lost Revenue",
            value: m.lostRevenue.value,
            change: `${m.lostRevenue.trend.direction === 'up' ? '+' : '-'}${Math.abs(m.lostRevenue.trend.changePercent)}%`,
            up: m.lostRevenue.trend.direction === 'down',
            icon: AlertTriangle,
            gradient: "from-red-500 to-orange-500",
            href: "/slot-filler",
            sparkData: m.lostRevenue.trend.sparkline || [],
          },
      ];
    })(),
    health: hs ? [
      { level: "Healthy", count: hs.healthy, pct: Math.round(hs.healthy / (hs.healthy + hs.watch + hs.atRisk + hs.critical) * 100) || 0, color: "#10B981" },
      { level: "Watch", count: hs.watch, pct: Math.round(hs.watch / (hs.healthy + hs.watch + hs.atRisk + hs.critical) * 100) || 0, color: "#F59E0B" },
      { level: "At-Risk", count: hs.atRisk, pct: Math.round(hs.atRisk / (hs.healthy + hs.watch + hs.atRisk + hs.critical) * 100) || 0, color: "#F97316" },
      { level: "Critical", count: hs.critical, pct: Math.round(hs.critical / (hs.healthy + hs.watch + hs.atRisk + hs.critical) * 100) || 0, color: "#EF4444" },
    ] : emptyHealth,
    healthMetrics: hs ? { improved: 0, improvedPct: 0, declined: 0, declinedPct: 0, avgScore: hs.avgHealthScore, avgScorePrev: 0, churnedThisPeriod: 0, churnChange: 0 } : emptyHealthMetrics,
    comparison: emptyComparison,
  };
}

// ── AI Insights Panel with collapse/expand + accept/dismiss ──
const INSIGHTS_COLLAPSED_COUNT = 3;
const insightTypeIcon: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  court_optimization: MapPin,
  member_retention: Users,
  growth: TrendingUp,
  alert: AlertTriangle,
  schedule: Calendar,
};
const priorityColor: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };

function InsightsPanel({ insights, isLoading, router, clubId }: { insights: any[]; isLoading: boolean; router: any; clubId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('iq_dismissed_insights') || '[]')); } catch { return new Set(); }
  });
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const dismiss = (id: string) => {
    const next = new Set(dismissed); next.add(id); setDismissed(next);
    try { localStorage.setItem('iq_dismissed_insights', JSON.stringify(Array.from(next))); } catch {}
  };
  const accept = (insight: any) => {
    setAccepted(prev => { const n = new Set(prev); n.add(insight.id); return n; });
    if (insight.actionLink) {
      const base = `/clubs/${clubId}/intelligence`;
      const link = insight.actionLink.startsWith('/') ? base + insight.actionLink : insight.actionLink;
      router.push(link);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--card-border)' }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded" style={{ background: 'var(--card-border)', width: '60%' }} />
              <div className="h-2.5 rounded" style={{ background: 'var(--card-border)', width: '90%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const visible = insights.filter(i => !dismissed.has(i.id));
  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <p className="text-sm" style={{ color: 'var(--t3)' }}>All good! No actionable insights right now.</p>
        {dismissed.size > 0 && (
          <button onClick={() => { setDismissed(new Set()); localStorage.removeItem('iq_dismissed_insights'); }}
            className="text-[11px] ml-auto" style={{ color: '#8B5CF6' }}>Reset dismissed</button>
        )}
      </div>
    );
  }

  const shown = expanded ? visible : visible.slice(0, INSIGHTS_COLLAPSED_COUNT);
  const remaining = visible.length - INSIGHTS_COLLAPSED_COUNT;

  return (
    <div className="space-y-0">
      {shown.map((insight, idx) => {
        const Icon = insightTypeIcon[insight.type] || Zap;
        const dotColor = priorityColor[insight.priority] || '#10B981';
        const isAccepted = accepted.has(insight.id);
        return (
          <div key={insight.id}>
            {idx > 0 && <div style={{ height: 1, background: 'var(--divider)' }} />}
            <div className="flex items-start gap-2.5 py-3 group">
              <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 8, height: 8, background: dotColor }} />
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--t3)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-tight" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                  {insight.title}
                </p>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--t3)' }}>
                  {insight.description}
                </p>
                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-2">
                  {insight.actionLink && !isAccepted && (
                    <button onClick={() => accept(insight)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-all hover:scale-105"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', fontWeight: 600, border: '1px solid rgba(139,92,246,0.25)' }}>
                      <CheckCircle2 className="w-3 h-3" /> Accept
                    </button>
                  )}
                  {isAccepted && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px]"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', fontWeight: 600 }}>
                      <CheckCircle2 className="w-3 h-3" /> Accepted
                    </span>
                  )}
                  <button onClick={() => dismiss(insight.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-all opacity-40 group-hover:opacity-100 hover:scale-105"
                    style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {remaining > 0 && (
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 pt-2 text-[12px] transition-all hover:opacity-80"
          style={{ color: '#8B5CF6', fontWeight: 600 }}>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          {expanded ? 'Show less' : `Show ${remaining} more insight${remaining > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

export function DashboardIQ({ dashboardData, healthData, heatmapData, memberGrowthData, uploadHistoryData, settingsData, isLoading: externalLoading, clubId: propClubId, isDemo = false }: DashboardIQProps = {}) {
  const { isDark } = useTheme();
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there';
  const params = useParams();
  const router = useRouter();
  const clubId = propClubId || (params.id as string);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Comparison period state
  type CompMode = 'prev_period' | 'prev_year' | 'calendar';
  const [compMode, setCompMode] = useState<CompMode>('prev_period');
  // Calendar mode: Period A and Period B selected via calendar pickers
  const [calAFrom, setCalAFrom] = useState("");
  const [calATo, setCalATo] = useState("");
  const [calBFrom, setCalBFrom] = useState("");
  const [calBTo, setCalBTo] = useState("");

  // Compute data date bounds from sparkline or sessions for custom picker constraints
  const dataDateBounds = useMemo(() => {
    // Use a wide range — club has data from import, so allow from 2020 to today
    const today = new Date().toISOString().slice(0, 10);
    // Find earliest session from sparkline (7-point array covers last 7 periods)
    // As a reasonable approximation, allow any date up to today
    return { min: '2020-01-01', max: today };
  }, []);

  // Compute date range from period for real data re-fetching
  const periodDates = useMemo(() => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = iso(now);
    if (period === 'week') return { dateFrom: iso(new Date(now.getTime() - 7 * 86400000)), dateTo: today };
    if (period === 'month') return { dateFrom: iso(new Date(now.getTime() - 30 * 86400000)), dateTo: today };
    if (period === 'quarter') return { dateFrom: iso(new Date(now.getTime() - 90 * 86400000)), dateTo: today };
    if (period === 'custom' && customFrom && customTo) return { dateFrom: customFrom, dateTo: customTo };
    return {};
  }, [period, customFrom, customTo]);

  // Internal period query — re-fetches when period changes (replaces prop data)
  const periodQuery = trpc.intelligence.getDashboardV2.useQuery(
    { clubId, ...periodDates },
    { enabled: !!clubId && !externalLoading && !isDemo },
  );
  // Use period-specific data if available, fall back to passed prop
  const activeDashboardData = periodQuery.data ?? dashboardData;
  const isPeriodLoading = periodQuery.isFetching;

  // Comparison period — previous period dates (for quick modes and calendar B)
  const compDates = useMemo(() => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (compMode === 'calendar' && calBFrom && calBTo) {
      return { dateFrom: calBFrom, dateTo: calBTo };
    }
    // Determine current period span in days
    const spanDays = period === 'week' ? 7 : period === 'quarter' ? 90 : 30;
    const now = new Date();
    if (compMode === 'prev_year') {
      const to = new Date(now.getTime() - 365 * 86400000);
      const from = new Date(to.getTime() - spanDays * 86400000);
      return { dateFrom: iso(from), dateTo: iso(to) };
    }
    // prev_period: the same-length window immediately before current
    const curFrom = periodDates.dateFrom
      ? new Date(periodDates.dateFrom).getTime()
      : now.getTime() - spanDays * 86400000;
    const prevTo = new Date(curFrom - 86400000);
    const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86400000);
    return { dateFrom: iso(prevFrom), dateTo: iso(prevTo) };
  }, [compMode, calBFrom, calBTo, period, periodDates]);

  const compQuery = trpc.intelligence.getDashboardV2.useQuery(
    { clubId, ...compDates },
    { enabled: !!clubId && !externalLoading && !isDemo },
  );

  // Calendar mode — Period A (independent from main period tabs)
  const calAQuery = trpc.intelligence.getDashboardV2.useQuery(
    { clubId, dateFrom: calAFrom, dateTo: calATo },
    { enabled: compMode === 'calendar' && !!calAFrom && !!calATo && !!clubId && !isDemo },
  );
  const insightsQueryReal = trpc.intelligence.getClubInsights.useQuery(
    { clubId: clubId! },
    { enabled: !!clubId && !isDemo },
  );
  // In demo, surface a hand-curated set of insights so the panel doesn't
  // sit on a skeleton — mirrors the kind of items the live planner would
  // generate from real club data.
  const insightsQuery = isDemo
    ? { data: mockClubInsights, isLoading: false }
    : insightsQueryReal;
  const [importModal, setImportModal] = useState<"closed" | "upload" | "processing" | "done">("closed");
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    totalParsed: number;
    totalErrors: number;
    found: string[];
    missing: string[];
    notes?: string;
  } | null>(null);
  const [excelFiles, setExcelFiles] = useState<(ExcelFileSlot | null)[]>([null, null, null]);
  const [importError, setImportError] = useState<string | null>(null);
  const trpcUtils = trpc.useUtils();

  const handleExcelFileSet = (idx: number, f: ExcelFileSlot | null) => {
    setExcelFiles(prev => { const next = [...prev]; next[idx] = f; return next; })
  }

  const handleExcelImport = async () => {
    const files = excelFiles.filter(Boolean) as ExcelFileSlot[]
    if (!files.length || !clubId) return
    setImportFileName(`${files.length} CourtReserve file${files.length > 1 ? 's' : ''}`)
    setImportModal("processing")
    setImportProgress(5)
    setImportStatus("Importing files...")
    setImportError(null)

    const CHUNK_SIZE = 500
    // Accumulate results across files and chunks
    const totals = { members: 0, sessions: 0, bookings: 0, errors: 0 }
    let hadErrors = false

    try {
      // Total chunk count across all files for progress tracking
      const allChunks: { file: ExcelFileSlot; chunk: Record<string, any>[]; chunkIndex: number; totalChunks: number }[] = []
      for (const f of files) {
        const totalChunks = Math.max(1, Math.ceil(f.rows.length / CHUNK_SIZE))
        for (let c = 0; c < totalChunks; c++) {
          allChunks.push({ file: f, chunk: f.rows.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE), chunkIndex: c, totalChunks })
        }
      }

      for (let i = 0; i < allChunks.length; i++) {
        const { file: f, chunk, chunkIndex, totalChunks } = allChunks[i]
        const chunkLabel = totalChunks > 1 ? ` (chunk ${chunkIndex + 1}/${totalChunks})` : ''
        setImportStatus(`Importing ${f.name}${chunkLabel}...`)
        setImportProgress(10 + Math.round((i / allChunks.length) * 80))

        const res = await fetch('/api/connectors/courtreserve/import-rows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId,
            fileType: f.type,
            rows: chunk,
            chunkIndex,
            totalChunks,
            isLastChunk: chunkIndex === totalChunks - 1,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || `Upload failed (${res.status})`)
        }
        const data = await res.json()
        totals.members += (data.members?.created || 0) + (data.members?.updated || 0)
        totals.sessions += (data.sessions?.created || 0) + (data.sessions?.updated || 0)
        totals.bookings += (data.bookings?.created || 0)
        totals.errors += (data.members?.errors || 0) + (data.sessions?.errors || 0)
      }

      setImportResult({
        totalParsed: totals.sessions,
        totalErrors: totals.errors,
        found: [`${totals.members} members`, `${totals.sessions} sessions`, `${totals.bookings} bookings`],
        missing: [],
      })
      setImportStatus("Import complete!")
      if (!hadErrors && totals.errors === 0) {
        setExcelFiles([null, null, null])
      }
      // Invalidate dashboard queries so data refreshes without page reload
      trpcUtils.intelligence.getDashboardV2.invalidate({ clubId })
      trpcUtils.intelligence.getMemberHealth.invalidate({ clubId })
      trpcUtils.intelligence.getUploadHistory.invalidate({ clubId })
      setImportProgress(100)
    } catch (err: any) {
      hadErrors = true
      const msg = err?.data?.message || err?.message || "Import failed"
      setImportError(msg)
      setImportProgress(100)
      setImportStatus(msg)
    }
  }
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  // Use real data if available, otherwise fall back to mocks only in demo mode
  const pricingModel: string | undefined = settingsData?.settings?.pricingModel;
  const isMembershipClub = pricingModel == null || pricingModel === 'membership' || pricingModel === 'free';

  let realData: ReturnType<typeof mapRealDataToPeriod> = null;
  try {
    realData = mapRealDataToPeriod(activeDashboardData, healthData, pricingModel);
  } catch (err) {
    console.error('[DashboardIQ] mapRealDataToPeriod crashed:', err, { activeDashboardData, healthData });
  }
  const data = realData || null;
  const isEmptyClub = !data;
  const labels = getPeriodLabel(period);

  // Map real heatmap data — use real timeSlots when available (hourly)
  const displayHeatmap: { day: string; slots: (number | { value: number; time?: string })[] }[] = heatmapData?.heatmap || [];
  const displayHeatmapTimes: string[] = heatmapData?.timeSlots || [];
  // Sessions by Format — real data from occupancy breakdown
  const formatColors: Record<string, string> = {
    OPEN_PLAY: "#10B981", CLINIC: "#06B6D4", DRILL: "#8B5CF6",
    LEAGUE_PLAY: "#F59E0B", SOCIAL: "#EC4899", OTHER: "#6B7280",
  }
  const formatLabelsMap: Record<string, string> = {
    OPEN_PLAY: "Open Play", CLINIC: "Clinic", DRILL: "Drill",
    LEAGUE_PLAY: "League", SOCIAL: "Social", OTHER: "Other",
  }
  const byFormat = activeDashboardData?.occupancy?.byFormat || []
  const displayFormats: { name: string; value: number; color: string }[] = byFormat.length > 0
    ? byFormat.map((f: any) => ({
        name: formatLabelsMap[f.format] || f.format,
        value: f.sessionCount || 0,
        color: formatColors[f.format] || "#6B7280",
      })).filter((f: any) => f.value > 0)
    : [];
  // AI Insights — generated from real data + goals
  const clubGoals: string[] = settingsData?.settings?.goals || [];
  const displayInsights = generateInsights(activeDashboardData, healthData, heatmapData, clubGoals.length > 0 ? clubGoals : undefined);

  // Determine if club has real data or is still empty
  const bookingsVal = activeDashboardData?.metrics?.bookings?.value;
  const totalSessions = typeof bookingsVal === 'number' ? bookingsVal : (typeof bookingsVal === 'string' && bookingsVal !== 'N/A' ? parseInt(bookingsVal, 10) || 0 : 0);
  const healthMemberCount =
    (healthData?.summary?.healthy || 0) +
    (healthData?.summary?.watch || 0) +
    (healthData?.summary?.atRisk || 0) +
    (healthData?.summary?.critical || 0);
  const dashboardMemberCount =
    (activeDashboardData?.players?.activeCount || 0) +
    (activeDashboardData?.players?.inactiveCount || 0);
  const totalMembers = Math.max(healthMemberCount, dashboardMemberCount);
  const sessionCardCount =
    (activeDashboardData?.sessions?.topSessions?.length || 0) +
    (activeDashboardData?.sessions?.problematicSessions?.length || 0);
  const occupancySessionCount =
    (activeDashboardData?.occupancy?.byDay || []).reduce((sum: number, item: any) => sum + (item?.sessionCount || 0), 0);
  const hasSessions = totalSessions > 0 || sessionCardCount > 0 || occupancySessionCount > 0;
  const hasMembers = totalMembers > 0 || (activeDashboardData?.players?.newThisMonth || 0) > 0;
  const hasUploads = !!uploadHistoryData?.uploads?.length;
  const hasOperationalData = hasUploads || (!!activeDashboardData && (hasSessions || hasMembers));
  const hasRealData = !!realData && hasOperationalData;

  // Connector status for Quick Start + empty state
  const connectorStatusQuery = trpc.connectors.getStatus.useQuery({ clubId }, { enabled: !!clubId && !isDemo });
  const isConnected = connectorStatusQuery.data?.connected;

  const quickStartSteps = [
    { id: "settings", label: "Configure club settings", done: true, href: `/clubs/${clubId}/intelligence/settings`, icon: "⚙️" },
    { id: "connect", label: "Connect data source", done: !!isConnected || hasUploads || hasSessions || hasMembers, href: `/clubs/${clubId}/intelligence/integrations`, icon: "🔗" },
    { id: "members", label: "Members detected", done: hasMembers, href: `/clubs/${clubId}/intelligence/members`, icon: "👥" },
    { id: "ai", label: "AI insights ready", done: hasSessions || !!insightsQuery.data?.length, href: `/clubs/${clubId}/intelligence/slot-filler`, icon: "🤖" },
  ];
  const quickStartProgress = quickStartSteps.filter(s => s.done).length;
  const isStillLoading = externalLoading || isPeriodLoading || periodQuery.isLoading;
  // Hide Quick Start once the club already has real operational data
  const showQuickStart = !isStillLoading && quickStartProgress < quickStartSteps.length && !hasOperationalData;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Welcome back, {userName}. Here&apos;s your club overview.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["week", "month", "quarter", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-4 py-2 rounded-xl text-xs capitalize transition-all flex items-center gap-1.5"
              style={{
                background: period === p ? "var(--pill-active)" : "transparent",
                color: period === p ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: period === p ? 600 : 500,
                border: period === p ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
              }}
            >
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Custom'}
              {period === p && isPeriodLoading && (
                <span className="inline-block w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
              )}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                min={dataDateBounds.min}
                max={customTo || dataDateBounds.max}
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
                min={customFrom || dataDateBounds.min}
                max={dataDateBounds.max}
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

      {/* Quick Start Checklist — shown when club has incomplete setup */}
      {showQuickStart && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl p-6"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 style={{ fontWeight: 700, color: "var(--heading)" }}>Quick Start</h3>
              <p className="text-sm mt-0.5" style={{ color: "var(--t3)" }}>Complete these steps to unlock AI-powered insights</p>
            </div>
            <div className="text-sm" style={{ fontWeight: 600, color: "#8B5CF6" }}>
              {quickStartProgress}/{quickStartSteps.length}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full overflow-hidden mb-5" style={{ background: "var(--subtle)" }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(quickStartProgress / quickStartSteps.length) * 100}%` }}
              transition={{ duration: 0.6, delay: 0.2 }}
              style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)" }}
            />
          </div>

          <div className="space-y-2">
            {quickStartSteps.map((s) => {
              const Wrapper = s.href ? 'a' : 'button';
              const wrapperProps = s.href
                ? { href: s.href } as any
                : {} as any;
              return (
                <Wrapper
                  key={s.id}
                  {...wrapperProps}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                  style={{
                    background: s.done ? "rgba(16,185,129,0.06)" : "var(--subtle)",
                    border: s.done ? "1px solid rgba(16,185,129,0.15)" : "1px solid transparent",
                    cursor: s.done ? "default" : "pointer",
                  }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                    background: s.done ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.1)",
                  }}>
                    {s.done
                      ? <Check className="w-4 h-4" style={{ color: "#10B981" }} />
                      : <span className="text-sm">{s.icon}</span>
                    }
                  </div>
                  <span className="text-sm" style={{
                    fontWeight: s.done ? 500 : 600,
                    color: s.done ? "var(--t3)" : "var(--t1)",
                    textDecoration: s.done ? "line-through" : "none",
                  }}>
                    {s.label}
                  </span>
                  {!s.done && (
                    <ChevronRight className="w-4 h-4 ml-auto" style={{ color: "var(--t4)" }} />
                  )}
                </Wrapper>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty state — CourtReserve connection (same as Integrations) */}
      {!hasOperationalData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <CourtReserveConnector clubId={clubId} compact />
          <div className="text-center mt-4">
            <button
              onClick={() => setImportModal("upload")}
              className="text-sm transition-all hover:opacity-80"
              style={{ color: "var(--t3)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
            >
              Or import CSV / XLSX manually
            </button>
          </div>
        </motion.div>
      )}

      {/* All data sections — only show with real data */}
      {hasRealData && data && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push(`/clubs/${clubId}/intelligence${kpi.href}`)}
              className="cursor-pointer"
            >
              <Card className="relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-black/10">
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

      {/* AI-Attributed Revenue — the "money metric" tile.
          Hidden in demo mode: the conservative-incremental math leans on
          real attribution windows, and the resulting ROI numbers
          (e.g. "91.5x ROI on $47.20 spend") read more like a stunt than
          a credible signal when the underlying spend is mock. */}
      {!isDemo && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <AIRevenueTile clubId={clubId} />
        </motion.div>
      )}

      {/* Player Health Overview */}
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-emerald-400" />
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Player Health Overview</h3>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <span className="text-[11px]" style={{ color: "var(--t3)" }}>Avg:</span>
              <span className="text-xs text-emerald-400" style={{ fontWeight: 700 }}>{data.healthMetrics.avgScore}</span>
              <span className="text-[10px] text-emerald-400" style={{ fontWeight: 600 }}>(+{data.healthMetrics.avgScore - data.healthMetrics.avgScorePrev})</span>
            </div>
          </div>

          {/* Mini metrics row — hidden until health cron produces snapshots */}

          {/* Health distribution bars */}
          <div className="space-y-3">
            {data.health.map((h) => (
              <div key={h.level}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: h.color }} />
                    <span className="text-xs" style={{ color: "var(--t2)", fontWeight: 500 }}>{h.level}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>{h.count}</span>
                    <span className="text-[10px]" style={{ color: "var(--t4)" }}>{h.pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: h.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${h.pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Churned members banner — links Health to Reactivation */}
          {(() => {
            const churnedCount = healthData?.summary?.churned || 0;
            if (!churnedCount) return null;
            return (
              <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)" }}>
                <span className="text-[11px]" style={{ color: "var(--t3)" }}>
                  <span style={{ color: "#F97316", fontWeight: 700 }}>{churnedCount}</span> churned (45+ days inactive)
                </span>
                <button
                  onClick={() => router.push(`/clubs/${clubId}/intelligence/reactivation`)}
                  className="text-[11px] flex items-center gap-1 transition-opacity hover:opacity-80"
                  style={{ color: "#F97316", fontWeight: 600 }}
                >
                  Reactivation <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            );
          })()}
          {/* Dormant members banner — never played */}
          {(() => {
            const dormantCount = (healthData?.summary as any)?.dormant || 0;
            if (!dormantCount) return null;
            return (
              <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.15)" }}>
                <span className="text-[11px]" style={{ color: "var(--t3)" }}>
                  <span style={{ color: "#6B7280", fontWeight: 700 }}>{dormantCount}</span> dormant (never played)
                </span>
                <button
                  onClick={() => router.push(`/clubs/${clubId}/intelligence/cohorts`)}
                  className="text-[11px] flex items-center gap-1 transition-opacity hover:opacity-80"
                  style={{ color: "#6B7280", fontWeight: 600 }}
                >
                  Create Activation Cohort <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            );
          })()}
        </Card>

        {/* AI Insights — powered by getClubInsights endpoint */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>AI Insights</h3>
                <p className="text-[10px]" style={{ color: "var(--t4)" }}>Prioritized recommendations</p>
              </div>
            </div>

            <InsightsPanel insights={insightsQuery.data ?? []} isLoading={insightsQuery.isLoading} router={router} clubId={clubId!} />

            <div className="mt-4 pt-4 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--divider)" }}>
              {displayInsights.length > 0 ? displayInsights.map((insight) => (
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
              )) : (
                <span className="text-[11px]" style={{ color: "var(--t4)" }}>No insights available yet</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Heatmap + Segments */}
      <div className="space-y-4">
        {/* Occupancy Heatmap */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Occupancy Heatmap</h3>
          {externalLoading && !heatmapData ? (
            <div className="space-y-2">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex gap-1.5">
                  <div className="w-8 h-7 rounded animate-pulse" style={{ background: "var(--subtle)" }} />
                  {[...Array(17)].map((__, j) => (
                    <div key={j} className="flex-1 h-7 rounded-md animate-pulse" style={{ background: "var(--subtle)" }} />
                  ))}
                </div>
              ))}
            </div>
          ) : displayHeatmap.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: "var(--t4)" }}>
              <BarChart3 className="w-8 h-8 opacity-30" />
              <p className="text-sm">No occupancy data yet — import sessions to see heatmap</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex gap-1.5 pl-10">
                  {displayHeatmapTimes.map((t, i) => (
                    <div key={`${t}-${i}`} className="flex-1 text-center text-[9px]" style={{ color: "var(--t4)" }}>{t}</div>
                  ))}
                </div>
                {displayHeatmap.map((row) => (
                  <div key={row.day} className="flex items-center gap-1.5">
                    <div className="w-8 text-right text-[10px] shrink-0" style={{ color: "var(--t3)", fontWeight: 500 }}>{row.day}</div>
                    {row.slots.map((slot, i: number) => {
                      const val = typeof slot === 'number' ? slot : (slot?.value ?? 0);
                      return (
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
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 mt-4 text-[9px]" style={{ color: "var(--t4)" }}>
                {[
                  { label: "Low", bg: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
                  { label: "Med", bg: isDark ? "rgba(249,115,22,0.5)" : "rgba(249,115,22,0.4)" },
                  { label: "High", bg: isDark ? "rgba(234,179,8,0.55)" : "rgba(234,179,8,0.45)" },
                  { label: "Peak", bg: isDark ? "rgba(16,185,129,0.6)" : "rgba(16,185,129,0.5)" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded" style={{ background: l.bg }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
        {/* Sessions by Format */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Sessions by Format</h3>
          {displayFormats.length > 0 ? (
            <>
              <div className="flex items-center justify-center" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={displayFormats}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {displayFormats.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {displayFormats.map((seg) => (
                  <div key={seg.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
                      <span style={{ color: "var(--t2)" }}>{seg.name}</span>
                    </div>
                    <span style={{ color: "var(--t1)", fontWeight: 600 }}>{seg.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <BarChart3 className="w-8 h-8 mb-2" style={{ color: "var(--t4)" }} />
              <p className="text-xs" style={{ color: "var(--t4)" }}>No session format data yet</p>
            </div>
          )}
        </Card>

        </div>
      </div>

      {/* Period Comparison */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>Period Comparison</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>
                {compMode === 'calendar'
                  ? <>{calAFrom && calATo ? <span style={{ color: "var(--t2)", fontWeight: 500 }}>{calAFrom} – {calATo}</span> : <span style={{ color: "var(--t4)" }}>Period A</span>} vs {calBFrom && calBTo ? <span style={{ color: "var(--t2)", fontWeight: 500 }}>{calBFrom} – {calBTo}</span> : <span style={{ color: "var(--t4)" }}>Period B</span>}</>
                  : <><span style={{ color: "var(--t2)", fontWeight: 500 }}>{labels.current}</span>{" vs "}<span style={{ color: "var(--t2)", fontWeight: 500 }}>{compMode === 'prev_period' ? labels.previous : 'Same period last year'}</span></>
                }
              </p>
            </div>
          </div>
          {/* Compare-to mode selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--t4)" }}>Compare to:</span>
            {([
              { key: 'prev_period', label: 'Prev period' },
              { key: 'prev_year', label: 'Last year' },
              { key: 'calendar', label: '📅 Pick dates' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setCompMode(opt.key)}
                className="px-3 py-1 rounded-lg text-[11px] transition-all"
                style={{
                  background: compMode === opt.key ? "rgba(139,92,246,0.15)" : "var(--subtle)",
                  color: compMode === opt.key ? "#8B5CF6" : "var(--t3)",
                  fontWeight: compMode === opt.key ? 600 : 400,
                  border: compMode === opt.key ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Calendar pickers — shown when "Pick dates" mode selected */}
        {compMode === 'calendar' && (
          <div className="flex flex-col sm:flex-row gap-6 mb-6 p-4 rounded-2xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <MonthCalendar
              label="Period A"
              from={calAFrom}
              to={calATo}
              onChange={(f, t) => { setCalAFrom(f); setCalATo(t); }}
              isDark={isDark}
              accentColor="#8B5CF6"
            />
            <div className="hidden sm:flex flex-col items-center justify-center gap-1" style={{ color: "var(--t4)" }}>
              <div className="w-px flex-1" style={{ background: "var(--divider)" }} />
              <span className="text-xs font-semibold px-2" style={{ color: "var(--t3)" }}>vs</span>
              <div className="w-px flex-1" style={{ background: "var(--divider)" }} />
            </div>
            <div className="sm:hidden h-px w-full" style={{ background: "var(--divider)" }} />
            <MonthCalendar
              label="Period B"
              from={calBFrom}
              to={calBTo}
              onChange={(f, t) => { setCalBFrom(f); setCalBTo(t); }}
              isDark={isDark}
              accentColor="#06B6D4"
            />
          </div>
        )}

        {/* Real comparison metrics */}
        {(() => {
          // In calendar mode: use calAQuery for "current", compQuery for "previous"
          const curData = compMode === 'calendar' && (calAFrom && calATo) ? calAQuery.data : activeDashboardData;
          const cur = curData?.metrics;
          const prv = compQuery.data?.metrics;
          const isLoading = compQuery.isFetching || isPeriodLoading || calAQuery.isFetching;
          // In calendar mode, show placeholder if periods not yet selected
          if (compMode === 'calendar' && (!calAFrom || !calATo || !calBFrom || !calBTo)) {
            return (
              <div className="py-4 text-center text-xs" style={{ color: "var(--t4)" }}>
                Select Period A and Period B above to compare
              </div>
            );
          }

          const toNum = (v: any): number => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0;
            return 0;
          };
          const toOcc = (v: any): number => parseFloat(String(v || '0').replace('%','')) || 0;

          // Extract session counts from subtitles (e.g. "42 sessions")
          const parseSessionCount = (subtitle: any): string | null => {
            if (typeof subtitle !== 'string') return null;
            const m = subtitle.match(/^(\d[\d,]*)\s+sessions?/);
            return m ? `${m[1]} sessions` : null;
          };

          // Metrics: [label, currentVal, prevVal, format, invertGood, subtitle]
          const metrics: Array<{ label: string; cur: number; prev: number; format: 'number'|'percent'; invert?: boolean; curSub?: string | null; prevSub?: string | null }> = cur ? [
            {
              label: "Player Registrations",
              cur: toNum(cur.bookings?.value), prev: toNum(prv?.bookings?.value), format: 'number',
              curSub: parseSessionCount(cur.occupancy?.subtitle),
              prevSub: parseSessionCount(prv?.occupancy?.subtitle),
            },
            { label: "Court Occupancy", cur: toOcc(cur.occupancy?.value), prev: toOcc(prv?.occupancy?.value), format: 'percent' },
            { label: "Active Players", cur: toNum(cur.members?.value), prev: toNum(prv?.members?.value), format: 'number' },
            {
              label: "Avg Sessions/Player",
              cur: toNum(cur.members?.value) > 0 ? Math.round((toNum(cur.bookings?.value) / toNum(cur.members?.value)) * 10) / 10 : 0,
              prev: toNum(prv?.members?.value) > 0 ? Math.round((toNum(prv?.bookings?.value) / toNum(prv?.members?.value)) * 10) / 10 : 0,
              format: 'number',
            },
          ] : [];

          if (!cur) return (
            <div className="py-6 text-center text-xs" style={{ color: "var(--t4)" }}>No data for current period</div>
          );

          return (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((row) => {
                const rawDelta = row.prev === 0 ? 0 : ((row.cur - row.prev) / row.prev) * 100;
                const delta = Math.round(rawDelta * 10) / 10;
                const isPositive = row.invert ? delta < 0 : delta > 0;
                const dispCur = row.format === 'percent' ? `${row.cur}%` : row.cur.toLocaleString();
                const dispPrev = row.format === 'percent' ? `${row.prev}%` : row.prev.toLocaleString();
                return (
                  <div key={row.label} className="rounded-xl p-4 relative overflow-hidden" style={{ background: "var(--subtle)" }}>
                    {isLoading && <div className="absolute inset-0 rounded-xl animate-pulse" style={{ background: "rgba(139,92,246,0.04)" }} />}
                    <div className="text-[11px] mb-2" style={{ color: "var(--t3)", fontWeight: 500 }}>{row.label}</div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--heading)" }}>{dispCur}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>
                          {prv ? `was ${dispPrev}` : '— no comparison data'}
                          {row.curSub && ` · ${row.curSub}`}
                        </div>
                        {row.prevSub && (
                          <div className="text-[9px] mt-0.5" style={{ color: 'var(--t4)', opacity: 0.7 }}>
                            was: {row.prevSub}
                          </div>
                        )}
                      </div>
                      {prv && row.prev > 0 && (
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      </>}

      {/* Import Modal */}
      <AnimatePresence>
        {importModal !== "closed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={(e) => { if (e.target === e.currentTarget && importModal !== "processing") setImportModal("closed"); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl rounded-2xl overflow-hidden"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 25px 80px rgba(0,0,0,0.5)" }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
                <h2 className="text-base" style={{ fontWeight: 700, color: "var(--heading)" }}>
                  {importModal === "upload" ? "Import Data" : importModal === "processing" ? "Training AI..." : "Import Complete"}
                </h2>
                {importModal !== "processing" && (
                  <button onClick={() => setImportModal("closed")} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--t4)" }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {importModal === "upload" && (
                  <ImportProviderTabs
                    excelFiles={excelFiles}
                    onExcelFileSet={handleExcelFileSet}
                    onExcelImport={handleExcelImport}
                    isDark={isDark}
                    clubId={clubId}
                    onPpImportStart={async (ppFiles) => {
                      const fileCount = [ppFiles.customers, ppFiles.settlements].filter(Boolean).length
                      setImportFileName(`${fileCount} PodPlay file${fileCount > 1 ? 's' : ''}`)
                      setImportModal("processing")
                      setImportProgress(5)
                      setImportStatus("Importing PodPlay data...")
                      setImportError(null)

                      const totals = { members: 0, sessions: 0, bookings: 0, errors: 0 }
                      const types = ['customers', 'settlements'] as const
                      for (let i = 0; i < types.length; i++) {
                        const t = types[i]
                        const f = ppFiles[t]
                        if (!f) continue
                        setImportStatus(`Importing ${t}...`)
                        setImportProgress(10 + Math.round(((i + 1) / types.length) * 70))
                        try {
                          const CHUNK_SIZE = 500
                          const totalChunks = Math.max(1, Math.ceil(f.rows.length / CHUNK_SIZE))
                          for (let c = 0; c < totalChunks; c++) {
                            const chunk = f.rows.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE)
                            const chunkLabel = totalChunks > 1 ? ` (chunk ${c + 1}/${totalChunks})` : ''
                            setImportStatus(`Importing ${t}${chunkLabel}...`)
                            const res = await fetch('/api/connectors/podplay/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ clubId, fileType: t, rows: chunk }),
                            })
                            const data = await res.json()
                            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                            totals.members += (data.members?.created || 0) + (data.members?.updated || 0)
                            totals.sessions += data.sessions?.created || 0
                            totals.bookings += data.bookings?.created || 0
                          }
                        } catch (err: any) {
                          totals.errors++
                          setImportError(err.message)
                        }
                      }

                      setImportProgress(90)
                      setImportStatus("Training AI on your data...")
                      // Brief pause for AI training animation
                      await new Promise(r => setTimeout(r, 2000))
                      setImportResult({
                        totalParsed: totals.members + totals.sessions + totals.bookings,
                        totalErrors: totals.errors,
                        found: [
                          totals.members > 0 ? `${totals.members} members` : '',
                          totals.sessions > 0 ? `${totals.sessions} sessions` : '',
                          totals.bookings > 0 ? `${totals.bookings} bookings` : '',
                        ].filter(Boolean),
                        missing: [],
                        notes: 'PodPlay import complete',
                      })
                      setImportProgress(100)
                      setImportStatus("Complete!")
                    }}
                  />
                )}

                {importModal === "processing" && (
                  <AILoadingAnimation
                    progress={importProgress}
                    statusMessage={importStatus}
                    waitForCompletion
                    onComplete={() => {
                      console.log('[Import] Animation onComplete fired')
                      setImportModal("done")
                    }}
                  />
                )}

                {/* Safety: if progress hit 100 but animation didn't fire onComplete */}
                {importModal === "processing" && importProgress >= 100 && (
                  <SafetyAutoComplete onComplete={() => setImportModal("done")} />
                )}

                {importModal === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5 py-4"
                  >
                    {/* Error state */}
                    {importError ? (
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #EF4444, #DC2626)", boxShadow: "0 8px 30px rgba(239,68,68,0.3)" }}>
                          <AlertTriangle className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-lg mb-1" style={{ fontWeight: 700, color: "var(--heading)" }}>Import Failed</h3>
                        <div className="rounded-xl p-4 mt-3 text-left" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          <p className="text-sm font-mono" style={{ color: "#EF4444" }}>{importError}</p>
                        </div>
                        <div className="flex justify-center gap-3 mt-5">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => { setImportModal("upload"); setImportError(null); setImportResult(null); }}
                            className="px-6 py-2.5 rounded-xl text-sm text-white"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600 }}>
                            Try Again
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                    /* Success header */
                    <div className="text-center">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}>
                        <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 8px 30px rgba(16,185,129,0.3)" }}>
                          <CheckCircle2 className="w-8 h-8 text-white" />
                        </div>
                      </motion.div>
                      <h3 className="text-lg mb-1" style={{ fontWeight: 700, color: "var(--heading)" }}>
                        {importResult ? `${importResult.totalParsed} sessions imported` : 'Data Imported Successfully'}
                      </h3>
                      <p className="text-sm" style={{ color: "var(--t3)" }}>
                        <strong style={{ color: "var(--t1)" }}>{importFileName}</strong> processed
                        {importResult?.totalErrors ? ` (${importResult.totalErrors} rows skipped)` : ''}
                      </p>
                    </div>
                    )}

                    {/* Gap report */}
                    {importResult && (
                      <div className="space-y-3">
                        {/* Found columns */}
                        {importResult.found.length > 0 && (
                          <div className="rounded-xl p-4" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "#10B981", fontWeight: 600 }}>Data detected</div>
                            <div className="flex flex-wrap gap-1.5">
                              {importResult.found.map(f => (
                                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", fontWeight: 500 }}>
                                  <Check className="w-3 h-3" /> {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing columns */}
                        {importResult.missing.length > 0 && (
                          <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "#F59E0B", fontWeight: 600 }}>
                              Add more data to unlock full AI power
                            </div>
                            <div className="space-y-1.5">
                              {importResult.missing.map(m => (
                                <div key={m} className="flex items-start gap-2 text-xs" style={{ color: "var(--t3)" }}>
                                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
                                  <span>{m}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {importResult.notes && (
                          <p className="text-xs px-1" style={{ color: "var(--t4)" }}>{importResult.notes}</p>
                        )}
                      </div>
                    )}

                    {!importError && (
                    <div className="flex justify-center gap-3 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setImportModal("closed"); setImportFileName(null); setImportResult(null); setImportError(null); }}
                        className="px-6 py-2.5 rounded-xl text-sm text-white"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600, boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
                      >
                        View Dashboard
                      </motion.button>
                      {importResult?.missing?.length ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setImportModal("upload"); setImportFileName(null); setImportResult(null); setImportError(null); }}
                          className="px-6 py-2.5 rounded-xl text-sm"
                          style={{ color: "var(--t2)", fontWeight: 500, border: "1px solid var(--card-border)" }}
                        >
                          Upload More Data
                        </motion.button>
                      ) : null}
                    </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Import Provider Tabs (CourtReserve + PodPlay) ──
function ImportProviderTabs({ excelFiles, onExcelFileSet, onExcelImport, isDark, clubId, onPpImportStart }: {
  excelFiles: (ExcelFileSlot | null)[]
  onExcelFileSet: (idx: number, f: ExcelFileSlot | null) => void
  onExcelImport: () => void
  isDark: boolean
  clubId: string
  onPpImportStart: (ppFiles: { customers: { name: string; rows: any[] } | null; settlements: { name: string; rows: any[] } | null }) => void
}) {
  const [provider, setProvider] = useState<'courtreserve' | 'podplay'>('courtreserve')
  const [ppFiles, setPpFiles] = useState<{ customers: { name: string; rows: any[] } | null; settlements: { name: string; rows: any[] } | null }>({ customers: null, settlements: null })
  const [ppImporting, setPpImporting] = useState(false)
  const [ppResult, setPpResult] = useState<any>(null)

  const extractRowsFromZip = async (file: File): Promise<{ name: string; rows: any[] }[]> => {
    const XLSX = await import('xlsx')
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const results: { name: string; rows: any[] }[] = []
    const settlementFile = Object.keys(zip.files).find(
      n => n.startsWith('Settlements ') && !n.includes('Line Items') && !n.includes('Summary') && n.endsWith('.csv')
    )
    const target = settlementFile || Object.keys(zip.files).find(n => n.includes('Line Items') && n.endsWith('.csv'))
    if (target) {
      const csv = await zip.files[target].async('uint8array')
      const wb = XLSX.read(csv)
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      results.push({ name: target, rows })
    }
    return results
  }

  const parsePpFiles = async (fileList: File[], type: 'customers' | 'settlements') => {
    const XLSX = await import('xlsx')
    let allRows: any[] = []
    const names: string[] = []
    for (const file of fileList) {
      if (file.name.endsWith('.zip')) {
        const extracted = await extractRowsFromZip(file)
        for (const e of extracted) { allRows = allRows.concat(e.rows); names.push(e.name) }
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const wb = XLSX.read(bytes)
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        allRows = allRows.concat(rows)
        names.push(file.name)
      }
    }
    if (allRows.length > 0) {
      const label = names.length > 1 ? `${names.length} files (${allRows.length} rows)` : names[0]
      setPpFiles(prev => ({ ...prev, [type]: { name: label, rows: allRows } }))
    }
  }

  const handlePpFileSelect = (type: 'customers' | 'settlements', multiple?: boolean) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.xlsx,.zip'
    if (multiple) input.multiple = true
    input.onchange = async (e) => {
      const selected = Array.from((e.target as HTMLInputElement).files || [])
      if (selected.length > 0) await parsePpFiles(selected, type)
    }
    input.click()
  }

  const handlePpImport = () => {
    onPpImportStart(ppFiles)
  }

  return (
    <div className="space-y-4">
      {/* Provider tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setProvider('courtreserve')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all"
          style={{
            background: provider === 'courtreserve' ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'var(--subtle)',
            color: provider === 'courtreserve' ? '#fff' : 'var(--t3)',
            fontWeight: 700,
            border: provider === 'courtreserve' ? 'none' : '1px solid var(--card-border)',
          }}
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: provider === 'courtreserve' ? 'rgba(255,255,255,0.2)' : 'var(--card-bg)', fontWeight: 800 }}>CR</span>
          CourtReserve
        </button>
        <button
          onClick={() => setProvider('podplay')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all"
          style={{
            background: provider === 'podplay' ? 'linear-gradient(135deg, #059669, #10B981)' : 'var(--subtle)',
            color: provider === 'podplay' ? '#fff' : 'var(--t3)',
            fontWeight: 700,
            border: provider === 'podplay' ? 'none' : '1px solid var(--card-border)',
          }}
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: provider === 'podplay' ? 'rgba(255,255,255,0.2)' : 'var(--card-bg)', fontWeight: 800 }}>PP</span>
          PodPlay
        </button>
      </div>

      {/* CourtReserve */}
      {provider === 'courtreserve' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--t4)' }}>Export from CourtReserve → Reports and upload .xlsx files</p>
          <ExcelSlot label="Members" description="MembersReport.xlsx" file={excelFiles[0]} onFile={f => onExcelFileSet(0, f)} isDark={isDark} />
          <ExcelSlot label="Reservations" description="ReservationReport.xlsx" file={excelFiles[1]} onFile={f => onExcelFileSet(1, f)} isDark={isDark} />
          <ExcelSlot label="Events" description="EventRegistrantsReport.xlsx" file={excelFiles[2]} onFile={f => onExcelFileSet(2, f)} isDark={isDark} />
          <button onClick={onExcelImport} disabled={!excelFiles.some(Boolean)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: excelFiles.some(Boolean) ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'), color: excelFiles.some(Boolean) ? '#fff' : 'var(--t4)' }}
          >
            <Upload className="w-4 h-4" /> Import {excelFiles.filter(Boolean).length} CourtReserve file{excelFiles.filter(Boolean).length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* PodPlay */}
      {provider === 'podplay' && (
        <div className="space-y-3">
          {/* Universal drop zone — auto-detects file type */}
          <DashboardPpDropZone
            ppFiles={ppFiles}
            onDrop={(fileList) => {
              const arr = Array.from(fileList)
              const csvs = arr.filter(f => f.name.toLowerCase().includes('customer'))
              const rest = arr.filter(f => !f.name.toLowerCase().includes('customer'))
              if (csvs.length > 0) parsePpFiles(csvs, 'customers')
              if (rest.length > 0) parsePpFiles(rest, 'settlements')
              // If single file and not customer-named, try both
              if (csvs.length === 0 && rest.length === 0) parsePpFiles(arr, 'settlements')
            }}
            onClickSelect={(type) => handlePpFileSelect(type, type === 'settlements')}
            isDark={isDark}
          />
          {ppResult ? (
            <div className="text-center text-xs py-2" style={{ color: '#10B981', fontWeight: 600 }}>
              Imported {ppResult.members.created + ppResult.members.updated} members, {ppResult.sessions.created} sessions, {ppResult.bookings.created} bookings
            </div>
          ) : (
            <button onClick={handlePpImport} disabled={!ppFiles.customers && !ppFiles.settlements || ppImporting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ background: (ppFiles.customers || ppFiles.settlements) ? 'linear-gradient(135deg, #059669, #10B981)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'), color: (ppFiles.customers || ppFiles.settlements) ? '#fff' : 'var(--t4)' }}
            >
              {ppImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {ppImporting ? 'Importing...' : 'Import PodPlay Data'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DashboardPpDropZone({ ppFiles, onDrop, onClickSelect, isDark }: {
  ppFiles: { customers: { name: string; rows: any[] } | null; settlements: { name: string; rows: any[] } | null }
  onDrop: (files: FileList) => void
  onClickSelect: (type: 'customers' | 'settlements') => void
  isDark: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const hasAny = ppFiles.customers || ppFiles.settlements

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files) }}
        className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer transition-all"
        style={{ border: `2px dashed ${dragOver ? '#10B981' : 'var(--card-border)'}`, background: dragOver ? 'rgba(16,185,129,0.06)' : 'var(--subtle)' }}
        onClick={() => onClickSelect('settlements')}
      >
        <Upload className="w-5 h-5" style={{ color: dragOver ? '#10B981' : 'var(--t4)' }} />
        <p className="text-xs" style={{ color: 'var(--t2)', fontWeight: 600 }}>Drop all PodPlay files here</p>
        <p className="text-[10px]" style={{ color: 'var(--t4)' }}>Customers CSV + Settlement ZIPs — auto-detected</p>
      </div>

      {/* Loaded files status */}
      {ppFiles.customers && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs" style={{ color: '#10B981', fontWeight: 600 }}>Customers loaded</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--t4)' }}>{ppFiles.customers.name}</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>{ppFiles.customers.rows.length} rows</span>
        </div>
      )}
      {ppFiles.settlements && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs" style={{ color: '#10B981', fontWeight: 600 }}>Settlements loaded</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--t4)' }}>{ppFiles.settlements.name}</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>{ppFiles.settlements.rows.length} rows</span>
        </div>
      )}
    </div>
  )
}
