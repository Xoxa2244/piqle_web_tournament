'use client'
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  BarChart3, Users, Clock, UserCheck, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useTheme } from "../IQThemeProvider";

/* --- Helpers --- */
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
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const COLORS = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function heatmapColor(occupancy: number, isDark: boolean): string {
  if (occupancy >= 80) return "rgba(16,185,129,0.75)";
  if (occupancy >= 60) return "rgba(16,185,129,0.5)";
  if (occupancy >= 40) return "rgba(245,158,11,0.55)";
  if (occupancy >= 20) return isDark ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.2)";
  return isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
}

/* --- Props --- */
interface UtilizationIQProps {
  dashboardData?: any;
  heatmapData?: any;
  memberHealthData?: any;
  isLoading?: boolean;
  clubId?: string;
}

/* --- Component --- */
export function UtilizationIQ({ dashboardData, heatmapData, memberHealthData, isLoading, clubId }: UtilizationIQProps) {
  const { isDark } = useTheme();

  /* KPI computations */
  const courtUtilization = dashboardData?.metrics?.occupancy?.value ?? "--";
  const courtUtilizationSubtitle = dashboardData?.metrics?.occupancy?.subtitle ?? "";

  const avgSessionsPerMember = useMemo(() => {
    const bookings = parseInt(dashboardData?.metrics?.bookings?.value?.replace(/,/g, "") || "0", 10);
    const active = dashboardData?.players?.activeCount || 1;
    return (bookings / active).toFixed(1);
  }, [dashboardData]);

  const peakHour = useMemo(() => {
    const slots = dashboardData?.occupancy?.byTimeSlot;
    if (!slots?.length) return "--";
    const best = slots.reduce((a: any, b: any) => ((b.avgOccupancy ?? 0) > (a.avgOccupancy ?? 0) ? b : a), slots[0]);
    return best.timeLabel ?? best.time ?? "--";
  }, [dashboardData]);

  const activeCount = dashboardData?.players?.activeCount ?? "--";
  const inactiveCount = dashboardData?.players?.inactiveCount;

  /* Charts data */
  const byDayData = useMemo(() => {
    return (dashboardData?.occupancy?.byDay ?? []).map((d: any) => ({
      day: d.day,
      sessions: d.sessionCount ?? 0,
      occupancy: d.avgOccupancy ?? 0,
    }));
  }, [dashboardData]);

  const byFormatData = useMemo(() => {
    return (dashboardData?.occupancy?.byFormat ?? []).map((f: any, idx: number) => ({
      name: f.format,
      value: f.sessionCount ?? 0,
      percentage: f.percentage ?? 0,
      color: COLORS[idx % COLORS.length],
    }));
  }, [dashboardData]);

  /* Engagement tiers from member health */
  const engagementTiers = useMemo(() => {
    const members = memberHealthData?.members;
    if (!members?.length) return null;
    let power = 0, regular = 0, fading = 0;
    for (const m of members) {
      const score = m.healthScore ?? 0;
      if (score >= 80 || (m.totalBookings ?? 0) >= 8) power++;
      else if (score >= 50) regular++;
      else fading++;
    }
    const total = members.length;
    return {
      power, regular, fading, total,
      powerPct: total > 0 ? Math.round((power / total) * 100) : 0,
      regularPct: total > 0 ? Math.round((regular / total) * 100) : 0,
      fadingPct: total > 0 ? Math.round((fading / total) * 100) : 0,
    };
  }, [memberHealthData]);

  /* Heatmap grid */
  const heatmapGrid = heatmapData?.heatmap;
  const heatmapTimeSlots = heatmapData?.timeSlots ?? [];
  const heatmapDays = heatmapData?.days ?? DAY_LABELS;

  const hasData = !!dashboardData;

  /* --- Loading state --- */
  if (isLoading) {
    return (
      <div className="space-y-6 p-1">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-lg animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
          <div className="h-4 w-96 rounded-lg animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
          <div className="h-72 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
        </div>
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
      </div>
    );
  }

  /* --- Empty state --- */
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: isDark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)" }}>
          <BarChart3 className="w-8 h-8" style={{ color: "#8B5CF6" }} />
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--heading)" }}>Upload session data to see utilization insights</h3>
        <p className="text-sm max-w-md" style={{ color: "var(--t3)" }}>
          Connect your booking system or upload court reservation data to unlock court usage analytics, engagement patterns, and capacity recommendations.
        </p>
      </div>
    );
  }

  /* --- KPI cards config --- */
  const kpis = [
    { label: "Court Utilization", value: courtUtilization, subtitle: courtUtilizationSubtitle, icon: BarChart3, color: "#8B5CF6" },
    { label: "Avg Sessions/Member", value: avgSessionsPerMember, subtitle: "per member", icon: Users, color: "#06B6D4" },
    { label: "Peak Hour", value: peakHour, subtitle: "highest occupancy", icon: Clock, color: "#10B981" },
    { label: "Active Members", value: typeof activeCount === "number" ? activeCount.toLocaleString() : activeCount, subtitle: inactiveCount != null ? `${inactiveCount} inactive` : "", icon: UserCheck, color: "#F59E0B" },
  ];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="text-2xl font-bold" style={{ color: "var(--heading)" }}>Utilization Intelligence</h2>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Court usage, engagement patterns &amp; capacity insights</p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: idx * 0.08 }}>
            <Card>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}18` }}>
                  <kpi.icon className="w-4.5 h-4.5" style={{ color: kpi.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold" style={{ color: "var(--heading)" }}>{kpi.value}</div>
              <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>{kpi.label}</div>
              {kpi.subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>{kpi.subtitle}</div>}
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Heatmap */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: "#8B5CF6" }} />
            <h3 className="text-base font-semibold" style={{ color: "var(--heading)" }}>Court Usage Heatmap</h3>
          </div>
          {heatmapGrid?.length ? (
            <div>
              {/* Day headers */}
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `80px repeat(${heatmapDays.length}, 1fr)` }}>
                <div />
                {heatmapDays.map((day: string) => (
                  <div key={day} className="text-center text-xs font-medium py-1" style={{ color: "var(--t3)" }}>{day}</div>
                ))}
              </div>
              {/* Grid rows */}
              <div className="space-y-1">
                {heatmapGrid.map((row: any, rowIdx: number) => {
                  const slotLabel = heatmapTimeSlots[rowIdx] ?? `Slot ${rowIdx + 1}`;
                  const cells: number[] = Array.isArray(row) ? row : (row.values ?? []);
                  return (
                    <div key={rowIdx} className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${heatmapDays.length}, 1fr)` }}>
                      <div className="text-xs flex items-center truncate pr-1" style={{ color: "var(--t4)" }}>{slotLabel}</div>
                      {cells.map((val: number, colIdx: number) => {
                        const occ = typeof val === "number" ? val : 0;
                        return (
                          <div
                            key={colIdx}
                            className="rounded-md flex items-center justify-center text-xs font-medium h-8 transition-colors"
                            style={{ background: heatmapColor(occ, isDark), color: occ >= 40 ? "#fff" : "var(--t4)" }}
                            title={`${heatmapDays[colIdx]} ${slotLabel}: ${occ}%`}
                          >
                            {occ > 0 ? `${occ}%` : ""}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4">
                <span className="text-xs" style={{ color: "var(--t4)" }}>Occupancy:</span>
                {[
                  { label: "Low", bg: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
                  { label: "Mid", bg: "rgba(245,158,11,0.35)" },
                  { label: "High", bg: "rgba(16,185,129,0.55)" },
                  { label: "Full", bg: "rgba(16,185,129,0.75)" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ background: l.bg }} />
                    <span className="text-xs" style={{ color: "var(--t4)" }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="w-8 h-8 mb-3" style={{ color: "var(--t4)" }} />
              <p className="text-sm" style={{ color: "var(--t3)" }}>Upload session data to see court utilization patterns</p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sessions by Day */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--heading)" }}>Sessions by Day of Week</h3>
            {byDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byDayData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--t4)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--t4)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="sessions" name="Sessions" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60 text-sm" style={{ color: "var(--t4)" }}>No day-of-week data available</div>
            )}
          </Card>
        </motion.div>

        {/* Format Distribution */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }}>
          <Card>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--heading)" }}>Format Distribution</h3>
            {byFormatData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie
                      data={byFormatData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={2}
                      stroke={isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.8)"}
                    >
                      {byFormatData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {byFormatData.map((f: any) => (
                    <div key={f.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: f.color }} />
                      <span className="text-xs truncate" style={{ color: "var(--t3)" }}>{f.name}</span>
                      <span className="text-xs font-semibold ml-auto" style={{ color: "var(--heading)" }}>{f.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-60 text-sm" style={{ color: "var(--t4)" }}>No format data available</div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Engagement Tiers */}
      {engagementTiers && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.6 }}>
          <Card>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--heading)" }}>Engagement Tiers</h3>
            <div className="mb-4">
              {/* Segmented bar */}
              <div className="flex rounded-xl overflow-hidden h-7">
                {engagementTiers.powerPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                    style={{ width: `${engagementTiers.powerPct}%`, background: "#8B5CF6" }}
                  >
                    {engagementTiers.powerPct}%
                  </div>
                )}
                {engagementTiers.regularPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                    style={{ width: `${engagementTiers.regularPct}%`, background: "#06B6D4" }}
                  >
                    {engagementTiers.regularPct}%
                  </div>
                )}
                {engagementTiers.fadingPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                    style={{ width: `${engagementTiers.fadingPct}%`, background: "#F59E0B" }}
                  >
                    {engagementTiers.fadingPct}%
                  </div>
                )}
              </div>
            </div>
            {/* Tier details */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Power", count: engagementTiers.power, pct: engagementTiers.powerPct, color: "#8B5CF6", desc: "Health score 80+ or 8+ bookings/mo" },
                { label: "Regular", count: engagementTiers.regular, pct: engagementTiers.regularPct, color: "#06B6D4", desc: "Health score 50-79" },
                { label: "Fading", count: engagementTiers.fading, pct: engagementTiers.fadingPct, color: "#F59E0B", desc: "Health score below 50" },
              ].map(tier => (
                <div key={tier.label} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: tier.color }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--heading)" }}>{tier.label}</span>
                  </div>
                  <div className="text-xl font-bold" style={{ color: tier.color }}>{tier.count}</div>
                  <div className="text-xs" style={{ color: "var(--t4)" }}>{tier.pct}% of members</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>{tier.desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
