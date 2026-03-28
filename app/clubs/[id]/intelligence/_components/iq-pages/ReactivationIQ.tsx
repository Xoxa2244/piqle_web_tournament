'use client'
import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  UserPlus, Users, AlertTriangle, TrendingUp, Clock, Send,
  ChevronRight, Heart, Shield, Zap, Target, Mail, Phone,
  MessageSquare, CheckCircle2, XCircle, Star, ArrowUpRight,
  Filter, Search, Sparkles, DollarSign, BarChart3,
  Smartphone, Bell, Check,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EmptyStateIQ } from "./EmptyStateIQ";

/* --- Mock Data --- */
const churnTrend = [
  { month: "Oct", atRisk: 8, churned: 3, reactivated: 2 },
  { month: "Nov", atRisk: 10, churned: 4, reactivated: 3 },
  { month: "Dec", atRisk: 14, churned: 6, reactivated: 4 },
  { month: "Jan", atRisk: 11, churned: 3, reactivated: 5 },
  { month: "Feb", atRisk: 13, churned: 5, reactivated: 6 },
  { month: "Mar", atRisk: 12, churned: 2, reactivated: 5 },
];

const riskSegments = [
  { name: "High Risk", value: 12, color: "#EF4444" },
  { name: "Medium Risk", value: 18, color: "#F59E0B" },
  { name: "Low Risk", value: 25, color: "#10B981" },
  { name: "Healthy", value: 72, color: "#8B5CF6" },
];

type RiskLevel = "high" | "medium" | "low";

interface HealthFactor {
  name: string;
  score: number;
  weight: number;
  label: string;
}

interface AtRiskMember {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  risk: RiskLevel;
  healthScore: number;
  daysSincePlay: number;
  totalSessions: number;
  memberSince: string;
  revenue: number;
  churnReason: string;
  suggestedAction: string;
  email: string;
  phone: string;
  contacted: boolean;
  responded: boolean;
  healthFactors: HealthFactor[];
}

