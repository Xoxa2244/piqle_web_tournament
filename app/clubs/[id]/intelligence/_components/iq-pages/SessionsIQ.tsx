'use client'
import React, { useState, useRef, useMemo } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  CalendarDays, Clock, Users, TrendingUp, Filter, Search,
  ChevronDown, ChevronUp, MapPin, Star, Zap, ArrowUpRight, ArrowDownRight,
  BarChart3, Eye, Lightbulb, UserPlus, X, Mail, Smartphone, Bell, Send, Check,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EventsIQ } from "./EventsIQ";
import { EmptyStateIQ } from "./EmptyStateIQ";

/* --- Mock Data --- */
const weeklyData = [
  { day: "Mon", sessions: 18, occupancy: 52, revenue: 1240 },
  { day: "Tue", sessions: 14, occupancy: 38, revenue: 980 },
  { day: "Wed", sessions: 22, occupancy: 65, revenue: 1580 },
  { day: "Thu", sessions: 20, occupancy: 58, revenue: 1420 },
  { day: "Fri", sessions: 26, occupancy: 78, revenue: 1860 },
  { day: "Sat", sessions: 32, occupancy: 92, revenue: 2440 },
  { day: "Sun", sessions: 28, occupancy: 85, revenue: 2100 },
];

const hourlyPattern = [
  { time: "6AM", avg: 15 }, { time: "7AM", avg: 28 }, { time: "8AM", avg: 45 },
  { time: "9AM", avg: 62 }, { time: "10AM", avg: 78 }, { time: "11AM", avg: 72 },
  { time: "12PM", avg: 65 }, { time: "1PM", avg: 58 }, { time: "2PM", avg: 52 },
  { time: "3PM", avg: 70 }, { time: "4PM", avg: 85 }, { time: "5PM", avg: 92 },
  { time: "6PM", avg: 88 }, { time: "7PM", avg: 75 }, { time: "8PM", avg: 60 },
  { time: "9PM", avg: 42 }, { time: "10PM", avg: 25 },
];

const formatBreakdown = [
  { format: "Open Play", sessions: 45, pct: 32, revenue: 3200, trend: "+5%", up: true },
  { format: "League Match", sessions: 28, pct: 20, revenue: 4800, trend: "+12%", up: true },
  { format: "Private Lesson", sessions: 22, pct: 16, revenue: 5500, trend: "+8%", up: true },
  { format: "Round Robin", sessions: 18, pct: 13, revenue: 2100, trend: "-3%", up: false },
  { format: "Clinic", sessions: 15, pct: 11, revenue: 1800, trend: "+15%", up: true },
  { format: "Tournament", sessions: 12, pct: 8, revenue: 3600, trend: "+22%", up: true },
];

const recentSessions = [
  { id: "S-1849", court: "Court 2", format: "Open Play", date: "Tomorrow, 9:00 AM", players: 4, maxPlayers: 8, duration: "90 min", revenue: 60, status: "upcoming" },
  { id: "S-1848", court: "Court 1", format: "Clinic", date: "Tomorrow, 11:00 AM", players: 6, maxPlayers: 12, duration: "120 min", revenue: 150, status: "upcoming" },
  { id: "S-1847", court: "Court 1", format: "Open Play", date: "Today, 2:00 PM", players: 8, maxPlayers: 8, duration: "90 min", revenue: 120, status: "active" },
  { id: "S-1846", court: "Court 2", format: "League Match", date: "Today, 1:00 PM", players: 4, maxPlayers: 4, duration: "60 min", revenue: 200, status: "active" },
  { id: "S-1845", court: "Court 3", format: "Private Lesson", date: "Today, 12:00 PM", players: 2, maxPlayers: 2, duration: "60 min", revenue: 85, status: "completed" },
  { id: "S-1844", court: "Court 1", format: "Clinic", date: "Today, 10:00 AM", players: 10, maxPlayers: 12, duration: "120 min", revenue: 300, status: "completed" },
  { id: "S-1843", court: "Court 4", format: "Round Robin", date: "Today, 9:00 AM", players: 12, maxPlayers: 16, duration: "120 min", revenue: 180, status: "completed" },
  { id: "S-1842", court: "Court 2", format: "Open Play", date: "Yesterday, 6:00 PM", players: 6, maxPlayers: 8, duration: "90 min", revenue: 90, status: "completed" },
  { id: "S-1841", court: "Court 3", format: "Tournament", date: "Yesterday, 2:00 PM", players: 16, maxPlayers: 16, duration: "180 min", revenue: 640, status: "completed" },
  { id: "S-1840", court: "Court 1", format: "League Match", date: "Yesterday, 12:00 PM", players: 4, maxPlayers: 4, duration: "60 min", revenue: 200, status: "completed" },
];

