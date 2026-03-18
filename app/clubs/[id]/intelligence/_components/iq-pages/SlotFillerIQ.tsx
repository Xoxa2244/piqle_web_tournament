'use client'
import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";
import {
  Puzzle, Users, Clock, MapPin, Star, Zap, Send, Check,
  ChevronDown, Filter, ArrowUpRight, CalendarDays, Target,
  Sparkles, AlertCircle, CheckCircle2, X, Mail, Smartphone, Bell,
} from "lucide-react";
import { useTheme } from "../IQThemeProvider";

/* --- Mock Data --- */
const emptySlots = [
  {
    id: "slot-1",
    court: "Court 1",
    sport: "Pickleball",
    date: "Tomorrow",
    time: "9:00 AM",
    duration: "90 min",
    format: "Open Play",
    spotsNeeded: 4,
    spotsTotal: 8,
    pricePerPlayer: 15,
    matches: [
      { id: "m1", name: "Emma Wilson", rating: 3.2, matchScore: 97, lastPlayed: "2 days ago", preferredTime: "Morning", status: "available", avatar: "EW", phone: "+1 (555) 234-5678", email: "emma.w@email.com" },
      { id: "m2", name: "Jake Rodriguez", rating: 3.0, matchScore: 94, lastPlayed: "4 days ago", preferredTime: "Morning", status: "available", avatar: "JR", phone: "+1 (555) 345-6789", email: "jake.r@email.com" },
      { id: "m3", name: "Lisa Kim", rating: 3.4, matchScore: 91, lastPlayed: "1 day ago", preferredTime: "Anytime", status: "available", avatar: "LK", phone: "+1 (555) 456-7890", email: "lisa.k@email.com" },
      { id: "m4", name: "Mike Chen", rating: 2.8, matchScore: 88, lastPlayed: "5 days ago", preferredTime: "Morning", status: "tentative", avatar: "MC", phone: "+1 (555) 567-8901", email: "mike.c@email.com" },
      { id: "m5", name: "Sarah Davis", rating: 3.1, matchScore: 85, lastPlayed: "3 days ago", preferredTime: "Afternoon", status: "available", avatar: "SD", phone: "+1 (555) 678-9012", email: "sarah.d@email.com" },
      { id: "m6", name: "Tom Brown", rating: 3.3, matchScore: 82, lastPlayed: "1 week ago", preferredTime: "Morning", status: "available", avatar: "TB", phone: "+1 (555) 789-0123", email: "tom.b@email.com" },
    ],
  },
  {
    id: "slot-2",
    court: "Court 3",
    sport: "Padel",
    date: "Tomorrow",
    time: "11:00 AM",
    duration: "60 min",
    format: "Doubles",
    spotsNeeded: 2,
    spotsTotal: 4,
    pricePerPlayer: 25,
    matches: [
      { id: "m7", name: "Anna Martinez", rating: 3.5, matchScore: 96, lastPlayed: "1 day ago", preferredTime: "Late Morning", status: "available", avatar: "AM", phone: "+1 (555) 890-1234", email: "anna.m@email.com" },
      { id: "m8", name: "Chris Lee", rating: 3.6, matchScore: 93, lastPlayed: "3 days ago", preferredTime: "Morning", status: "available", avatar: "CL", phone: "+1 (555) 901-2345", email: "chris.l@email.com" },
      { id: "m9", name: "Diana Park", rating: 3.3, matchScore: 89, lastPlayed: "2 days ago", preferredTime: "Anytime", status: "tentative", avatar: "DP", phone: "+1 (555) 012-3456", email: "diana.p@email.com" },
    ],
  },
  {
    id: "slot-3",
    court: "Court 2",
    sport: "Pickleball",
    date: "Wed, Mar 19",
    time: "6:00 PM",
    duration: "90 min",
    format: "Round Robin",
    spotsNeeded: 6,
    spotsTotal: 12,
    pricePerPlayer: 18,
    matches: [
      { id: "m10", name: "Ryan Foster", rating: 2.8, matchScore: 92, lastPlayed: "4 days ago", preferredTime: "Evening", status: "available", avatar: "RF", phone: "+1 (555) 123-4567", email: "ryan.f@email.com" },
      { id: "m11", name: "Kelly Wright", rating: 3.0, matchScore: 90, lastPlayed: "2 days ago", preferredTime: "Evening", status: "available", avatar: "KW", phone: "+1 (555) 234-5670", email: "kelly.w@email.com" },
      { id: "m12", name: "Brandon Hall", rating: 2.6, matchScore: 87, lastPlayed: "6 days ago", preferredTime: "Anytime", status: "available", avatar: "BH", phone: "+1 (555) 345-6701", email: "brandon.h@email.com" },
      { id: "m13", name: "Megan Scott", rating: 2.9, matchScore: 84, lastPlayed: "1 day ago", preferredTime: "Evening", status: "available", avatar: "MS", phone: "+1 (555) 456-7012", email: "megan.s@email.com" },
    ],
  },
];

