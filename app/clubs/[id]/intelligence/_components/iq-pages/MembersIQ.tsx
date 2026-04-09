'use client'
import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import { trpc } from "@/lib/trpc";
import {
  Users, Search, Heart, Clock, Check, Loader2,
  CalendarDays, DollarSign, Mail,
  Smartphone, ArrowUpRight, ArrowDownRight, UserPlus,
  Target, LayoutGrid, List,
} from "lucide-react";
import { SmsComingSoon, DuprBadge } from './shared/SmsBadge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EmptyStateIQ } from "./EmptyStateIQ";
import { MembersReactivationSection } from "./MembersReactivationSection";
import { PlayerProfileIQ } from "./PlayerProfileIQ";


type Segment = "all" | "power" | "regular" | "casual" | "at-risk" | "critical";

interface Member {
  id: string;
  name: string;
  avatar: string;
  email: string;
  phone: string;
  rating: number;
  sport: string;
  segment: Exclude<Segment, "all">;
  healthScore: number;
  sessionsThisMonth: number;
  totalSessions: number;
  memberSince: string;
  lastPlayed: string;
  revenue: number;
  trend: "up" | "down" | "stable";
  favoriteTime: string;
  favoriteFormat: string;
  activityLevel: 'power' | 'regular' | 'casual' | 'occasional';
  engagementTrend: 'growing' | 'stable' | 'declining' | 'churning';
  valueTier: 'high' | 'medium' | 'low';
  avgSessionsPerWeek: number;
  totalRevenue: number;
  membershipType: string | null;
  membershipStatus: string | null;
  suggestedAction: string;
}