/* AI insights per session */
const sessionInsights: Record<string, { fillRate: number; insight: string; suggestedPlayers: string[]; revenuePerPlayer: number; tip: string }> = {
  "S-1849": { fillRate: 50, insight: "4 spots open. 6 members with morning preferences haven't booked yet.", suggestedPlayers: ["Emma W.", "Jake R.", "Lisa K.", "Tom B."], revenuePerPlayer: 15, tip: "Morning open play fills 85% on average — send invites now to hit that target." },
  "S-1848": { fillRate: 50, insight: "6 spots open. Popular clinic format — usually fills to 90%.", suggestedPlayers: ["Sarah D.", "Mike C.", "Anna M.", "Chris L.", "Diana P."], revenuePerPlayer: 25, tip: "Clinic attendees convert to regulars at 3x rate. Worth a targeted push." },
  "S-1847": { fillRate: 100, insight: "Fully booked — consider adding a second Open Play slot at this time.", suggestedPlayers: [], revenuePerPlayer: 15, tip: "High demand detected. 3 waitlisted players last week at this time." },
  "S-1846": { fillRate: 100, insight: "League match always fills. Revenue per player is 2x open play.", suggestedPlayers: [], revenuePerPlayer: 50, tip: "Consider premium pricing for league slots." },
  "S-1845": { fillRate: 100, insight: "Private lesson completed with full attendance.", suggestedPlayers: [], revenuePerPlayer: 42.5, tip: "Student has booked 8 lessons this month — offer a package deal." },
  "S-1844": { fillRate: 83, insight: "2 empty spots. 5 members with matching preferences were available.", suggestedPlayers: ["Maria K.", "Alex T.", "Jordan P."], revenuePerPlayer: 25, tip: "Auto-invite could have filled this session and added $50 revenue." },
  "S-1843": { fillRate: 75, insight: "4 spots unfilled. Format is losing popularity on mornings.", suggestedPlayers: ["Sam R.", "Nina L.", "Chris B.", "Tanya M."], revenuePerPlayer: 11.25, tip: "Try moving Round Robin to afternoon — 82% fill rate at 3PM." },
  "S-1842": { fillRate: 75, insight: "2 spots unfilled. 3 members canceled within 2 hours of start.", suggestedPlayers: ["Liam N.", "Priya S."], revenuePerPlayer: 15, tip: "Late cancellations cost $30. Consider a cancellation fee policy." },
  "S-1841": { fillRate: 100, insight: "Tournament fully booked. Highest revenue session this week.", suggestedPlayers: [], revenuePerPlayer: 40, tip: "Waitlist of 4 — consider expanding to 20 players next time." },
  "S-1840": { fillRate: 100, insight: "League match consistent at 100% fill rate.", suggestedPlayers: [], revenuePerPlayer: 50, tip: "3rd consecutive full league match. Add another weekly league slot." },
};

const allFormats = ["Open Play", "League Match", "Private Lesson", "Round Robin", "Clinic", "Tournament"];
const allCourts = ["Court 1", "Court 2", "Court 3", "Court 4"];
const allStatuses = ["upcoming", "active", "completed", "cancelled"];

const courtStats = [
  { name: "Court 1", occupancy: 72, sessions: 42, revenue: 3800, sport: "Pickleball" },
  { name: "Court 2", occupancy: 65, sessions: 38, revenue: 3200, sport: "Pickleball" },
  { name: "Court 3", occupancy: 58, sessions: 34, revenue: 2900, sport: "Padel" },
  { name: "Court 4", occupancy: 48, sessions: 28, revenue: 2100, sport: "Tennis" },
];