/* --- Map real recommendations to SlotFillerIQ format --- */
function mapRecommendationsToSlots(recommendations: any, dashboardData: any): typeof emptySlots {
  if (!recommendations?.recommendations?.length || !recommendations?.session) return [];
  const s = recommendations.session;
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return [{
    id: s.id || 'slot-real',
    court: s.court || 'Court 1',
    sport: s.format || 'Pickleball',
    date: s.date || 'Upcoming',
    time: s.startTime || '',
    duration: `${s.duration || 60} min`,
    format: s.format || 'Open Play',
    spotsNeeded: Math.max(0, (s.capacity || 8) - (s.registered || 0)),
    spotsTotal: s.capacity || 8,
    pricePerPlayer: s.pricePerPlayer || 15,
    matches: recommendations.recommendations.slice(0, 8).map((r: any) => ({
      id: r.member?.id || r.memberId || `m-${Math.random()}`,
      name: r.member?.name || 'Unknown',
      rating: r.member?.duprRating ?? 3.0,
      matchScore: Math.round((r.score ?? 0.8) * 100),
      lastPlayed: r.member?.lastPlayedDaysAgo != null ? `${r.member.lastPlayedDaysAgo}d ago` : 'Unknown',
      preferredTime: r.factors?.preferredTimeMatch ? 'Matched' : 'Flexible',
      status: r.score >= 0.9 ? 'available' : 'tentative',
      avatar: initials(r.member?.name || 'XX'),
      phone: '',
      email: r.member?.email || '',
    })),
  }];
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function MatchScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "#10B981" : score >= 80 ? "#F59E0B" : "#8B5CF6";
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
      <Target className="w-3 h-3" style={{ color }} />
      <span className="text-[11px]" style={{ color, fontWeight: 700 }}>{score}%</span>
    </div>
  );
}