const atRiskMembers: AtRiskMember[] = [
  { id: "r1", name: "Maria Santos", avatar: "MS", rating: 3.2, risk: "high", healthScore: 18, daysSincePlay: 42, totalSessions: 86, memberSince: "Jan 2024", revenue: 1240, churnReason: "Schedule conflict — moved to evening availability but no evening sessions booked", suggestedAction: "Offer a free evening open play session + personal invite from coach", email: "maria.s@email.com", phone: "+1 (555) 111-2233", contacted: false, responded: false, healthFactors: [
    { name: "Frequency", score: 15, weight: 35, label: "Significant drop — 80% decline" },
    { name: "Recency", score: 0, weight: 25, label: "Inactive for 42+ days" },
    { name: "Consistency", score: 40, weight: 20, label: "Irregular visit pattern" },
    { name: "Pattern Break", score: 15, weight: 15, label: "Missed most expected sessions" },
    { name: "No-Show", score: 60, weight: 5, label: "No-show rate 12% — slightly elevated" },
  ]},
  { id: "r2", name: "Tom Chen", avatar: "TC", rating: 2.8, risk: "high", healthScore: 22, daysSincePlay: 35, totalSessions: 54, memberSince: "Mar 2024", revenue: 820, churnReason: "Cancelled 3 consecutive sessions — frustration with skill level mismatch", suggestedAction: "Invite to skill-appropriate clinic + pair with similar-rated players", email: "tom.c@email.com", phone: "+1 (555) 222-3344", contacted: true, responded: false, healthFactors: [
    { name: "Frequency", score: 15, weight: 35, label: "Significant drop — stopped booking" },
    { name: "Recency", score: 0, weight: 25, label: "Inactive for 35+ days" },
    { name: "Consistency", score: 20, weight: 20, label: "Highly irregular — no clear pattern" },
    { name: "Pattern Break", score: 45, weight: 15, label: "Missed usual Tuesday/Thursday" },
    { name: "No-Show", score: 100, weight: 5, label: "Excellent reliability — rarely misses" },
  ]},
  { id: "r3", name: "David Park", avatar: "DP", rating: 3.5, risk: "high", healthScore: 25, daysSincePlay: 28, totalSessions: 112, memberSince: "Sep 2023", revenue: 2180, churnReason: "Membership renewal in 14 days — activity dropped 80% this month", suggestedAction: "Personal call from manager + loyalty discount offer for renewal", email: "david.p@email.com", phone: "+1 (555) 333-4455", contacted: false, responded: false, healthFactors: [
    { name: "Frequency", score: 15, weight: 35, label: "Significant drop — 80% decline this month" },
    { name: "Recency", score: 25, weight: 25, label: "28 days inactive — approaching churn" },
    { name: "Consistency", score: 70, weight: 20, label: "Moderately consistent visits" },
    { name: "Pattern Break", score: 15, weight: 15, label: "Missed most expected sessions" },
    { name: "No-Show", score: 60, weight: 5, label: "No-show rate 8% — slightly elevated" },
  ]},
  { id: "r4", name: "Jennifer Liu", avatar: "JL", rating: 3.0, risk: "medium", healthScore: 38, daysSincePlay: 21, totalSessions: 45, memberSince: "Jun 2024", revenue: 680, churnReason: "Frequency dropped from 3x/week to 1x/week", suggestedAction: "Send personalized 'We miss you' email with upcoming events matching interests", email: "jennifer.l@email.com", phone: "+1 (555) 444-5566", contacted: true, responded: true, healthFactors: [
    { name: "Frequency", score: 40, weight: 35, label: "Moderate decline — 3x to 1x/week" },
    { name: "Recency", score: 25, weight: 25, label: "21 days inactive — approaching churn" },
    { name: "Consistency", score: 70, weight: 20, label: "Moderately consistent visits" },
    { name: "Pattern Break", score: 45, weight: 15, label: "Missed usual Monday/Wednesday" },
    { name: "No-Show", score: 100, weight: 5, label: "Excellent reliability" },
  ]},
  { id: "r5", name: "Alex Rivera", avatar: "AR", rating: 2.5, risk: "medium", healthScore: 42, daysSincePlay: 18, totalSessions: 28, memberSince: "Aug 2024", revenue: 420, churnReason: "Beginner feeling intimidated by advanced players in open play", suggestedAction: "Invite to beginner-only sessions + assign buddy from similar skill level", email: "alex.r@email.com", phone: "+1 (555) 555-6677", contacted: false, responded: false, healthFactors: [
    { name: "Frequency", score: 40, weight: 35, label: "Moderate decline — booking less" },
    { name: "Recency", score: 50, weight: 25, label: "18 days since last session" },
    { name: "Consistency", score: 40, weight: 20, label: "Irregular visit pattern" },
    { name: "Pattern Break", score: 70, weight: 15, label: "Cannot detect pattern breaks" },
    { name: "No-Show", score: 60, weight: 5, label: "No-show rate 10% — slightly elevated" },
  ]},
  { id: "r6", name: "Priya Sharma", avatar: "PS", rating: 3.8, risk: "medium", healthScore: 45, daysSincePlay: 16, totalSessions: 92, memberSince: "Nov 2023", revenue: 1560, churnReason: "Looking for more competitive play — mentioned considering another club", suggestedAction: "Invite to competitive league + offer tournament registration", email: "priya.s@email.com", phone: "+1 (555) 666-7788", contacted: false, responded: false, healthFactors: [
    { name: "Frequency", score: 60, weight: 35, label: "Slight decline — was 4x now 2x/week" },
    { name: "Recency", score: 50, weight: 25, label: "16 days since last session" },
    { name: "Consistency", score: 70, weight: 20, label: "Moderately consistent visits" },
    { name: "Pattern Break", score: 15, weight: 15, label: "Missed most expected sessions" },
    { name: "No-Show", score: 100, weight: 5, label: "Excellent reliability" },
  ]},
  { id: "r7", name: "Mark Johnson", avatar: "MJ", rating: 2.9, risk: "low", healthScore: 58, daysSincePlay: 12, totalSessions: 34, memberSince: "May 2024", revenue: 510, churnReason: "Slight decrease in frequency — likely seasonal", suggestedAction: "Include in next community event invite + social mixer", email: "mark.j@email.com", phone: "+1 (555) 777-8899", contacted: false, responded: false, healthFactors: [
    { name: "Frequency", score: 60, weight: 35, label: "Slight decline — seasonal pattern" },
    { name: "Recency", score: 50, weight: 25, label: "12 days since last session" },
    { name: "Consistency", score: 70, weight: 20, label: "Moderately consistent visits" },
    { name: "Pattern Break", score: 75, weight: 15, label: "Missed 1 usual session (Saturday)" },
    { name: "No-Show", score: 100, weight: 5, label: "Excellent reliability" },
  ]},
  { id: "r8", name: "Sophie Taylor", avatar: "ST", rating: 3.1, risk: "low", healthScore: 62, daysSincePlay: 10, totalSessions: 67, memberSince: "Feb 2024", revenue: 980, churnReason: "Booking less frequently but still engaged on social", suggestedAction: "Nudge with new program announcement matching skill level", email: "sophie.t@email.com", phone: "+1 (555) 888-9900", contacted: true, responded: true, healthFactors: [
    { name: "Frequency", score: 75, weight: 35, label: "Stable — minor dip" },
    { name: "Recency", score: 50, weight: 25, label: "10 days since last session" },
    { name: "Consistency", score: 70, weight: 20, label: "Moderately consistent visits" },
    { name: "Pattern Break", score: 75, weight: 15, label: "Missed 1 usual session (Wednesday)" },
    { name: "No-Show", score: 100, weight: 5, label: "Excellent reliability" },
  ]},
];