const segmentConfig: Record<Exclude<Segment, "all">, { color: string; bg: string; label: string; tooltip: string }> = {
  power: { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", label: "Power Player", tooltip: "4+ sessions/week, health score 80+" },
  regular: { color: "#06B6D4", bg: "rgba(6,182,212,0.1)", label: "Regular", tooltip: "2-3 sessions/week, consistent attendance" },
  casual: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Casual", tooltip: "1 session/week or less, still active" },
  "at-risk": { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "At-Risk", tooltip: "Declining frequency, health score 25-49" },
  critical: { color: "#EF4444", bg: "rgba(239,68,68,0.1)", label: "Critical", tooltip: "Health score below 25, immediate attention needed" },
};

const activityColors: Record<string, { bg: string; text: string }> = {
  power: { bg: "rgba(139,92,246,0.15)", text: "#A78BFA" },
  regular: { bg: "rgba(6,182,212,0.15)", text: "#22D3EE" },
  casual: { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  occasional: { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
};
const activityLabels: Record<string, string> = { power: 'Power Player', regular: 'Regular', casual: 'Casual', occasional: 'Occasional' };
const trendColors: Record<string, { bg: string; text: string }> = {
  growing: { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  stable: { bg: "rgba(6,182,212,0.1)", text: "#67E8F9" },
  declining: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
  churning: { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
};

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

function HealthBar({ score }: { score: number }) {
  const color = score <= 30 ? "#EF4444" : score <= 50 ? "#F59E0B" : score <= 70 ? "#06B6D4" : "#10B981";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
        <div className="h-full rounded-full" style={{ background: color, width: `${score}%` }} />
      </div>
      <span className="text-[10px]" style={{ color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}

function SegmentBadge({ segment }: { segment: Exclude<Segment, "all"> }) {
  const cfg = segmentConfig[segment];
  return (
    <span title={cfg.tooltip} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] cursor-help" style={{ background: cfg.bg, color: cfg.color, fontWeight: 600 }}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

/* ============================================= */
/*              MEMBERS PAGE                      */
/* ============================================= */
type Period = "week" | "month" | "quarter" | "custom";

function getSessionsForPeriod(member: Member, period: Period): number {
  // Mock: derive from sessionsThisMonth
  if (period === "week") return Math.round(member.sessionsThisMonth * 0.28);
  if (period === "month") return member.sessionsThisMonth;
  if (period === "quarter") return Math.round(member.sessionsThisMonth * 2.8);
  return member.sessionsThisMonth;
}

function getPeriodLabel(p: Period): string {
  if (p === "week") return "This Week";
  if (p === "month") return "This Month";
  if (p === "quarter") return "This Quarter";
  return "Custom Range";
}

type MembersIQProps = {
  memberHealthData?: any; // from useMemberHealth
  memberGrowthData?: any; // from useMemberGrowth
  isLoading?: boolean;
  sendOutreach?: any;
  clubId?: string;
  reactivationCandidates?: any[];
  aiProfiles?: Record<string, any>;
  onRegenerateProfiles?: () => void;
  sendReactivation?: any;
};

function riskToSegment(risk: string): Exclude<Segment, "all"> {
  if (risk === "healthy") return "power";
  if (risk === "watch") return "regular";
  if (risk === "at_risk") return "at-risk";
  if (risk === "critical") return "critical";
  return "casual";
}

function lifecycleToSegment(stage: string): Exclude<Segment, "all"> {
  if (stage === "active") return "power";
  if (stage === "ramping" || stage === "onboarding") return "regular";
  if (stage === "at_risk") return "at-risk";
  if (stage === "critical" || stage === "churned") return "critical";
  return "casual";
}

function mapRealMembers(data: any): Member[] {
  if (!data?.members) return [];
  return data.members.map((m: any) => ({
    id: m.memberId,
    name: m.member?.name || m.member?.email || "Unknown",
    avatar: (m.member?.name || "??").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
    email: m.member?.email || "",
    phone: "",
    rating: m.member?.duprRatingDoubles || 0,
    sport: "Pickleball",
    segment: riskToSegment(m.riskLevel),
    healthScore: m.healthScore,
    sessionsThisMonth: m.totalBookings || 0,
    totalSessions: m.totalBookings || 0,
    memberSince: m.joinedDaysAgo ? `${Math.round(m.joinedDaysAgo / 30)}mo ago` : "N/A",
    lastPlayed: m.daysSinceLastBooking != null ? (m.daysSinceLastBooking === 0 ? "Today" : m.daysSinceLastBooking === 1 ? "Yesterday" : `${m.daysSinceLastBooking} days ago`) : "N/A",
    revenue: 0, // not available in health data
    trend: m.trend === "improving" ? "up" as const : m.trend === "declining" ? "down" as const : "stable" as const,
    favoriteTime: "",
    favoriteFormat: "",
    activityLevel: m.segment?.activityLevel || (m.riskLevel === 'healthy' ? 'regular' : 'casual') as Member['activityLevel'],
    engagementTrend: (m.segment?.trend || m.trend || 'stable') as Member['engagementTrend'],
    valueTier: (m.segment?.valueTier || 'medium') as Member['valueTier'],
    avgSessionsPerWeek: m.avgSessionsPerWeek || 0,
    totalRevenue: m.totalRevenue || 0,
    membershipType: m.membershipType || null,
    membershipStatus: m.membershipStatus || null,
    suggestedAction: m.suggestedAction || '',
  }));
}

export function MembersIQ({ memberHealthData, memberGrowthData, isLoading: externalLoading, sendOutreach, clubId, reactivationCandidates, aiProfiles, onRegenerateProfiles, sendReactivation }: MembersIQProps = {}) {
  const { isDark } = useTheme();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "at-risk" | "reactivation">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActivity, setFilterActivity] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterTrend, setFilterTrend] = useState<string>("all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [filterMembership, setFilterMembership] = useState<string>("all");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "health" | "revenue" | "sessions">("health");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const handleOutreach = (memberId: string, channel: "email" | "sms", member: Member) => {
    if (sendOutreach && clubId) {
      sendOutreach.mutate({
        clubId,
        memberId,
        type: "CHECK_IN",
        channel,
        healthScore: member.healthScore,
        riskLevel: member.segment === "at-risk" ? "at_risk" : member.segment === "critical" ? "critical" : "healthy",
      }, {
        onSuccess: () => setSentMessages(prev => ({ ...prev, [memberId]: channel })),
      });
    } else {
      // Mock mode — just show sent state
      setSentMessages(prev => ({ ...prev, [memberId]: channel }));
    }
  };

  // Use real data — no mock fallback
  const realMembers = mapRealMembers(memberHealthData);
  const allMembers = realMembers.length > 0 ? realMembers : [];

  // Member growth chart — from real data
  const displayMemberGrowth = memberGrowthData?.growth?.length
    ? memberGrowthData.growth.map((g: any) => ({
        month: new Date(g.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        total: g.total, new: g.new, churned: g.churned,
      }))
    : [];

  // Activity distribution — derive from real member sessions data
  const displayActivityDistribution = realMembers.length > 0
    ? (() => {
        const ranges = [{ range: "0", min: 0, max: 0 }, { range: "1-2", min: 1, max: 2 }, { range: "3-4", min: 3, max: 4 }, { range: "5-6", min: 5, max: 6 }, { range: "7-8", min: 7, max: 8 }, { range: "9+", min: 9, max: 999 }];
        return ranges.map(r => ({ range: r.range, count: realMembers.filter((m: any) => m.sessionsThisMonth >= r.min && m.sessionsThisMonth <= r.max).length }));
      })()
    : [];

  const filtered = allMembers
    .filter((m) => {
      // At-risk subtab: only show at-risk + critical segments
      if (view === "at-risk" && m.segment !== "at-risk" && m.segment !== "critical") return false;
      if (filterActivity !== "all" && m.activityLevel !== filterActivity) return false;
      if (filterRisk !== "all" && m.segment !== filterRisk) return false;
      if (filterTrend !== "all" && m.engagementTrend !== filterTrend) return false;
      if (filterValue !== "all" && m.valueTier !== filterValue) return false;
      if (filterMembership !== "all" && m.membershipStatus !== filterMembership) return false;
      if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()) && !m.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "health") return b.healthScore - a.healthScore;
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "sessions") return b.sessionsThisMonth - a.sessionsThisMonth;
      return 0;
    });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeMember = allMembers.find((m) => m.id === selectedMember);

  const hasData = allMembers.length > 0;
  if (!hasData && !externalLoading) {
    return <EmptyStateIQ icon={Users} title="No members yet" description="Import session data with player names to track member health, engagement, and retention." ctaLabel="Import Data" ctaHref={clubId ? `/clubs/${clubId}/intelligence` : undefined} />;
  }

  if (selectedPlayerId && clubId) {
    return <PlayerProfileIQ userId={selectedPlayerId} clubId={clubId} onBack={() => setSelectedPlayerId(null)} />;
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Members</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>360° member profiles with health scores and segments</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
          style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600, boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
        >
          <UserPlus className="w-4 h-4" />
          Add Member
        </motion.button>
      </div>

      {/* View Subtabs */}
      {(() => {
        const atRiskCount = allMembers.filter(m => m.segment === "at-risk" || m.segment === "critical").length;
        const reactivationCount = reactivationCandidates?.length || 0;
        const tabs: { key: typeof view; label: string; count?: number }[] = [
          { key: "all", label: "All Members" },
          { key: "at-risk", label: "At-Risk", count: atRiskCount },
          { key: "reactivation", label: "Reactivation", count: reactivationCount },
        ];
        return (
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setView(tab.key); setPage(1); }}
                className="px-4 py-2 text-xs transition-all flex items-center gap-1.5"
                style={{
                  background: view === tab.key ? "var(--pill-active)" : "transparent",
                  color: view === tab.key ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                  fontWeight: view === tab.key ? 600 : 500,
                }}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px]" style={{
                    background: view === tab.key ? "rgba(139,92,246,0.2)" : "var(--subtle)",
                    fontWeight: 700,
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Reactivation View */}
      {view === "reactivation" ? (
        <MembersReactivationSection
          candidates={reactivationCandidates}
          aiProfiles={aiProfiles}
          isLoading={externalLoading}
          onRegenerate={onRegenerateProfiles}
          sendOutreach={sendReactivation}
          clubId={clubId}
          isDark={isDark}
        />
      ) : (<>

      {/* Period Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
          {(["week", "month", "quarter", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-4 py-2 text-xs capitalize transition-all"
              style={{
                background: period === p ? "var(--pill-active)" : "transparent",
                color: period === p ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: period === p ? 600 : 500,
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 px-2 text-xs rounded-lg outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
            <span className="text-xs" style={{ color: "var(--t4)" }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 px-2 text-xs rounded-lg outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
          </div>
        )}
      </div>

      {/* Membership Status KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(() => {
          const active = allMembers.filter(m => m.membershipStatus === 'Currently Active').length;
          const suspended = allMembers.filter(m => m.membershipStatus === 'Suspended').length;
          const noMembership = allMembers.filter(m => m.membershipStatus === 'No Membership').length;
          const expired = allMembers.filter(m => m.membershipStatus === 'Expired').length;
          const avgHealth = allMembers.length > 0 ? Math.round(allMembers.reduce((s, m) => s + m.healthScore, 0) / allMembers.length) : 0;
          return [
            { label: "Active Members", value: String(active || allMembers.length), icon: Users, gradient: "from-violet-500 to-purple-600", sub: `of ${allMembers.length} total` },
            { label: "Avg Health", value: String(avgHealth), icon: Heart, gradient: "from-emerald-500 to-green-500", sub: "engagement score" },
            { label: "Suspended", value: String(suspended), icon: Clock, gradient: "from-amber-500 to-orange-500", sub: suspended > 0 ? "frozen memberships" : "none" },
            { label: "No Membership", value: String(noMembership), icon: UserPlus, gradient: "from-cyan-500 to-teal-500", sub: noMembership > 0 ? "potential converts" : "none" },
            { label: "Expired", value: String(expired), icon: CalendarDays, gradient: "from-red-500 to-orange-500", sub: expired > 0 ? "need renewal" : "none" },
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
                <div className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>{kpi.sub}</div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Membership Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs mr-1" style={{ color: "var(--t4)", fontWeight: 600 }}>Membership:</span>
        {[
          { key: "all", label: "All" },
          { key: "Currently Active", label: "Active" },
          { key: "Suspended", label: "Suspended" },
          { key: "No Membership", label: "No Membership" },
          { key: "Expired", label: "Expired" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterMembership(f.key)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: filterMembership === f.key ? "var(--pill-active)" : "transparent",
              color: filterMembership === f.key ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
              fontWeight: filterMembership === f.key ? 600 : 500,
              border: `1px solid ${filterMembership === f.key ? (isDark ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.2)") : "var(--card-border)"}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      {(displayMemberGrowth.length > 0 || displayActivityDistribution.length > 0) && (
      <div className="grid lg:grid-cols-2 gap-4">
        {displayMemberGrowth.length > 0 && (
        <Card>
          <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Member Growth</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={displayMemberGrowth}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="total" name="Total" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4, fill: "#8B5CF6" }} />
              <Line type="monotone" dataKey="new" name="New" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: "#10B981" }} />
              <Line type="monotone" dataKey="churned" name="Churned" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: "#EF4444" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        )}

        {displayActivityDistribution.length > 0 && (
        <Card>
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>How Often Members Play</h3>
          <p className="text-[11px] mb-4 mt-0.5" style={{ color: "var(--t4)" }}>Members grouped by sessions per week (last 30 days)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={displayActivityDistribution}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="range" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} label={{ value: "Sessions/week", position: "insideBottom", offset: -2, style: { fill: "var(--chart-tick)", fontSize: 10 } }} />
              <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Members" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        )}
      </div>
      )}

      {/* Filters + Table */}
      <div className="space-y-3">
        {/* Search + Sort + View toggle */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", minWidth: 240 }}>
            <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
            <input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-sm w-full"
              style={{ color: "var(--t1)" }}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--t3)" }}>
              <span>Sort by:</span>
              {(["health", "revenue", "sessions", "name"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className="px-2 py-1 rounded-lg capitalize transition-all"
                  style={{
                    background: sortBy === s ? "var(--pill-active)" : "transparent",
                    color: sortBy === s ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t4)",
                    fontWeight: sortBy === s ? 600 : 400,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-[11px] px-2 py-1.5 rounded-xl outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
            </select>
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              {([{ mode: "grid" as const, Icon: LayoutGrid }, { mode: "list" as const, Icon: List }]).map(({ mode, Icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="p-2 transition-all"
                  style={{
                    background: viewMode === mode ? "var(--pill-active)" : "transparent",
                    color: viewMode === mode ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t4)",
                  }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Segment Filters */}
        <div className="space-y-2">
          {/* Activity */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider w-14" style={{ color: "var(--t4)", fontWeight: 600 }}>Activity</span>
            {["all", "power", "regular", "casual", "occasional"].map(v => (
              <button key={v} onClick={() => setFilterActivity(v)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all capitalize"
                style={{ background: filterActivity === v ? "var(--pill-active)" : "transparent", color: filterActivity === v ? "#C4B5FD" : "var(--t3)", fontWeight: filterActivity === v ? 600 : 400 }}>
                {v === 'all' ? 'All' : v === 'power' ? 'Power' : v === 'regular' ? 'Regular' : v === 'casual' ? 'Casual' : 'Occasional'}
              </button>
            ))}
          </div>
          {/* Risk */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider w-14" style={{ color: "var(--t4)", fontWeight: 600 }}>Risk</span>
            {["all", "healthy", "watch", "at-risk", "critical"].map(v => (
              <button key={v} onClick={() => setFilterRisk(v === "healthy" ? "power" : v === "watch" ? "regular" : v)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all capitalize"
                style={{ background: (v === "healthy" && filterRisk === "power") || (v === "watch" && filterRisk === "regular") || (v !== "healthy" && v !== "watch" && filterRisk === v) ? "var(--pill-active)" : "transparent", color: (v === "healthy" && filterRisk === "power") || (v === "watch" && filterRisk === "regular") || (v !== "healthy" && v !== "watch" && filterRisk === v) ? "#C4B5FD" : "var(--t3)", fontWeight: (v === "healthy" && filterRisk === "power") || (v === "watch" && filterRisk === "regular") || (v !== "healthy" && v !== "watch" && filterRisk === v) ? 600 : 400 }}>
                {v === 'all' ? 'All' : v === 'healthy' ? 'Healthy' : v === 'watch' ? 'Watch' : v === 'at-risk' ? 'At-Risk' : 'Critical'}
              </button>
            ))}
          </div>
          {/* Trend */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider w-14" style={{ color: "var(--t4)", fontWeight: 600 }}>Trend</span>
            {["all", "growing", "stable", "declining", "churning"].map(v => (
              <button key={v} onClick={() => setFilterTrend(v)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all capitalize"
                style={{ background: filterTrend === v ? "var(--pill-active)" : "transparent", color: filterTrend === v ? "#C4B5FD" : "var(--t3)", fontWeight: filterTrend === v ? 600 : 400 }}>
                {v === 'all' ? 'All' : v}
              </button>
            ))}
          </div>
          {/* Value */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider w-14" style={{ color: "var(--t4)", fontWeight: 600 }}>Value</span>
            {["all", "high", "medium", "low"].map(v => (
              <button key={v} onClick={() => setFilterValue(v)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all capitalize"
                style={{ background: filterValue === v ? "var(--pill-active)" : "transparent", color: filterValue === v ? "#C4B5FD" : "var(--t3)", fontWeight: filterValue === v ? 600 : 400 }}>
                {v === 'all' ? 'All' : v === 'high' ? 'High LTV' : v === 'medium' ? 'Mid' : 'Low'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save filtered members as Cohort */}
      {(filterRisk !== 'all' || filterTrend !== 'all' || filterValue !== 'all' || filterActivity !== 'all' || filterMembership !== 'all') && filtered.length > 0 && (
        <SaveAsCohortButton clubId={clubId!} memberIds={filtered.map(m => m.id).filter(Boolean) as string[]} filterDescription={[
          filterRisk !== 'all' ? `Risk: ${filterRisk}` : '',
          filterTrend !== 'all' ? `Trend: ${filterTrend}` : '',
          filterValue !== 'all' ? `Value: ${filterValue}` : '',
          filterActivity !== 'all' ? `Activity: ${filterActivity}` : '',
          filterMembership !== 'all' ? `Membership: ${filterMembership}` : '',
        ].filter(Boolean).join(', ')} count={filtered.length} />
      )}

      {/* Member Grid */}
      {viewMode === "grid" ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="cursor-pointer transition-all hover:scale-[1.02]">
                <div onClick={() => setSelectedPlayerId(member.id)} className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-sm text-white shrink-0"
                    style={{ background: `linear-gradient(135deg, ${segmentConfig[member.segment].color}, ${segmentConfig[member.segment].color}99)`, fontWeight: 700 }}
                  >
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate hover:underline" style={{ fontWeight: 700, color: "var(--heading)" }}>{member.name}</span>
                      {member.trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
                      {member.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: activityColors[member.activityLevel].bg, color: activityColors[member.activityLevel].text, fontWeight: 600 }}>
                        {activityLabels[member.activityLevel]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: trendColors[member.engagementTrend].bg, color: trendColors[member.engagementTrend].text, fontWeight: 600 }}>
                        {member.engagementTrend === 'growing' ? '\u2191 Growing' : member.engagementTrend === 'declining' ? '\u2193 Declining' : member.engagementTrend === 'churning' ? '\u23F8 Churning' : '\u2192 Stable'}
                      </span>
                      {member.valueTier === 'high' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", fontWeight: 600 }}>
                          \u2605 High LTV
                        </span>
                      )}
                      <span className="text-[9px] self-center" style={{ color: "var(--t4)" }}>{member.sport}</span>
                    </div>
                    {/* Membership badge */}
                    {member.membershipType && (
                      <div className="text-[9px] truncate max-w-[200px]" style={{ color: "var(--t4)" }} title={member.membershipType}>
                        {member.membershipType.length > 35 ? member.membershipType.slice(0, 35) + '…' : member.membershipType}
                      </div>
                    )}
                    {member.membershipStatus && member.membershipStatus !== 'Currently Active' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{
                        background: member.membershipStatus === 'Suspended' ? "rgba(245,158,11,0.15)" : member.membershipStatus === 'Expired' ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.15)",
                        color: member.membershipStatus === 'Suspended' ? "#F59E0B" : member.membershipStatus === 'Expired' ? "#EF4444" : "#94A3B8",
                        fontWeight: 600,
                      }}>
                        {member.membershipStatus}
                      </span>
                    )}
                  </div>
                  <HealthBar score={member.healthScore} />
                </div>

                {/* Suggested action for at-risk members */}
                {member.suggestedAction && (member.segment === 'at-risk' || member.segment === 'critical' || (member.membershipStatus && member.membershipStatus !== 'Currently Active')) && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-[11px] flex items-start gap-2" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#A78BFA" }}>
                    <Target className="w-3 h-3 mt-0.5 shrink-0" />
                    {member.suggestedAction}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Rating", value: member.rating ? `\u2B50 ${member.rating}` : "N/A" },
                    { label: getPeriodLabel(period), value: `${getSessionsForPeriod(member, period)} sessions` },
                    { label: "Avg/Week", value: `${member.avgSessionsPerWeek} sessions` },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-2 rounded-lg" style={{ background: "var(--subtle)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t4)" }}>{stat.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--t1)", fontWeight: 600 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--t3)" }}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Last: {member.lastPlayed}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    <span>Since {member.memberSince}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                  <span className="text-[10px]" style={{ color: "var(--t4)" }}>Prefers: {member.favoriteTime} {"\u2022"} {member.favoriteFormat}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {sentMessages[member.id] ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                        ✓ Sent via {sentMessages[member.id]}
                      </span>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "email", member); }} className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600 }}>
                          <Mail className="w-3 h-3" /> Email
                        </button>
                        <SmsComingSoon />
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* List header */}
          <div
            className="grid items-center px-5 py-3 text-[10px] uppercase tracking-wider"
            style={{
              gridTemplateColumns: "40px 1fr 100px 52px 64px 72px 72px 80px 120px",
              gap: "0 12px",
              color: "var(--t4)",
              fontWeight: 600,
              borderBottom: "1px solid var(--divider)",
            }}
          >
            <span />
            <span>Member</span>
            <span className="hidden md:block">Segment</span>
            <span className="text-center hidden md:block">Rating</span>
            <span className="text-center hidden md:block">Sessions</span>
            <span className="text-right hidden sm:block">Revenue</span>
            <span className="text-center hidden lg:block">Health</span>
            <span className="hidden lg:block">Last Active</span>
            <span />
          </div>
          {paginated.map((member, i) => {
            const seg = segmentConfig[member.segment];
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="grid items-center px-5 py-3 cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns: "40px 1fr 100px 52px 64px 72px 72px 80px 120px",
                  gap: "0 12px",
                  borderBottom: "1px solid var(--divider)",
                }}
                onClick={() => setSelectedPlayerId(member.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs text-white"
                  style={{ background: `linear-gradient(135deg, ${seg.color}, ${seg.color}99)`, fontWeight: 700 }}
                >
                  {member.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate" style={{ fontWeight: 600, color: "var(--heading)" }}>{member.name}</span>
                    {member.trend === "up" && <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />}
                    {member.trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--t4)" }}>{member.sport}</div>
                </div>
                <div className="hidden md:flex flex-wrap gap-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: activityColors[member.activityLevel].bg, color: activityColors[member.activityLevel].text, fontWeight: 600 }}>{activityLabels[member.activityLevel]}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: trendColors[member.engagementTrend].bg, color: trendColors[member.engagementTrend].text, fontWeight: 600 }}>{member.engagementTrend === 'growing' ? '\u2191' : member.engagementTrend === 'declining' ? '\u2193' : member.engagementTrend === 'churning' ? '\u23F8' : '\u2192'}</span>
                </div>
                <div className="text-center text-xs hidden md:block" style={{ color: "var(--t1)", fontWeight: 600 }}>{member.rating}</div>
                <div className="text-center text-xs hidden md:block" style={{ color: "var(--t1)", fontWeight: 600 }}>{getSessionsForPeriod(member, period)}</div>
                <div className="text-right text-xs hidden sm:block" style={{ color: "#10B981", fontWeight: 700 }}>${member.revenue.toLocaleString()}</div>
                <div className="hidden lg:block"><HealthBar score={member.healthScore} /></div>
                <div className="text-[11px] hidden lg:block" style={{ color: "var(--t3)" }}>{member.lastPlayed}</div>
                <div className="flex items-center gap-1.5 justify-end">
                  {sentMessages[member.id] ? (
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>✓ {sentMessages[member.id]}</span>
                  ) : (<>
                  <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "email", member); }} className="px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600 }}>
                    <Mail className="w-3 h-3" /> Email
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "sms", member); }} className="px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                    <Smartphone className="w-3 h-3" /> SMS
                  </button>
                  </>)}
                </div>
              </motion.div>
            );
          })}
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
        <span className="text-xs" style={{ color: "var(--t4)" }}>
          Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} members
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-lg text-xs transition-all"
                  style={{
                    background: page === p ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                    border: `1px solid ${page === p ? "transparent" : "var(--card-border)"}`,
                    color: page === p ? "white" : "var(--t2)",
                    fontWeight: page === p ? 700 : 500,
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
      </>)}
    </motion.div>
  );
}

// ── Save filtered members as Cohort ──
function SaveAsCohortButton({ clubId, memberIds, filterDescription, count }: {
  clubId: string; memberIds: string[]; filterDescription: string; count: number
}) {
  const [saved, setSaved] = useState(false)
  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: () => setSaved(true),
  })

  if (saved) {
    return (
      <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>
        <Check className="w-3.5 h-3.5" /> Cohort saved!
      </div>
    )
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => createMutation.mutate({
        clubId,
        name: `Members: ${filterDescription}`,
        description: `Auto-created from Members filter: ${filterDescription}`,
        filters: [{ field: 'userId', op: 'in' as const, value: memberIds }],
      })}
      disabled={createMutation.isPending}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all"
      style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600, border: 'none', cursor: 'pointer' }}
    >
      {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
      Save as Cohort ({count} members)
    </motion.button>
  )
}
