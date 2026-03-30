'use client'
import React, { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  ChevronLeft, ChevronRight, Users, MapPin, Clock, X,
  Zap, ArrowRight, Target, CalendarDays,
} from "lucide-react"
import { useTheme } from "../IQThemeProvider"
import { useRouter } from "next/navigation"
import type { SessionCalendarItem } from "@/types/intelligence"

// ── Constants ──

const HOUR_START = 6
const HOUR_END = 23
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

// ── Skill-level color map ──

type SkillTier = 'advanced' | 'competitive' | 'intermediate' | 'casual' | 'beginner' | 'other'

const SKILL_COLORS: Record<SkillTier, { bg: string; border: string; text: string }> = {
  advanced:     { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  text: '#EF4444' },
  competitive:  { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)', text: '#8B5CF6' },
  intermediate: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)',  text: '#3B82F6' },
  casual:       { bg: 'rgba(6,182,212,0.15)',   border: 'rgba(6,182,212,0.3)',   text: '#06B6D4' },
  beginner:     { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: '#10B981' },
  other:        { bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)', text: '#94A3B8' },
}

function classifySkill(format: string, skillLevel: string): { tier: SkillTier; label: string; range: string } {
  const sl = (skillLevel || '').toUpperCase()
  const fmt = (format || '').toUpperCase()

  if (sl.includes('ADVANCED') || sl.includes('4.0'))   return { tier: 'advanced', label: 'Advanced', range: '4.0+' }
  if (sl.includes('COMPETITIVE') || sl.includes('3.5')) return { tier: 'competitive', label: 'Competitive', range: '3.5 - 3.99' }
  if (sl.includes('INTERMEDIATE') || sl.includes('3.0')) return { tier: 'intermediate', label: 'Intermediate', range: '3.0 - 3.49' }
  if (sl.includes('CASUAL') || sl.includes('2.5'))      return { tier: 'casual', label: 'Casual', range: '2.5 - 2.99' }
  if (sl.includes('BEGINNER') || sl.includes('2.0'))    return { tier: 'beginner', label: 'Beginner', range: '2.0 - 2.49' }

  // Try format-based
  if (fmt.includes('DRILL'))  return { tier: 'other', label: 'Drill', range: '' }
  if (fmt.includes('CLINIC')) return { tier: 'other', label: 'Clinic', range: '' }
  if (fmt.includes('LEAGUE')) return { tier: 'other', label: 'League', range: '' }
  if (fmt.includes('SOCIAL')) return { tier: 'other', label: 'Social', range: '' }

  return { tier: 'other', label: 'All Levels', range: '' }
}

function shortenCourt(court: string): string {
  const m = court.match(/Court\s*#?\s*(\d+)/i)
  return m ? `Ct #${m[1]}` : court.replace(/\(.+\)/, '').trim()
}

function fillColor(occ: number): string {
  if (occ >= 80) return '#10B981'
  if (occ >= 40) return '#F59E0B'
  return '#EF4444'
}

// ── Props ──

interface ScheduleIQProps {
  calendarData: any
  dashboardData: any
  isLoading: boolean
  clubId: string
}

// ── Session Detail Panel ──

function SessionDetail({ session, onClose, clubId, isDark }: {
  session: SessionCalendarItem; onClose: () => void; clubId: string; isDark: boolean
}) {
  const router = useRouter()
  const sk = classifySkill(session.format, session.skillLevel)
  const colors = SKILL_COLORS[sk.tier]
  const occPct = Math.round((session.registered / (session.capacity || 1)) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.1)' }}
    >
      <div className="flex items-center justify-between px-5 py-3" style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: colors.border, color: colors.text }}>{sk.label}</span>
          {sk.range && <span className="text-xs" style={{ color: 'var(--t3)' }}>{sk.range}</span>}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Clock, label: 'Time', value: `${session.startTime} - ${session.endTime}` },
            { icon: MapPin, label: 'Court', value: session.court || 'N/A' },
            { icon: CalendarDays, label: 'Date', value: new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
            { icon: Target, label: 'Level', value: session.skillLevel || 'All Levels' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--t4)' }} />
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--heading)' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
        {/* Fill bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--t2)' }}>Fill Rate</span>
            <span className="text-xs font-semibold" style={{ color: fillColor(session.occupancy) }}>{session.registered}/{session.capacity}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(occPct, 100)}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full" style={{ background: fillColor(session.occupancy) }} />
          </div>
        </div>
        {/* Players */}
        {session.playerNames && session.playerNames.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--t3)' }}><Users className="w-3 h-3 inline mr-1" />Registered ({session.playerNames.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {session.playerNames.slice(0, 12).map((name, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--subtle)', color: 'var(--t2)' }}>{name}</span>
              ))}
              {session.playerNames.length > 12 && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: 'var(--t4)' }}>+{session.playerNames.length - 12} more</span>}
            </div>
          </div>
        )}
        {session.peerAvgOccupancy != null && (
          <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
            <Zap className="w-3 h-3 inline mr-1" style={{ color: '#8B5CF6' }} />
            This slot fills {session.peerAvgOccupancy}% on average.
            {occPct < session.peerAvgOccupancy ? ` Today only ${occPct}%.` : ` Today ${occPct}% — above avg.`}
          </div>
        )}
        {occPct < 80 && session.status !== 'past' && (
          <button
            onClick={() => router.push(`/clubs/${clubId}/intelligence/slot-filler`)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >Fill this session <ArrowRight className="w-4 h-4" /></button>
        )}
      </div>
    </motion.div>
  )
}