/* ============================================= */
/*            SLOT FILLER PAGE                    */
/* ============================================= */
export function SlotFillerIQ({ dashboardData, recommendations, isLoading: externalLoading, sendInvites, clubId }: { dashboardData?: any; recommendations?: any; isLoading?: boolean; sendInvites?: any; clubId?: string } = {}) {
  const { isDark } = useTheme();
  const realSlots = mapRecommendationsToSlots(recommendations, dashboardData);
  const displaySlots = realSlots.length > 0 ? realSlots : emptySlots;
  const [selectedSlot, setSelectedSlot] = useState(displaySlots[0]?.id || emptySlots[0].id);
  const [sentInvites, setSentInvites] = useState<Record<string, string>>({}); // "playerId" -> "email"|"sms"
  const [showSuccess, setShowSuccess] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const activeSlot = displaySlots.find((s) => s.id === selectedSlot) || displaySlots[0];

  const potentialRevenue = activeSlot.spotsNeeded * activeSlot.pricePerPlayer;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Success Toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-20 left-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl"
            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.25)", backdropFilter: "blur(12px)" }}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-emerald-300" style={{ fontWeight: 600 }}>Invitations sent successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Smart Slot Filler</h1>
            <span className="px-2 py-0.5 text-[9px] tracking-wider uppercase rounded-lg" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))", color: "#A78BFA", fontWeight: 700, border: "1px solid rgba(139,92,246,0.2)" }}>
              AI Powered
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>AI matches perfect players to empty slots. One click to fill.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Potential Recovery</div>
            <div className="text-emerald-400" style={{ fontSize: "20px", fontWeight: 800 }}>
              ${displaySlots.reduce((sum, s) => sum + s.spotsNeeded * s.pricePerPlayer, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Empty Slots", value: displaySlots.length.toString(), icon: CalendarDays, gradient: "from-red-500 to-orange-500", desc: "Next 48 hours" },
          { label: "Spots to Fill", value: displaySlots.reduce((s, sl) => s + sl.spotsNeeded, 0).toString(), icon: Users, gradient: "from-amber-500 to-yellow-500", desc: "Across all slots" },
          { label: "AI Matches Found", value: displaySlots.reduce((s, sl) => s + sl.matches.length, 0).toString(), icon: Sparkles, gradient: "from-violet-500 to-purple-600", desc: "High confidence" },
          { label: "Fill Rate (7d)", value: "78%", icon: Target, gradient: "from-emerald-500 to-green-500", desc: "+12% vs last week" },
        ].map((kpi, i) => {
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
                <div className="text-[10px] mt-2" style={{ color: "var(--t4)" }}>{kpi.desc}</div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Slot List */}
        <div className="space-y-3">
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Empty Slots</h3>
          {displaySlots.map((slot) => {
            const active = slot.id === selectedSlot;
            return (
              <motion.div
                key={slot.id}
                whileHover={{ scale: 1.01 }}
                onClick={() => { setSelectedSlot(slot.id); }}
                className="cursor-pointer rounded-2xl p-4 transition-all"
                style={{
                  background: active ? (isDark ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.04)") : "var(--card-bg)",
                  border: active ? "1px solid rgba(139,92,246,0.25)" : "1px solid var(--card-border)",
                  backdropFilter: "var(--glass-blur)",
                  boxShadow: active ? "0 4px 20px rgba(139,92,246,0.1)" : "var(--card-shadow)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
                      <span className="text-sm" style={{ fontWeight: 700, color: "var(--heading)" }}>{slot.court}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--badge-bg)", color: "var(--t3)" }}>{slot.sport}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "var(--t3)" }}>
                      <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{slot.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{slot.time}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-red-400" style={{ fontSize: "16px", fontWeight: 800 }}>{slot.spotsNeeded}</div>
                    <div className="text-[9px]" style={{ color: "var(--t4)" }}>spots needed</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-lg" style={{ background: "var(--subtle)", color: "var(--t3)" }}>{slot.format}</span>
                    <span className="text-[10px]" style={{ color: "var(--t4)" }}>{slot.duration}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] text-violet-400" style={{ fontWeight: 600 }}>{slot.matches.length} matches</span>
                  </div>
                </div>

                {/* Fill bar */}
                <div className="mt-3">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #8B5CF6, #06B6D4)",
                        width: `${((slot.spotsTotal - slot.spotsNeeded) / slot.spotsTotal) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--t4)" }}>
                    <span>{slot.spotsTotal - slot.spotsNeeded}/{slot.spotsTotal} filled</span>
                    <span>${slot.spotsNeeded * slot.pricePerPlayer} at stake</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Player Matches */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>
                AI-Matched Players for {activeSlot.court}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--t4)" }}>
                Ranked by compatibility score • {activeSlot.time}, {activeSlot.date}
              </p>
            </div>
            <button
              onClick={() => {
                const newInvites = { ...sentInvites };
                activeSlot.matches.forEach((p) => { if (!newInvites[p.id]) newInvites[p.id] = "email"; });
                setSentInvites(newInvites);
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs text-white transition-all"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600, boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
            >
              <Send className="w-3.5 h-3.5" />
              Invite All via Email
            </button>
          </div>

          <div className="space-y-2">
            {activeSlot.matches.map((player, i) => {
              const isSent = !!sentInvites[player.id];
              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] text-white shrink-0"
                      style={{
                        background: isSent
                          ? "linear-gradient(135deg, #10B981, #059669)"
                          : "linear-gradient(135deg, #8B5CF6, #06B6D4)",
                        fontWeight: 700,
                      }}
                    >
                      {player.avatar}
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ fontWeight: 600, color: "var(--heading)" }}>{player.name}</span>
                        {player.status === "tentative" && !isSent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400" style={{ fontWeight: 600 }}>Tentative</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: "var(--t3)" }}>
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3" style={{ color: "#F59E0B" }} />
                          {player.rating}
                        </span>
                        <span>Last: {player.lastPlayed}</span>
                        <span>{player.preferredTime}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Match Score */}
                    <MatchScoreBadge score={player.matchScore} />

                    {/* Invite Buttons or Sent Badge */}
                    {isSent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                        <Check className="w-3 h-3" />
                        Sent via {sentInvites[player.id]}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSentInvites((prev) => ({ ...prev, [player.id]: "email" }))}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                          style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600, border: "1px solid rgba(139,92,246,0.2)" }}
                        >
                          <Mail className="w-3 h-3" />
                          Email
                        </button>
                        <button
                          onClick={() => setSentInvites((prev) => ({ ...prev, [player.id]: "sms" }))}
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
                          <span className="text-[9px] ml-0.5" style={{ opacity: 0.6 }}>soon</span>
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Revenue Impact */}
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs" style={{ fontWeight: 700, color: "var(--heading)" }}>Revenue Impact</h4>
                <p className="text-[11px]" style={{ color: "var(--t3)" }}>
                  Filling this slot recovers <span className="text-emerald-400" style={{ fontWeight: 700 }}>${potentialRevenue}</span> in lost revenue
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px]" style={{ color: "var(--t4)" }}>Fill rate for this slot type</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, #10B981, #06B6D4)", width: "82%" }}
                      initial={{ width: 0 }}
                      animate={{ width: "82%" }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                  <span className="text-xs text-emerald-400" style={{ fontWeight: 700 }}>82%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
