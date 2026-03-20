'use client'
import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  Users, Search, Heart, Clock,
  CalendarDays, DollarSign, Mail,
  Smartphone, ArrowUpRight, ArrowDownRight, UserPlus,
  Target, LayoutGrid, List,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EmptyStateIQ } from "./EmptyStateIQ";

/* --- Mock Data --- */
const memberGrowth = [
  { month: "Oct", total: 98, new: 12, churned: 4 },
  { month: "Nov", total: 104, new: 14, churned: 8 },
  { month: "Dec", total: 108, new: 10, churned: 6 },
  { month: "Jan", total: 114, new: 15, churned: 9 },
  { month: "Feb", total: 121, new: 16, churned: 9 },
  { month: "Mar", total: 127, new: 14, churned: 8 },
];

const activityDistribution = [
  { range: "0", count: 10 },
  { range: "1-2", count: 18 },
  { range: "3-4", count: 35 },
  { range: "5-6", count: 28 },
  { range: "7-8", count: 22 },
  { range: "9+", count: 14 },
];

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
}

const members: Member[] = [
  { id: "m1", name: "Sarah Mitchell", avatar: "SM", email: "sarah.m@email.com", phone: "+1 (555) 100-2001", rating: 3.8, sport: "Pickleball", segment: "power", healthScore: 95, sessionsThisMonth: 12, totalSessions: 156, memberSince: "Jun 2023", lastPlayed: "Today", revenue: 2840, trend: "up", favoriteTime: "Morning", favoriteFormat: "League" },
  { id: "m2", name: "James Wilson", avatar: "JW", email: "james.w@email.com", phone: "+1 (555) 100-2002", rating: 3.5, sport: "Pickleball", segment: "power", healthScore: 92, sessionsThisMonth: 10, totalSessions: 134, memberSince: "Aug 2023", lastPlayed: "Yesterday", revenue: 2450, trend: "up", favoriteTime: "Evening", favoriteFormat: "Open Play" },
  { id: "m3", name: "Emma Johnson", avatar: "EJ", email: "emma.j@email.com", phone: "+1 (555) 100-2003", rating: 3.2, sport: "Padel", segment: "regular", healthScore: 78, sessionsThisMonth: 6, totalSessions: 89, memberSince: "Oct 2023", lastPlayed: "2 days ago", revenue: 1680, trend: "stable", favoriteTime: "Afternoon", favoriteFormat: "Doubles" },
  { id: "m4", name: "Michael Chen", avatar: "MC", email: "michael.c@email.com", phone: "+1 (555) 100-2004", rating: 2.8, sport: "Pickleball", segment: "regular", healthScore: 72, sessionsThisMonth: 5, totalSessions: 67, memberSince: "Jan 2024", lastPlayed: "3 days ago", revenue: 1120, trend: "stable", favoriteTime: "Morning", favoriteFormat: "Clinic" },
  { id: "m5", name: "Lisa Park", avatar: "LP", email: "lisa.p@email.com", phone: "+1 (555) 100-2005", rating: 3.0, sport: "Tennis", segment: "regular", healthScore: 75, sessionsThisMonth: 5, totalSessions: 72, memberSince: "Dec 2023", lastPlayed: "1 day ago", revenue: 1340, trend: "up", favoriteTime: "Evening", favoriteFormat: "Singles" },
  { id: "m6", name: "David Brown", avatar: "DB", email: "david.b@email.com", phone: "+1 (555) 100-2006", rating: 2.5, sport: "Pickleball", segment: "casual", healthScore: 55, sessionsThisMonth: 2, totalSessions: 28, memberSince: "May 2024", lastPlayed: "8 days ago", revenue: 420, trend: "down", favoriteTime: "Weekend", favoriteFormat: "Open Play" },
  { id: "m7", name: "Anna Garcia", avatar: "AG", email: "anna.g@email.com", phone: "+1 (555) 100-2007", rating: 2.2, sport: "Padel", segment: "casual", healthScore: 48, sessionsThisMonth: 1, totalSessions: 15, memberSince: "Aug 2024", lastPlayed: "12 days ago", revenue: 240, trend: "down", favoriteTime: "Morning", favoriteFormat: "Clinic" },
  { id: "m8", name: "Tom Rivera", avatar: "TR", email: "tom.r@email.com", phone: "+1 (555) 100-2008", rating: 3.4, sport: "Pickleball", segment: "at-risk", healthScore: 28, sessionsThisMonth: 1, totalSessions: 92, memberSince: "Sep 2023", lastPlayed: "18 days ago", revenue: 1780, trend: "down", favoriteTime: "Evening", favoriteFormat: "Round Robin" },
  { id: "m9", name: "Maria Santos", avatar: "MS", email: "maria.s@email.com", phone: "+1 (555) 100-2009", rating: 3.2, sport: "Pickleball", segment: "at-risk", healthScore: 18, sessionsThisMonth: 0, totalSessions: 86, memberSince: "Jan 2024", lastPlayed: "42 days ago", revenue: 1240, trend: "down", favoriteTime: "Morning", favoriteFormat: "League" },
  { id: "m10", name: "Kevin Lee", avatar: "KL", email: "kevin.l@email.com", phone: "+1 (555) 100-2010", rating: 2.6, sport: "Tennis", segment: "critical", healthScore: 8, sessionsThisMonth: 0, totalSessions: 34, memberSince: "Mar 2024", lastPlayed: "65 days ago", revenue: 560, trend: "down", favoriteTime: "Afternoon", favoriteFormat: "Singles" },
  { id: "m11", name: "Rachel Kim", avatar: "RK", email: "rachel.k@email.com", phone: "+1 (555) 100-2011", rating: 3.6, sport: "Pickleball", segment: "power", healthScore: 88, sessionsThisMonth: 9, totalSessions: 112, memberSince: "Jul 2023", lastPlayed: "Today", revenue: 2200, trend: "up", favoriteTime: "Morning", favoriteFormat: "Tournament" },
  { id: "m12", name: "Chris Taylor", avatar: "CT", email: "chris.t@email.com", phone: "+1 (555) 100-2012", rating: 2.9, sport: "Padel", segment: "regular", healthScore: 68, sessionsThisMonth: 4, totalSessions: 48, memberSince: "Feb 2024", lastPlayed: "4 days ago", revenue: 860, trend: "stable", favoriteTime: "Evening", favoriteFormat: "Doubles" },
];