// ── Main Component ──

export function ScheduleIQ({ calendarData, dashboardData, isLoading, clubId }: ScheduleIQProps) {
  const { isDark } = useTheme()
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()))
  const [selectedSession, setSelectedSession] = useState<SessionCalendarItem | null>(null)

  const allSessions: SessionCalendarItem[] = calendarData?.sessions ?? []

  // All unique dates in data
  const allDates = useMemo(() => {
    const s = new Set(allSessions.map((s) => s.date))
    return Array.from(s).sort()
  }, [allSessions])

  // Courts sorted
  const courts = useMemo(() => {
    const s = new Set<string>()
    allSessions.forEach((x) => { if (x.court) s.add(x.court) })
    return Array.from(s).sort()
  }, [allSessions])

  // Sessions for selected date
  const daySessions = useMemo(
    () => allSessions.filter((s) => s.date === selectedDate),
    [allSessions, selectedDate]
  )

  // Map: `court|hour` -> sessions, also compute rowSpan
  const sessionGrid = useMemo(() => {
    const map: Record<string, (SessionCalendarItem & { rowSpan: number })[]> = {}
    const occupied: Set<string> = new Set() // track cells occupied by multi-hour spans
    for (const s of daySessions) {
      const startH = parseInt(s.startTime.split(':')[0], 10)
      const endH = parseInt(s.endTime.split(':')[0], 10)
      const span = Math.max(1, endH - startH)
      const key = `${s.court}|${startH}`
      if (!map[key]) map[key] = []
      map[key].push({ ...s, rowSpan: span })
      // Mark cells as occupied for multi-hour
      for (let h = startH + 1; h < startH + span; h++) {
        occupied.add(`${s.court}|${h}`)
      }
    }
    return { map, occupied }
  }, [daySessions])

  // Week pills (Mon-Sun around selected date)
  const weekPills = useMemo(() => {
    const sel = new Date(selectedDate + 'T12:00:00')
    const day = sel.getDay()
    const mon = addDays(sel, -(day === 0 ? 6 : day - 1))
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i)
      return { dateStr: toDateStr(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate() }
    })
  }, [selectedDate])

  const todayStr = toDateStr(new Date())
  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }, [selectedDate])

  const handlePrev = useCallback(() => {
    setSelectedDate((d) => toDateStr(addDays(new Date(d + 'T12:00:00'), -1)))
  }, [])
  const handleNext = useCallback(() => {
    setSelectedDate((d) => {
      const next = toDateStr(addDays(new Date(d + 'T12:00:00'), 1))
      const maxDate = allDates.length > 0 ? allDates[allDates.length - 1] : next
      return next <= maxDate ? next : d
    })
  }, [allDates])
  const handleToday = useCallback(() => setSelectedDate(toDateStr(new Date())), [])

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="h-10 w-full rounded-xl" style={{ background: 'var(--subtle)' }} />
        <div className="h-[400px] rounded-2xl" style={{ background: 'var(--subtle)' }} />
      </div>
    )
  }

  if (!calendarData || allSessions.length === 0) {
    return (
      <div className="text-center py-20">
        <CalendarDays className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--t4)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--heading)' }}>No Schedule Data</h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--t3)' }}>Upload session data via CSV to see the court scheduler.</p>
      </div>
    )
  }

  const currentHour = new Date().getHours()

  return (
    <div className="space-y-4">
      {/* ── Day navigation ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>Court Schedule</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
            <button onClick={handlePrev} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-1 text-sm font-medium" style={{ color: 'var(--heading)' }}>{formattedDate}</span>
            <button onClick={handleNext} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--t3)' }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: selectedDate === todayStr ? 'rgba(139,92,246,0.15)' : 'var(--subtle)', color: selectedDate === todayStr ? '#8B5CF6' : 'var(--t3)', border: '1px solid var(--card-border)' }}
          >Today</button>
        </div>
      </div>

      {/* ── Week overview bar ── */}
      <div className="flex items-center gap-1.5">
        {weekPills.map((p) => {
          const isSelected = p.dateStr === selectedDate
          const isToday = p.dateStr === todayStr
          const hasSessions = allSessions.some((s) => s.date === p.dateStr)
          return (
            <button
              key={p.dateStr}
              onClick={() => setSelectedDate(p.dateStr)}
              className="flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={{
                background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : isToday ? 'rgba(139,92,246,0.2)' : 'transparent'}`,
                color: isSelected ? '#8B5CF6' : isToday ? '#8B5CF6' : 'var(--t3)',
                opacity: hasSessions ? 1 : 0.5,
              }}
            >
              <span className="text-[10px] uppercase">{p.label}</span>
              <span className="text-sm font-semibold">{p.day}</span>
            </button>
          )
        })}
      </div>

      {/* ── Grid + Detail ── */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {daySessions.length === 0 ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t4)' }} />
              <p className="text-sm" style={{ color: 'var(--t3)' }}>No sessions scheduled for this day</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(600, courts.length * 140 + 70) }}>
                  {/* Court header */}
                  <div className="flex sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)' }}>
                    <div className="w-[70px] shrink-0 p-2" />
                    {courts.map((c) => (
                      <div key={c} className="flex-1 min-w-[120px] p-2 text-center" style={{ borderLeft: '1px solid var(--card-border)' }}>
                        <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>{shortenCourt(c)}</div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Pickleball</span>
                      </div>
                    ))}
                  </div>

                  {/* Hour rows */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="flex"
                      style={{
                        minHeight: 56,
                        background: hour === currentHour && selectedDate === todayStr ? 'rgba(139,92,246,0.04)' : 'transparent',
                      }}
                    >
                      {/* Time label */}
                      <div className="w-[70px] shrink-0 p-1.5 text-right pr-3 flex items-start justify-end sticky left-0 z-[5]" style={{ borderTop: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                        <span className="text-[10px] font-medium" style={{ color: hour === currentHour && selectedDate === todayStr ? '#8B5CF6' : 'var(--t4)' }}>{formatHour(hour)}</span>
                      </div>

                      {/* Court cells */}
                      {courts.map((court) => {
                        const key = `${court}|${hour}`
                        const isOccupied = sessionGrid.occupied.has(key)
                        const cellSessions = sessionGrid.map[key]

                        if (isOccupied) return null // spanned by a previous row

                        return (
                          <div
                            key={court}
                            className="flex-1 min-w-[120px] relative p-0.5"
                            style={{
                              borderTop: '1px solid var(--card-border)',
                              borderLeft: '1px solid var(--card-border)',
                              ...(cellSessions && cellSessions[0]?.rowSpan > 1 ? { minHeight: cellSessions[0].rowSpan * 56 } : {}),
                            }}
                          >
                            {!cellSessions ? (
                              <div className="w-full h-full min-h-[48px] rounded-lg border border-dashed" style={{ borderColor: 'var(--card-border)', opacity: 0.2 }} />
                            ) : (
                              cellSessions.map((s) => {
                                const sk = classifySkill(s.format, s.skillLevel)
                                const colors = SKILL_COLORS[sk.tier]
                                const pct = Math.round((s.registered / (s.capacity || 1)) * 100)
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => setSelectedSession(s)}
                                    className="w-full text-left rounded-lg p-2 transition-all hover:brightness-110 cursor-pointer h-full"
                                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                                  >
                                    <div className="text-[11px] font-semibold" style={{ color: colors.text }}>{sk.label}</div>
                                    {sk.range && <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{sk.range}</div>}
                                    <div className="text-[10px] font-medium mt-1" style={{ color: 'var(--heading)' }}>{s.registered}/{s.capacity}</div>
                                    <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: colors.text }} />
                                    </div>
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel (desktop) */}
        <AnimatePresence>
          {selectedSession && (
            <div className="w-[340px] shrink-0 hidden lg:block">
              <SessionDetail session={selectedSession} onClose={() => setSelectedSession(null)} clubId={clubId} isDark={isDark} />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile detail modal */}
      <AnimatePresence>
        {selectedSession && (
          <div className="lg:hidden fixed inset-0 z-50">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedSession(null)} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SessionDetail session={selectedSession} onClose={() => setSelectedSession(null)} clubId={clubId} isDark={isDark} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
