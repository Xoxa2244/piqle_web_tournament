'use client'
import React, { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  CalendarDays, Users, Filter, Search,
  ChevronDown, MapPin, Zap,
  BarChart3, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EventsIQ } from "./EventsIQ";
import { EmptyStateIQ } from "./EmptyStateIQ";

/* --- Filter options (used for dropdown filters in session list) --- */

const allFormats = ["Open Play", "League Match", "Private Lesson", "Round Robin", "Clinic", "Tournament"];
const allCourts = ["Court 1", "Court 2", "Court 3", "Court 4"];
const allStatuses = ["upcoming", "active", "completed", "cancelled"];


/* --- Map real calendarData to SessionsIQ format --- */
type RealSession = { id: string; date: string; startTime: string; endTime: string; court: string; format: string; registered: number; capacity: number; occupancy: number; pricePerPlayer: number | null; revenue: number | null; status: 'past' | 'today' | 'upcoming'; recommendations: any[] };

type MappedSession = { id: string; court: string; format: string; date: string; players: number; maxPlayers: number; duration: string; revenue: number; status: string };

function mapCalendarToSessions(calendarData: any): MappedSession[] {
  if (!calendarData?.sessions?.length) return [];
  const now = new Date();
  return calendarData.sessions
    .sort((a: RealSession, b: RealSession) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return db.getTime() - da.getTime();
    })
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
  const buckets: Record<string, { sessions: number; totalPlayers: number }> = {};
  calendarData.sessions.forEach((s: RealSession) => {
    if (!buckets[s.format]) buckets[s.format] = { sessions: 0, totalPlayers: 0 };
    buckets[s.format].sessions++;
    buckets[s.format].totalPlayers += s.registered || 0;
  });
  const total = Object.values(buckets).reduce((s, b) => s + b.sessions, 0);
  return Object.entries(buckets)
    .sort(([, a], [, b]) => b.sessions - a.sessions)
    .map(([format, data]) => ({
      format,
      sessions: data.sessions,
      pct: Math.round((data.sessions / total) * 100),
      revenue: data.totalPlayers, // reusing field — shows players not $
      trend: "+0%",
      up: true,
    }));
}

function deriveCourtStats(calendarData: any) {
  if (!calendarData?.sessions?.length) return [];
  const OPEN = 6, CLOSE = 23; // 6AM-11PM
  const courtHoursMap = new Map<string, Set<string>>(); // court → Set of "date|hour"
  const courtDays = new Map<string, Set<string>>(); // court → Set of dates
  const courtPlayers = new Map<string, number>();

  calendarData.sessions.forEach((s: RealSession) => {
    const court = s.court;
    const startH = parseInt(s.startTime?.slice(0, 2) || '0');
    const endH = parseInt(s.endTime?.slice(0, 2) || '0') || startH + 1;

    if (!courtHoursMap.has(court)) courtHoursMap.set(court, new Set());
    if (!courtDays.has(court)) courtDays.set(court, new Set());
    courtPlayers.set(court, (courtPlayers.get(court) || 0) + (s.registered || 0));
    courtDays.get(court)!.add(s.date);

    for (let h = Math.max(startH, OPEN); h < Math.min(endH, CLOSE); h++) {
      courtHoursMap.get(court)!.add(s.date + '|' + h);
    }
  });

  const result: { name: string; occupancy: number; sessions: number; revenue: number; sport: string }[] = [];
  courtHoursMap.forEach((hours, name) => {
    const days = courtDays.get(name)?.size || 1;
    const available = days * (CLOSE - OPEN);
    result.push({
      name,
      occupancy: available > 0 ? Math.round((hours.size / available) * 100) : 0,
      sessions: calendarData.sessions.filter((s: RealSession) => s.court === name).length,
      revenue: courtPlayers.get(name) || 0,
      sport: "Pickleball",
    });
  });
  return result.sort((a, b) => b.sessions - a.sessions);
}