const campaignHistory = [
  { name: "Win-Back: High Risk", sent: 8, opened: 6, responded: 4, returned: 3, revenue: 1840, date: "Mar 10" },
  { name: "We Miss You: Medium", sent: 15, opened: 11, responded: 7, returned: 5, revenue: 2200, date: "Mar 3" },
  { name: "Loyalty Renewal Offer", sent: 12, opened: 10, responded: 8, returned: 6, revenue: 3600, date: "Feb 24" },
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
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--t3)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    high: { bg: "rgba(239,68,68,0.1)", text: "#F87171", label: "High Risk" },
    medium: { bg: "rgba(249,115,22,0.1)", text: "#FB923C", label: "Medium" },
    low: { bg: "rgba(16,185,129,0.1)", text: "#34D399", label: "Low Risk" },
  };
  const c = map[risk];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px]" style={{ background: c.bg, color: c.text, fontWeight: 700 }}>
      <AlertTriangle className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function HealthBar({ score }: { score: number }) {
  const color = score <= 30 ? "#EF4444" : score <= 50 ? "#F59E0B" : "#10B981";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, width: `${score}%` }}
          initial={{ width: 0 }}
          whileInView={{ width: `${score}%` }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        />
      </div>
      <span className="text-[10px]" style={{ color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}

/* ============================================= */
/*           REACTIVATION PAGE                    */
/* ============================================= */
type ReactivationIQProps = {
  reactivationData?: any;
  churnTrendData?: any;
  campaignListData?: any;
  isLoading?: boolean;
  error?: any;
  sendReactivation?: any;
  clubId?: string;
};

function mapRealCandidates(data: any): AtRiskMember[] {
  if (!data?.candidates) return [];
  return data.candidates.map((c: any) => ({
    id: c.member?.id || c.memberId || String(Math.random()),
    name: c.member?.name || c.member?.email || "Unknown",
    avatar: (c.member?.name || "??").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
    rating: c.member?.duprRatingDoubles || 0,
    risk: c.score < 20 ? "high" as const : c.score < 50 ? "medium" as const : "low" as const,
    healthScore: c.score || 0,
    daysSincePlay: c.daysSinceLastActivity || 0,
    totalSessions: c.totalHistoricalBookings || 0,
    memberSince: "N/A",
    revenue: 0,
    churnReason: c.churnReasons && c.churnReasons.length > 0
      ? c.churnReasons.map((r: any) => r.summary).join('. ')
      : (c.reasoning?.summary || "Declining engagement"),
    suggestedAction: c.suggestedAction || (c.suggestedSessions?.[0]?.title ? `Invite to ${c.suggestedSessions[0].title}` : "Send personalized win-back message"),
    email: c.member?.email || "",
    phone: "",
    contacted: !!c.lastContactedAt,
    responded: c.lastContactStatus === "responded",
    healthFactors: c.reasoning?.components
      ? Object.entries(c.reasoning.components).map(([key, comp]: [string, any]) => ({
          name: key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          score: comp.score || 0,
          weight: comp.weight || 20,
          label: comp.explanation || `Score: ${comp.score || 0}`,
        }))
      : [],
  }));
}

export function ReactivationIQ({ reactivationData, churnTrendData, campaignListData, isLoading: externalLoading, error: queryError, sendReactivation, clubId }: ReactivationIQProps = {}) {
  const { isDark } = useTheme();
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentOutreach, setSentOutreach] = useState<Record<string, string>>({});
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const isDemo = typeof window !== 'undefined' && (window.location.search.includes('demo=true') || window.location.hostname === 'demo.iqsport.ai');

  const realCandidates = mapRealCandidates(reactivationData);
  const allMembers = realCandidates.length > 0 ? realCandidates : (isDemo ? atRiskMembers : []);

  const handleSendReactivation = (memberId: string, channel: "email" | "sms") => {
    if (sendReactivation && clubId) {
      sendReactivation.mutate({
        clubId,
        candidates: [{ memberId, channel }],
      }, {
        onSuccess: () => setSentOutreach(prev => ({ ...prev, [memberId]: channel })),
      });
    } else {
      setSentOutreach(prev => ({ ...prev, [memberId]: channel }));
    }
  };

  // Churn trend from real data
  const displayChurnTrend = churnTrendData?.trend?.length
    ? churnTrendData.trend.map((t: any) => ({
        month: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        atRisk: t.atRisk, churned: t.churned, reactivated: t.reactivated,
      }))
    : (isDemo ? churnTrend : []);

  // Risk segments from real reactivation data
  const displayRiskSegments = reactivationData?.candidates
    ? (() => {
        const high = reactivationData.candidates.filter((c: any) => c.score < 30).length;
        const medium = reactivationData.candidates.filter((c: any) => c.score >= 30 && c.score < 60).length;
        const low = reactivationData.candidates.filter((c: any) => c.score >= 60 && c.score < 80).length;
        const healthy = (reactivationData.totalClubMembers || 0) - high - medium - low;
        return [
          { name: "High Risk", value: high, color: "#EF4444" },
          { name: "Medium Risk", value: medium, color: "#F59E0B" },
          { name: "Low Risk", value: low, color: "#06B6D4" },
          { name: "Healthy", value: Math.max(0, healthy), color: "#10B981" },
        ];
      })()
    : (isDemo ? riskSegments : []);

  // Campaign history from real data
  const displayCampaignHistory = campaignListData?.campaigns?.length
    ? campaignListData.campaigns.slice(0, 5).map((c: any) => ({
        name: c.name, date: c.date, sent: c.sent, opened: c.opened,
        responded: c.converted, returned: c.clicked, revenue: 0,
      }))
    : (isDemo ? campaignHistory : []);

  const filtered = allMembers.filter((m) => {
    if (riskFilter !== "all" && m.risk !== riskFilter) return false;
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const hasData = allMembers.length > 0;
  if (queryError && !isDemo) {
    const errMsg = queryError?.message || (typeof queryError === 'string' ? queryError : 'Unknown error')
    const debug = reactivationData?._debug
    return <EmptyStateIQ icon={AlertTriangle} title="Failed to load reactivation data" description={`Error: ${errMsg}${debug ? ` | members=${debug.memberCount} hasBookings=${debug.hasRealBookings}` : ''}`} ctaLabel="Retry" ctaHref={clubId ? `/clubs/${clubId}/intelligence/reactivation` : undefined} />;
  }
  if (!hasData && !isDemo && !externalLoading) {
    const debug = reactivationData?._debug
    return <EmptyStateIQ icon={AlertTriangle} title="No at-risk members" description={`Once you have member data, AI will automatically detect members at risk of churning.${debug ? ` Debug: members=${debug.memberCount} hasBookings=${debug.hasRealBookings} candidates=${debug.candidateCount}` : ''}`} ctaLabel="Import Data" ctaHref={clubId ? `/clubs/${clubId}/intelligence` : undefined} />;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Member Reactivation</h1>
          <span className="px-2 py-0.5 text-[9px] tracking-wider uppercase rounded-lg" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))", color: "#A78BFA", fontWeight: 700, border: "1px solid rgba(139,92,246,0.2)" }}>AI Powered</span>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Predict churn, re-engage dormant players with personalized campaigns</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const atRiskCount = allMembers.filter(m => m.risk === "high" || m.risk === "medium").length;
          const avgHealth = allMembers.length > 0 ? Math.round(allMembers.reduce((s, m) => s + m.healthScore, 0) / allMembers.length) : 0;
          const totalRevenue = allMembers.reduce((s, m) => s + (m.revenue || 0), 0);
          return [
            { label: "At-Risk Members", value: String(atRiskCount), icon: AlertTriangle, gradient: "from-red-500 to-orange-500", change: `${allMembers.length} tracked`, up: false },
            { label: "Reactivated (30d)", value: "—", icon: UserPlus, gradient: "from-emerald-500 to-green-500", change: "tracking", up: true },
            { label: "Revenue at Risk", value: totalRevenue > 0 ? `$${(totalRevenue / 1000).toFixed(1)}K` : "$0", icon: DollarSign, gradient: "from-violet-500 to-purple-600", change: "lifetime value", up: false },
            { label: "Avg Health Score", value: String(avgHealth), icon: Heart, gradient: "from-pink-500 to-rose-500", change: "at-risk segment", up: false },
          ];
        })().map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--heading)" }}>{kpi.value}</div>
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>{kpi.label}</div>
                  </div>
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>{kpi.change}</div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Churn Trend */}
        <Card className="lg:col-span-2">
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Churn & Reactivation Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={displayChurnTrend}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="reactGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="atRisk" name="At Risk" stroke="#EF4444" fill="url(#riskGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="reactivated" name="Reactivated" stroke="#10B981" fill="url(#reactGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Risk Distribution */}
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Risk Distribution</h3>
          <div className="flex items-center justify-center" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={displayRiskSegments} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {displayRiskSegments.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {displayRiskSegments.map((seg) => (
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
      </div>

      {/* Member List */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>At-Risk Members</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", minWidth: 200 }}>
              <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
              <input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full"
                style={{ color: "var(--t1)" }}
              />
            </div>
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              {(["all", "high", "medium", "low"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRiskFilter(f)}
                  className="px-3 py-2 text-[11px] capitalize transition-all"
                  style={{
                    background: riskFilter === f ? "var(--pill-active)" : "transparent",
                    color: riskFilter === f ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                    fontWeight: riskFilter === f ? 600 : 500,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((member, i) => {
            const isExpanded = expandedMember === member.id;
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="!p-0 overflow-hidden">
                  {/* Main Row */}
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors"
                    onClick={() => setExpandedMember(isExpanded ? null : member.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs text-white shrink-0"
                      style={{
                        background: member.risk === "high"
                          ? "linear-gradient(135deg, #EF4444, #DC2626)"
                          : member.risk === "medium"
                          ? "linear-gradient(135deg, #F59E0B, #D97706)"
                          : "linear-gradient(135deg, #10B981, #059669)",
                        fontWeight: 700,
                      }}
                    >
                      {member.avatar}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ fontWeight: 600, color: "var(--heading)" }}>{member.name}</span>
                        <RiskBadge risk={member.risk} />
                        {member.contacted && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", fontWeight: 600 }}>
                            {member.responded ? "Responded" : "Contacted"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: "var(--t3)" }}>
                        <span>\u2B50 {member.rating}</span>
                        <span>{member.daysSincePlay}d since last play</span>
                        <span>{member.totalSessions} sessions</span>
                      </div>
                    </div>

                    <HealthBar score={member.healthScore} />

                    <div className="text-right hidden sm:block">
                      <div className="text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>${member.revenue}</div>
                      <div className="text-[10px]" style={{ color: "var(--t4)" }}>lifetime rev</div>
                    </div>

                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronRight className="w-4 h-4" style={{ color: "var(--t4)" }} />
                    </motion.div>
                  </div>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-2 space-y-4" style={{ borderTop: "1px solid var(--divider)" }}>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--t4)", fontWeight: 600 }}>Churn Reason (AI Analysis)</div>
                              <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)", color: "var(--t2)", lineHeight: 1.6 }}>
                                {member.churnReason}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--t4)", fontWeight: 600 }}>Suggested Action</div>
                              <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.1)", color: "var(--t2)", lineHeight: 1.6 }}>
                                <div className="flex items-start gap-2">
                                  <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                                  {member.suggestedAction}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Health Score Breakdown */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wider mb-2.5" style={{ color: "var(--t4)", fontWeight: 600 }}>Health Score Breakdown</div>
                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                              {member.healthFactors.map((f) => {
                                const barColor = f.score <= 30 ? "#EF4444" : f.score <= 50 ? "#F59E0B" : "#10B981";
                                return (
                                  <div key={f.name} className="p-2.5 rounded-xl" style={{ background: "var(--faint)", border: "1px solid var(--card-border)" }}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[10px]" style={{ color: "var(--t3)", fontWeight: 600 }}>{f.name}</span>
                                      <span className="text-[10px]" style={{ color: barColor, fontWeight: 700 }}>{f.score}</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                                      <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: barColor }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${f.score}%` }}
                                        transition={{ duration: 0.6, delay: 0.1 }}
                                      />
                                    </div>
                                    <div className="text-[9px] mt-1.5" style={{ color: "var(--t4)", lineHeight: 1.3 }}>{f.label}</div>
                                    <div className="text-[9px] mt-0.5" style={{ color: "var(--t5)" }}>Weight: {f.weight}%</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Outreach Actions */}
                          <div className="p-3 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
                                  <Send className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} />
                                </div>
                                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>Win-Back Outreach</span>
                              </div>
                              {!sentOutreach[member.id] && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendReactivation(member.id, "email"); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                                  style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", color: "#fff", fontWeight: 600 }}
                                >
                                  <Send className="w-3 h-3" />
                                  Send via Email
                                </button>
                              )}
                              {sentOutreach[member.id] && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                                  <Check className="w-3 h-3" />
                                  Sent via {sentOutreach[member.id]}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "var(--subtle)" }}>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--t3)" }}>
                                  <span>Member since: <strong style={{ color: "var(--t1)" }}>{member.memberSince}</strong></span>
                                  <span>Email: <strong style={{ color: "var(--t1)" }}>{member.email}</strong></span>
                                </div>
                              </div>
                              {!sentOutreach[member.id] && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSendReactivation(member.id, "email"); }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                                    style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600, border: "1px solid rgba(139,92,246,0.2)" }}
                                  >
                                    <Mail className="w-3 h-3" /> Email
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSendReactivation(member.id, "sms"); }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                                    style={{ background: "rgba(6,182,212,0.15)", color: "#22D3EE", fontWeight: 600, border: "1px solid rgba(6,182,212,0.2)" }}
                                  >
                                    <Smartphone className="w-3 h-3" /> SMS
                                  </button>
                                  <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]" style={{ color: "var(--t4)", fontWeight: 500 }}>
                                    <Bell className="w-3 h-3" /> Push
                                    <span className="text-[9px] ml-0.5" style={{ color: "var(--t4)", opacity: 0.6 }}>soon</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Campaign History */}
      {displayCampaignHistory.length > 0 && (
      <Card>
        <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Recent Reactivation Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                {["Campaign", "Date", "Sent", "Opened", "Responded", "Returned", "Revenue"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayCampaignHistory.map((c: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>{c.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--t3)" }}>{c.date}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>{c.sent}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>{c.opened}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>{c.responded}</td>
                  <td className="px-4 py-3 text-xs text-emerald-400" style={{ fontWeight: 600 }}>{c.returned}</td>
                  <td className="px-4 py-3 text-xs text-emerald-400" style={{ fontWeight: 700 }}>${c.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </motion.div>
  );
}