/* --- Map real calendarData to SessionsIQ format --- */
type RealSession = { id: string; date: string; startTime: string; endTime: string; court: string; format: string; registered: number; capacity: number; occupancy: number; pricePerPlayer: number | null; revenue: number | null; status: 'past' | 'today' | 'upcoming'; recommendations: any[] };

function mapCalendarToSessions(calendarData: any): typeof recentSessions {
  if (!calendarData?.sessions?.length) return [];
  const now = new Date();
  return calendarData.sessions
    .sort((a: RealSession, b: RealSession) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return db.getTime() - da.getTime();
    })
    .slice(0, 20)
    .map((s: RealSession, i: number) => {
      const dt = new Date(`${s.date}T${s.startTime}`);
      const diff = Math.round((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (diff === 0) dateStr = `Today, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      else if (diff === 1) dateStr = `Tomorrow, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      else if (diff === -1) dateStr = `Yesterday, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      else dateStr += `, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

      const status = s.status === 'past' ? 'completed' : s.status === 'today' ? 'active' : 'upcoming';
      const durationMin = (() => {
        try {
          const [sh, sm] = s.startTime.split(':').map(Number);
          const [eh, em] = s.endTime.split(':').map(Number);
          return (eh * 60 + em) - (sh * 60 + sm);
        } catch { return 60; }
      })();

      return {
        id: s.id || `S-${1000 + i}`,
        court: s.court,
        format: s.format,
        date: dateStr,
        players: s.registered,
        maxPlayers: s.capacity,
        duration: `${durationMin} min`,
        revenue: s.revenue ?? 0,
        status,
      };
    });
}

function deriveWeeklyData(calendarData: any) {
  if (!calendarData?.sessions?.length) return [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets: Record<string, { count: number; occSum: number; revSum: number }> = {};
  days.forEach(d => buckets[d] = { count: 0, occSum: 0, revSum: 0 });
  calendarData.sessions.forEach((s: RealSession) => {
    const d = days[new Date(s.date).getDay()];
    if (buckets[d]) { buckets[d].count++; buckets[d].occSum += s.occupancy; buckets[d].revSum += s.revenue ?? 0; }
  });
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
    day,
    sessions: buckets[day].count,
    occupancy: buckets[day].count > 0 ? Math.round(buckets[day].occSum / buckets[day].count) : 0,
    revenue: Math.round(buckets[day].revSum),
  }));
}

function deriveFormatBreakdown(calendarData: any) {
  if (!calendarData?.sessions?.length) return [];
  const buckets: Record<string, { sessions: number; revenue: number }> = {};
  calendarData.sessions.forEach((s: RealSession) => {
    if (!buckets[s.format]) buckets[s.format] = { sessions: 0, revenue: 0 };
    buckets[s.format].sessions++;
    buckets[s.format].revenue += s.revenue ?? 0;
  });
  const total = Object.values(buckets).reduce((s, b) => s + b.sessions, 0);
  return Object.entries(buckets)
    .sort(([, a], [, b]) => b.sessions - a.sessions)
    .map(([format, data]) => ({
      format,
      sessions: data.sessions,
      pct: Math.round((data.sessions / total) * 100),
      revenue: Math.round(data.revenue),
      trend: "+0%",
      up: true,
    }));
}

function deriveCourtStats(calendarData: any) {
  if (!calendarData?.sessions?.length) return [];
  const buckets: Record<string, { sessions: number; occSum: number; revSum: number }> = {};
  calendarData.sessions.forEach((s: RealSession) => {
    if (!buckets[s.court]) buckets[s.court] = { sessions: 0, occSum: 0, revSum: 0 };
    buckets[s.court].sessions++;
    buckets[s.court].occSum += s.occupancy;
    buckets[s.court].revSum += s.revenue ?? 0;
  });
  return Object.entries(buckets)
    .sort(([, a], [, b]) => b.sessions - a.sessions)
    .map(([name, data]) => ({
      name,
      occupancy: Math.round(data.occSum / data.sessions),
      sessions: data.sessions,
      revenue: Math.round(data.revSum),
      sport: "Pickleball",
    }));
}