function deriveEventsListData(calendarData: any) {
  if (!calendarData?.sessions?.length) return null;
  const sessions: RealSession[] = calendarData.sessions;

  // Events list — map each session to the shape EventsIQ expects
  const fmtLabel: Record<string, string> = {
    OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
    LEAGUE_PLAY: 'League Night', SOCIAL: 'Social Mixer',
    TOURNAMENT: 'Tournament', PRIVATE_LESSON: 'Private Lesson',
    ROUND_ROBIN: 'Round Robin',
  };
  const events = sessions.map((s, i) => ({
    id: s.id || `s-${i}`,
    name: `${fmtLabel[s.format] || s.format}${s.court ? ` · ${s.court}` : ''}`,
    type: s.format,
    status: s.status === 'past' ? 'COMPLETED' : s.status === 'today' ? 'IN_PROGRESS' : 'SCHEDULED',
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    court: s.court || 'TBD',
    registered: s.registered,
    capacity: s.capacity,
    revenue: s.revenue ?? (s.pricePerPlayer != null ? s.pricePerPlayer * s.registered : 0),
    waitlist: 0,
    price: s.pricePerPlayer ?? 0,
  }));

  // Monthly revenue — last 12 months, past sessions only
  const monthMap: Record<string, { revenue: number; events: number }> = {};
  for (const s of sessions) {
    if (s.status === 'upcoming') continue;
    const month = String(s.date).slice(0, 7); // 'YYYY-MM'
    if (!monthMap[month]) monthMap[month] = { revenue: 0, events: 0 };
    monthMap[month].revenue += s.revenue ?? (s.pricePerPlayer != null ? s.pricePerPlayer * s.registered : 0);
    monthMap[month].events++;
  }
  const eventRevenue = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, data]) => ({ month, revenue: Math.round(data.revenue), events: data.events }));

  return { events, eventRevenue };
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
  const [sessionPeriod, setSessionPeriod] = useState<'week' | 'month' | 'quarter' | 'custom'>('month');
  const [sessionCustomFrom, setSessionCustomFrom] = useState('');
  const [sessionCustomTo, setSessionCustomTo] = useState('');
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const activeFilterCount = [filterFormat, filterCourt, filterStatus].filter(Boolean).length;

  const router = useRouter();

  // Cache last successful data to prevent empty-state flash on re-fetch
  const lastGoodData = useRef<{ sessions: any[]; weekly: any[]; formats: any[]; courts: any[]; hourly: any[] }>({ sessions: [], weekly: [], formats: [], courts: [], hourly: [] });

  const periodFilteredCalendarData = useMemo(() => {
    if (!calendarData?.sessions?.length) return calendarData;
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let from: string, to: string;
    if (sessionPeriod === 'week') { from = iso(new Date(now.getTime() - 7*86400000)); to = iso(now); }
    else if (sessionPeriod === 'month') { from = iso(new Date(now.getTime() - 30*86400000)); to = iso(now); }
    else if (sessionPeriod === 'quarter') { from = iso(new Date(now.getTime() - 90*86400000)); to = iso(now); }
    else if (sessionPeriod === 'custom' && sessionCustomFrom && sessionCustomTo) { from = sessionCustomFrom; to = sessionCustomTo; }
    else return calendarData;

    return {
      ...calendarData,
      sessions: calendarData.sessions.filter((s: any) => s.date >= from && s.date <= to),
    };
  }, [calendarData, sessionPeriod, sessionCustomFrom, sessionCustomTo]);

  const displaySessions = useMemo(() => {
    const mapped = mapCalendarToSessions(periodFilteredCalendarData);
    if (mapped.length > 0) lastGoodData.current.sessions = mapped;
    return mapped.length > 0 ? mapped : lastGoodData.current.sessions;
  }, [periodFilteredCalendarData]);
  // hasData: true when we have sessions to display, OR calendarData was fetched and has at least 1 session
  const hasData = displaySessions.length > 0
    || (calendarData != null && Array.isArray(calendarData.sessions) && calendarData.sessions.length > 0);

  const displayWeekly = useMemo(() => {
    const d = deriveWeeklyData(periodFilteredCalendarData);
    if (d.length > 0) lastGoodData.current.weekly = d;
    return d.length > 0 ? d : lastGoodData.current.weekly;
  }, [periodFilteredCalendarData]);

  const displayFormats = useMemo(() => {
    const d = deriveFormatBreakdown(periodFilteredCalendarData);
    if (d.length > 0) lastGoodData.current.formats = d;
    return d.length > 0 ? d : lastGoodData.current.formats;
  }, [periodFilteredCalendarData]);

  const displayCourts = useMemo(() => {
    const d = deriveCourtStats(periodFilteredCalendarData);
    if (d.length > 0) lastGoodData.current.courts = d;
    return d.length > 0 ? d : lastGoodData.current.courts;
  }, [periodFilteredCalendarData]);

  const displayHourly = useMemo(() => {
    const d = deriveHourlyPattern(periodFilteredCalendarData);
    if (d.length > 0) lastGoodData.current.hourly = d;
    return d.length > 0 ? d : lastGoodData.current.hourly;
  }, [periodFilteredCalendarData]);

  const eventsListData = useMemo(() => deriveEventsListData(periodFilteredCalendarData), [periodFilteredCalendarData]);

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

  // Loading state: calendarData not yet available
  if (externalLoading && !calendarData) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto animate-pulse">
        <div className="h-8 rounded-lg w-48" style={{ background: "var(--subtle)" }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl" style={{ background: "var(--subtle)" }} />
                <div className="space-y-2 flex-1">
                  <div className="h-5 rounded w-12" style={{ background: "var(--subtle)" }} />
                  <div className="h-3 rounded w-20" style={{ background: "var(--subtle)" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl p-4 h-28" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} />
          ))}
        </div>
      </div>
    );
  }

  // Only show empty state if we have a definitive "no data" signal:
  // calendarData must have been loaded (not undefined) and contain no sessions,
  // AND we're not currently loading.
  const definitelyEmpty = calendarData !== undefined && !hasData;
  if (definitelyEmpty && !externalLoading) {
    return <EmptyStateIQ icon={CalendarDays} title="No sessions yet" description="Import your session history to see analytics, fill rates, and AI recommendations for optimizing your schedule." ctaLabel="Import Data" ctaHref={`/clubs/${clubId || ''}/intelligence`} />;
  }

  // Guard: if calendarData is null/undefined (not loading, not empty), show empty state
  if (!calendarData && !externalLoading) {
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

      {/* Period Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
          {(["week", "month", "quarter", "custom"] as const).map((p) => (
            <button key={p} onClick={() => setSessionPeriod(p)}
              className="px-4 py-2 text-xs capitalize transition-all"
              style={{
                background: sessionPeriod === p ? "var(--pill-active)" : "transparent",
                color: sessionPeriod === p ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: sessionPeriod === p ? 600 : 500,
              }}>
              {p}
            </button>
          ))}
        </div>
        {sessionPeriod === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={sessionCustomFrom} onChange={(e) => setSessionCustomFrom(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
            <span className="text-xs" style={{ color: "var(--t4)" }}>to</span>
            <input type="date" value={sessionCustomTo} onChange={(e) => setSessionCustomTo(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
          </div>
        )}
      </div>

      {view === "analytics" ? (
        <>
          {/* Format Filter Tabs — right aligned */}
          {displayFormats.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="text-xs mr-1" style={{ color: "var(--t4)", fontWeight: 600 }}>Format:</span>
              {[{ format: "", label: "All" }, ...displayFormats.map(f => ({ format: f.format, label: f.format.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) }))].map(f => (
                <button
                  key={f.format}
                  onClick={() => setFilterFormat(f.format)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: filterFormat === f.format ? "var(--pill-active)" : "transparent",
                    color: filterFormat === f.format ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                    fontWeight: filterFormat === f.format ? 600 : 500,
                    border: `1px solid ${filterFormat === f.format ? (isDark ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.2)") : "var(--card-border)"}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* KPI Row — computed from ALL calendarData sessions, not sliced list */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const allSessions: RealSession[] = periodFilteredCalendarData?.sessions || [];
              const filtered = filterFormat
                ? allSessions.filter((s: RealSession) => s.format === filterFormat)
                : allSessions;
              const totalSessions = filtered.length;
              const totalRegistered = filtered.reduce((s: number, x: RealSession) => s + (x.registered || 0), 0);
              // Hours-based occupancy: unique court-hours occupied / total available court-hours
              const OPEN_KPI = 6, CLOSE_KPI = 23;
              const allCourtHours = new Set<string>();
              const allCourtDays = new Map<string, Set<string>>();
              filtered.forEach((s: any) => {
                const startH = parseInt(s.startTime?.slice(0,2) || '0');
                const endH = parseInt(s.endTime?.slice(0,2) || '0') || startH + 1;
                if (!allCourtDays.has(s.court)) allCourtDays.set(s.court, new Set());
                allCourtDays.get(s.court)!.add(s.date);
                for (let h = Math.max(startH, OPEN_KPI); h < Math.min(endH, CLOSE_KPI); h++) {
                  allCourtHours.add(s.court + '|' + s.date + '|' + h);
                }
              });
              let totalAvailable = 0;
              allCourtDays.forEach((days) => { totalAvailable += days.size * (CLOSE_KPI - OPEN_KPI); });
              const avgOcc = totalAvailable > 0 ? Math.round((allCourtHours.size / totalAvailable) * 100) : 0;
              const peakOcc = filtered.reduce((best: number, s: RealSession) => {
                const occ = s.capacity > 0 ? Math.round((s.registered / s.capacity) * 100) : 0;
                return occ > best ? occ : best;
              }, 0);
              return [
                { label: "Total Sessions", value: totalSessions.toLocaleString(), icon: CalendarDays, gradient: "from-violet-500 to-purple-600" },
                { label: "Avg Occupancy", value: `${avgOcc}%`, icon: BarChart3, gradient: "from-cyan-500 to-teal-500" },
                { label: "Total Registrations", value: totalRegistered.toLocaleString(), icon: Users, gradient: "from-emerald-500 to-green-500" },
                { label: "Peak Utilization", value: `${peakOcc}%`, icon: Zap, gradient: "from-amber-500 to-orange-500" },
              ];
            })().map((kpi, i) => {
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
                    <div className="text-xs" style={{ color: "var(--t4)" }}>
                      Current period
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
                    <div className="text-xs text-right w-20" style={{ color: "var(--t3)" }}>{f.revenue.toLocaleString()} players</div>
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
                        <span>{court.revenue.toLocaleString()} players</span>
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
          <EventsIQ embedded eventsListData={eventsListData ?? undefined} clubId={clubId} />
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
                    {["Session ID", "Court", "Format", "Date / Time", "Players", "Duration", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--t4)", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((s, i) => {
                    const isExpanded = expandedId === s.id;
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
                              {fillPct < 50 && clubId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/clubs/${clubId}/intelligence/slot-filler`); }}
                                  className="text-[10px] whitespace-nowrap transition-colors hover:underline"
                                  style={{ color: "#8B5CF6", fontWeight: 600 }}
                                >
                                  Fill → Slot Filler
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--t3)" }}>{s.duration}</td>
                          {/* Revenue column removed for membership clubs */}
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                        </motion.tr>
                        {isExpanded && (
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
                                      {fillPct < 50 && clubId && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); router.push(`/clubs/${clubId}/intelligence/slot-filler`); }}
                                          className="text-[11px] transition-colors hover:underline"
                                          style={{ color: "#8B5CF6", fontWeight: 600 }}
                                        >
                                          Fill → Slot Filler
                                        </button>
                                      )}
                                    </div>
                                  </div>
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