const segmentConfig: Record<Exclude<Segment, "all">, { color: string; bg: string; label: string; tooltip: string }> = {
  power: { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", label: "Power Player", tooltip: "4+ sessions/week, health score 80+" },
  regular: { color: "#06B6D4", bg: "rgba(6,182,212,0.1)", label: "Regular", tooltip: "2-3 sessions/week, consistent attendance" },
  casual: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Casual", tooltip: "1 session/week or less, still active" },
  "at-risk": { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "At-Risk", tooltip: "Declining frequency, health score 25-49" },
  critical: { color: "#EF4444", bg: "rgba(239,68,68,0.1)", label: "Critical", tooltip: "Health score below 25, immediate attention needed" },
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
  }));
}

export function MembersIQ({ memberHealthData, memberGrowthData, isLoading: externalLoading, sendOutreach, clubId }: MembersIQProps = {}) {
  const { isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<Segment>("all");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "health" | "revenue" | "sessions">("health");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<string, string>>({});
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

  const isDemo = typeof window !== 'undefined' && (window.location.search.includes('demo=true') || window.location.hostname === 'demo.iqsport.ai');

  // Use real data if available, otherwise fall back to mocks (only in demo mode)
  const realMembers = mapRealMembers(memberHealthData);
  const allMembers = realMembers.length > 0 ? realMembers : (isDemo ? members : []);

  // Member growth chart — from real data or mocks
  const displayMemberGrowth = memberGrowthData?.growth?.length
    ? memberGrowthData.growth.map((g: any) => ({
        month: new Date(g.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        total: g.total, new: g.new, churned: g.churned,
      }))
    : (isDemo ? memberGrowth : []);

  // Activity distribution — derive from real member sessions data
  const displayActivityDistribution = realMembers.length > 0
    ? (() => {
        const ranges = [{ range: "0", min: 0, max: 0 }, { range: "1-2", min: 1, max: 2 }, { range: "3-4", min: 3, max: 4 }, { range: "5-6", min: 5, max: 6 }, { range: "7-8", min: 7, max: 8 }, { range: "9+", min: 9, max: 999 }];
        return ranges.map(r => ({ range: r.range, count: realMembers.filter((m: any) => m.sessionsThisMonth >= r.min && m.sessionsThisMonth <= r.max).length }));
      })()
    : activityDistribution;

  const filtered = allMembers
    .filter((m) => {
      if (segmentFilter !== "all" && m.segment !== segmentFilter) return false;
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

  const activeMember = allMembers.find((m) => m.id === selectedMember);

  const hasData = allMembers.length > 0;
  if (!hasData && !isDemo) {
    return <EmptyStateIQ icon={Users} title="No members yet" description="Import session data with player names to track member health, engagement, and retention." ctaLabel="Import Data" ctaHref={clubId ? `/clubs/${clubId}/intelligence` : undefined} />;
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

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const total = allMembers.length;
          const avgHealth = total > 0 ? Math.round(allMembers.reduce((s, m) => s + m.healthScore, 0) / total) : 0;
          const activeCount = allMembers.filter(m => m.sessionsThisMonth > 0).length;
          const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;
          const totalRev = allMembers.reduce((s, m) => s + m.revenue, 0);
          const avgRev = total > 0 ? Math.round(totalRev / total) : 0;
          return [
            { label: "Total Members", value: String(total), change: `${total} tracked`, icon: Users, gradient: "from-violet-500 to-purple-600" },
            { label: "Avg Health Score", value: String(avgHealth), change: "current period", icon: Heart, gradient: "from-emerald-500 to-green-500" },
            { label: "Active This Week", value: String(activeCount), change: `${activePct}% of total`, icon: Target, gradient: "from-cyan-500 to-teal-500" },
            { label: "Avg Revenue/Member", value: `$${avgRev}`, change: "current period", icon: DollarSign, gradient: "from-amber-500 to-orange-500" },
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

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
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
      </div>

      {/* Filters + Table */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", minWidth: 240 }}>
            <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
            <input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full"
              style={{ color: "var(--t1)" }}
            />
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {(["all", "power", "regular", "casual", "at-risk", "critical"] as Segment[]).map((s) => (
              <button
                key={s}
                onClick={() => setSegmentFilter(s)}
                className="px-3 py-2 text-[11px] capitalize transition-all"
                style={{
                  background: segmentFilter === s ? "var(--pill-active)" : "transparent",
                  color: segmentFilter === s ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                  fontWeight: segmentFilter === s ? 600 : 500,
                }}
              >
                {s === "at-risk" ? "At-Risk" : s === "critical" ? "Critical" : s}
              </button>
            ))}
          </div>
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

      {/* Member Grid */}
      {viewMode === "grid" ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="cursor-pointer transition-all hover:scale-[1.02]">
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-sm text-white shrink-0"
                    style={{ background: `linear-gradient(135deg, ${segmentConfig[member.segment].color}, ${segmentConfig[member.segment].color}99)`, fontWeight: 700 }}
                  >
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate" style={{ fontWeight: 700, color: "var(--heading)" }}>{member.name}</span>
                      {member.trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
                      {member.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <SegmentBadge segment={member.segment} />
                      <span className="text-[10px]" style={{ color: "var(--t4)" }}>{member.sport}</span>
                    </div>
                  </div>
                  <HealthBar score={member.healthScore} />
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Rating", value: `\u2B50 ${member.rating}` },
                    { label: getPeriodLabel(period), value: `${getSessionsForPeriod(member, period)} sessions` },
                    { label: "Revenue", value: `$${member.revenue.toLocaleString()}` },
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
                        <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "sms", member); }} className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                          <Smartphone className="w-3 h-3" /> SMS
                        </button>
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
          {filtered.map((member, i) => {
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
                <div className="hidden md:block"><SegmentBadge segment={member.segment} /></div>
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

      {/* Summary */}
      <div className="text-center text-xs py-4" style={{ color: "var(--t4)" }}>
        Showing {filtered.length} of {allMembers.length} members
      </div>
    </motion.div>
  );
}