function deriveHourlyPattern(calendarData: any) {
  if (!calendarData?.sessions?.length) return [];
  const times = ['6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM'];
  const buckets: Record<string, { sum: number; count: number }> = {};
  times.forEach(t => { buckets[t] = { sum: 0, count: 0 }; });
  calendarData.sessions.forEach((s: RealSession) => {
    const hour = parseInt(s.startTime?.split(':')[0] || '0');
    const label = hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`;
    if (buckets[label]) { buckets[label].sum += s.occupancy; buckets[label].count++; }
  });
  return times.map(t => ({ time: t, avg: buckets[t].count > 0 ? Math.round(buckets[t].sum / buckets[t].count) : 0 }));
}

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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    upcoming: { bg: "rgba(6,182,212,0.1)", text: "#22D3EE", dot: "#06B6D4" },
    active: { bg: "rgba(16,185,129,0.1)", text: "#10B981", dot: "#10B981" },
    completed: { bg: "rgba(139,92,246,0.1)", text: "#A78BFA", dot: "#8B5CF6" },
    cancelled: { bg: "rgba(239,68,68,0.1)", text: "#F87171", dot: "#EF4444" },
  };
  const c = colors[status] || colors.completed;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] capitalize" style={{ background: c.bg, color: c.text, fontWeight: 600 }}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

/* ============================================= */
/*              SESSIONS PAGE                     */
/* ============================================= */
export function SessionsIQ({ initialTab, calendarData, isLoading: externalLoading, clubId, aiEvents, eventsList }: { initialTab?: "analytics" | "list" | "events"; calendarData?: any; isLoading?: boolean; clubId?: string; aiEvents?: any[]; eventsList?: any } = {}) {
  const { isDark } = useTheme();
  const [view, setView] = useState<"list" | "analytics">(initialTab === "events" ? "analytics" : (initialTab || "analytics"));
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterFormat, setFilterFormat] = useState<string>("");
  const [filterCourt, setFilterCourt] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sentInvites, setSentInvites] = useState<Record<string, string>>({}); // "playerName" -> "email"|"sms"
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const activeFilterCount = [filterFormat, filterCourt, filterStatus].filter(Boolean).length;

  // Use real data — no mock fallback for real clubs
  const isDemo = typeof window !== 'undefined' && (window.location.search.includes('demo=true') || window.location.hostname === 'demo.iqsport.ai');


  // Cache last successful data to prevent empty-state flash on re-fetch
  const lastGoodData = useRef<{ sessions: any[]; weekly: any[]; formats: any[]; courts: any[]; hourly: any[] }>({ sessions: [], weekly: [], formats: [], courts: [], hourly: [] });

  const realSessions = useMemo(() => {
    const mapped = mapCalendarToSessions(calendarData);
    if (mapped.length > 0) lastGoodData.current.sessions = mapped;
    return mapped.length > 0 ? mapped : lastGoodData.current.sessions;
  }, [calendarData]);
  const displaySessions = realSessions.length > 0 ? realSessions : (isDemo ? recentSessions : []);
  // hasData: true when we have sessions to display, OR calendarData was fetched and has at least 1 session
  const hasData = displaySessions.length > 0
    || (calendarData != null && Array.isArray(calendarData.sessions) && calendarData.sessions.length > 0);

  const derivedWeekly = useMemo(() => {
    const d = deriveWeeklyData(calendarData);
    if (d.length > 0) lastGoodData.current.weekly = d;
    return d.length > 0 ? d : lastGoodData.current.weekly;
  }, [calendarData]);
  const displayWeekly = derivedWeekly.length > 0 ? derivedWeekly : (isDemo ? weeklyData : []);

  const derivedFormats = useMemo(() => {
    const d = deriveFormatBreakdown(calendarData);
    if (d.length > 0) lastGoodData.current.formats = d;
    return d.length > 0 ? d : lastGoodData.current.formats;
  }, [calendarData]);
  const displayFormats = derivedFormats.length > 0 ? derivedFormats : (isDemo ? formatBreakdown : []);

  const derivedCourts = useMemo(() => {
    const d = deriveCourtStats(calendarData);
    if (d.length > 0) lastGoodData.current.courts = d;
    return d.length > 0 ? d : lastGoodData.current.courts;
  }, [calendarData]);
  const displayCourts = derivedCourts.length > 0 ? derivedCourts : (isDemo ? courtStats : []);

  const derivedHourly = useMemo(() => {
    const d = deriveHourlyPattern(calendarData);
    if (d.length > 0) lastGoodData.current.hourly = d;
    return d.length > 0 ? d : lastGoodData.current.hourly;
  }, [calendarData]);
  const displayHourly = derivedHourly.length > 0 ? derivedHourly : (isDemo ? hourlyPattern : []);

  const filteredSessions = useMemo(() => {
    return displaySessions.filter((s) => {
      const matchesSearch =
        s.court.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.format.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFormat = !filterFormat || s.format === filterFormat;
      const matchesCourt = !filterCourt || s.court === filterCourt;
      const matchesStatus = !filterStatus || s.status === filterStatus;
      return matchesSearch && matchesFormat && matchesCourt && matchesStatus;
    });
  }, [displaySessions, searchQuery, filterFormat, filterCourt, filterStatus]);

  // Only show empty state if we have a definitive "no data" signal:
  // calendarData must have been loaded (not undefined) and contain no sessions,
  // AND we're not currently loading, AND we're not in demo mode.
  const definitelyEmpty = calendarData !== undefined && !hasData;
  if (definitelyEmpty && !isDemo && !externalLoading) {
    return <EmptyStateIQ icon={CalendarDays} title="No sessions yet" description="Import your session history to see analytics, fill rates, and AI recommendations for optimizing your schedule." ctaLabel="Import Data" ctaHref={`/clubs/${clubId || ''}/intelligence`} />;
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
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Sessions & Events</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Manage recurring sessions and special events</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {(["analytics", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-4 py-2 text-xs capitalize transition-all"
                style={{
                  background: view === v ? "var(--pill-active)" : "transparent",
                  color: view === v ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                  fontWeight: view === v ? 600 : 500,
                }}
              >
                {v === "analytics" ? "Analytics" : "All Sessions"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "analytics" ? (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Sessions", value: "160", change: "+11%", up: true, icon: CalendarDays, gradient: "from-violet-500 to-purple-600" },
              { label: "Avg Occupancy", value: "62%", change: "+3.1%", up: true, icon: BarChart3, gradient: "from-cyan-500 to-teal-500" },
              { label: "Session Revenue", value: "$12.6K", change: "+8.4%", up: true, icon: TrendingUp, gradient: "from-emerald-500 to-green-500" },
              { label: "Peak Utilization", value: "92%", change: "+5%", up: true, icon: Zap, gradient: "from-amber-500 to-orange-500" },
            ].map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs" style={{ color: "var(--t3)" }}>{kpi.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--heading)" }}>{kpi.value}</div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${kpi.up ? "text-emerald-400" : "text-red-400"}`} style={{ fontWeight: 600 }}>
                      {kpi.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {kpi.change} vs last period
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Weekly Sessions Bar */}
            <Card>
              <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Weekly Sessions</h3>
              {displayWeekly.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayWeekly}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
                      <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="sessions" name="Sessions" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>No data for this period</div>
              )}
            </Card>

            {/* Hourly Pattern */}
            <Card>
              <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Hourly Occupancy Pattern</h3>
              {displayHourly.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayHourly}>
                      <defs>
                        <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="time" stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} interval={2} />
                      <YAxis stroke="var(--chart-axis)" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="avg" name="Avg Occupancy" stroke="#06B6D4" fill="url(#hourGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>No data for this period</div>
              )}
            </Card>
          </div>

          {/* Format Breakdown + Court Stats */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Format Breakdown */}
            <Card>
              <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Format Breakdown</h3>
              <div className="space-y-3">
                {displayFormats.map((f) => (
                  <div key={f.format} className="flex items-center gap-4">
                    <div className="w-28 text-xs truncate" style={{ color: "var(--t2)", fontWeight: 500 }}>{f.format}</div>
                    <div className="flex-1">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #8B5CF6, #06B6D4)", width: `${f.pct}%` }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${f.pct}%` }}
                          transition={{ duration: 0.8, delay: 0.1 }}
                          viewport={{ once: true }}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-right w-12" style={{ color: "var(--t1)", fontWeight: 600 }}>{f.sessions}</div>
                    <div className="text-xs text-right w-14" style={{ color: "var(--t3)" }}>${f.revenue.toLocaleString()}</div>
                    <div className={`text-xs w-10 text-right ${f.up ? "text-emerald-400" : "text-red-400"}`} style={{ fontWeight: 600 }}>{f.trend}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Court Stats */}
            <Card>
              <h3 className="mb-4" style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Court Performance</h3>
              <div className="space-y-3">
                {displayCourts.map((court) => (
                  <div
                    key={court.name}
                    className="flex items-center gap-4 p-3 rounded-xl transition-colors"
                    style={{ background: "var(--subtle)" }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--pill-active)" }}>
                      <MapPin className="w-5 h-5" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ fontWeight: 600, color: "var(--heading)" }}>{court.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--badge-bg)", color: "var(--t3)" }}>{court.sport}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "var(--t3)" }}>
                        <span>{court.sessions} sessions</span>
                        <span>${court.revenue.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div style={{ fontSize: "18px", fontWeight: 700, color: court.occupancy >= 70 ? "#10B981" : court.occupancy >= 50 ? "#F59E0B" : "#EF4444" }}>
                        {court.occupancy}%
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--t4)" }}>occupancy</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Events Section */}
          <EventsIQ embedded />
        </>
      ) : (
        /* Session List View */
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 max-w-sm"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
            >
              <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
              <input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full"
                style={{ color: "var(--t1)" }}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-colors"
              style={{
                background: showFilters || activeFilterCount > 0 ? "var(--pill-active)" : "var(--subtle)",
                border: "1px solid var(--card-border)",
                color: showFilters || activeFilterCount > 0 ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: 500,
              }}
            >
              <Filter className="w-4 h-4" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterFormat(""); setFilterCourt(""); setFilterStatus(""); }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs transition-colors"
                style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", fontWeight: 500 }}
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <Card>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { label: "Format", value: filterFormat, setter: setFilterFormat, options: allFormats },
                      { label: "Court", value: filterCourt, setter: setFilterCourt, options: allCourts },
                      { label: "Status", value: filterStatus, setter: setFilterStatus, options: allStatuses },
                    ].map((f) => (
                      <div key={f.label} className="flex flex-col gap-1.5">
                        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>{f.label}</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {f.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => f.setter(f.value === opt ? "" : opt)}
                              className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
                              style={{
                                background: f.value === opt ? "var(--pill-active)" : "var(--subtle)",
                                color: f.value === opt ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                                fontWeight: f.value === opt ? 600 : 400,
                                border: f.value === opt ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                    {["Session ID", "Court", "Format", "Date / Time", "Players", "Duration", "Revenue", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((s, i) => {
                    const isExpanded = expandedId === s.id;
                    const insights = sessionInsights[s.id];
                    const fillPct = Math.round((s.players / s.maxPlayers) * 100);
                    return (
                      <React.Fragment key={s.id}>
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="cursor-pointer transition-colors align-top"
                          style={{
                            borderBottom: isExpanded ? "none" : "1px solid var(--divider)",
                            background: isExpanded ? "var(--subtle)" : undefined,
                          }}
                          onClick={() => setExpandedId(isExpanded ? null : s.id)}
                          onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "var(--row-hover)"; }}
                          onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = isExpanded ? "var(--subtle)" : "transparent"; }}
                        >
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)", fontWeight: 600 }}>
                            <div className="flex items-center gap-1.5">
                              <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--t4)" }} />
                              </motion.div>
                              {s.id}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>{s.court}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>{s.format}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t3)" }}>{s.date}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t2)" }}>
                            <div className="flex items-center gap-2">
                              <span>{s.players}/{s.maxPlayers}</span>
                              <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${fillPct}%`,
                                    background: fillPct === 100 ? "#10B981" : fillPct >= 75 ? "#F59E0B" : "#EF4444",
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t3)" }}>{s.duration}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t1)", fontWeight: 600 }}>${s.revenue}</td>
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                        </motion.tr>
                        {isExpanded && insights && (
                          <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                            <td colSpan={8} className="p-0" style={{ background: "var(--subtle)" }}>
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="px-6 py-4 space-y-4">
                                  {/* Fill Rate Bar */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs" style={{ color: "var(--t3)", fontWeight: 600 }}>Fill Rate</span>
                                      <span className="text-xs" style={{ color: fillPct === 100 ? "#10B981" : fillPct >= 75 ? "#F59E0B" : "#EF4444", fontWeight: 700 }}>{fillPct}%</span>
                                    </div>
                                    <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--card-bg)" }}>
                                      <motion.div
                                        className="h-full rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${fillPct}%` }}
                                        transition={{ duration: 0.6, ease: "easeOut" }}
                                        style={{
                                          background: fillPct === 100
                                            ? "linear-gradient(90deg, #10B981, #34D399)"
                                            : fillPct >= 75
                                              ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
                                              : "linear-gradient(90deg, #EF4444, #F87171)",
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between mt-1.5">
                                      <span className="text-[11px]" style={{ color: "var(--t4)" }}>{s.players} of {s.maxPlayers} players</span>
                                      <span className="text-[11px]" style={{ color: "var(--t4)" }}>${insights.revenuePerPlayer}/player</span>
                                    </div>
                                  </div>

                                  {/* AI Insights */}
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="p-3 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
                                          <Lightbulb className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} />
                                        </div>
                                        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>AI Insight</span>
                                      </div>
                                      <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{insights.insight}</p>
                                    </div>
                                    <div className="p-3 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,182,212,0.15)" }}>
                                          <Zap className="w-3.5 h-3.5" style={{ color: "#22D3EE" }} />
                                        </div>
                                        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>Recommendation</span>
                                      </div>
                                      <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{insights.tip}</p>
                                    </div>
                                  </div>

                                  {/* Suggested Players with Invite Actions — only for non-completed sessions */}
                                  {insights.suggestedPlayers.length > 0 && s.status !== "completed" && (
                                    <div className="p-3 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                                            <UserPlus className="w-3.5 h-3.5" style={{ color: "#34D399" }} />
                                          </div>
                                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>Invite Players to Fill</span>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newInvites = { ...sentInvites };
                                            insights.suggestedPlayers.forEach((name) => { if (!newInvites[name]) newInvites[name] = "email"; });
                                            setSentInvites(newInvites);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                                          style={{
                                            background: "linear-gradient(135deg, #8B5CF6, #06B6D4)",
                                            color: "#fff",
                                            fontWeight: 600,
                                          }}
                                        >
                                          <Send className="w-3 h-3" />
                                          Invite All via Email
                                        </button>
                                      </div>
                                      <div className="space-y-2">
                                        {insights.suggestedPlayers.map((name) => {
                                          const inviteKey = name;
                                          const isSent = !!sentInvites[inviteKey];
                                          return (
                                            <div
                                              key={name}
                                              className="flex items-center justify-between p-2.5 rounded-xl"
                                              style={{ background: "var(--subtle)" }}
                                            >
                                              <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px]" style={{ background: "linear-gradient(135deg, #8B5CF622, #8B5CF644)", color: "#8B5CF6", fontWeight: 700 }}>
                                                  {name.split(" ").map((n) => n[0]).join("")}
                                                </div>
                                                <span className="text-xs" style={{ color: "var(--t1)", fontWeight: 500 }}>{name}</span>
                                                {isSent && (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                                                    <Check className="w-3 h-3" />
                                                    Sent via {sentInvites[inviteKey]}
                                                  </span>
                                                )}
                                              </div>
                                              {!isSent && (
                                                <div className="flex items-center gap-1.5">
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setSentInvites((prev) => ({ ...prev, [inviteKey]: "email" })); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                                                    style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600, border: "1px solid rgba(139,92,246,0.2)" }}
                                                  >
                                                    <Mail className="w-3 h-3" />
                                                    Email
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setSentInvites((prev) => ({ ...prev, [inviteKey]: "sms" })); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                                                    style={{ background: "rgba(6,182,212,0.15)", color: "#22D3EE", fontWeight: 600, border: "1px solid rgba(6,182,212,0.2)" }}
                                                  >
                                                    <Smartphone className="w-3 h-3" />
                                                    SMS
                                                  </button>
                                                  <span
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]"
                                                    style={{ color: "var(--t4)", fontWeight: 500 }}
                                                  >
                                                    <Bell className="w-3 h-3" />
                                                    Push
                                                    <span className="text-[9px] ml-0.5" style={{ color: "var(--t4)", opacity: 0.6 }}>soon</span>
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

    </motion.div>
  );
}
