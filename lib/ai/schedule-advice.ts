/**
 * Schedule Advice — deterministic week-level schedule recommendations.
 *
 * Powers the Schedule page's "Advise" drawer on the lean build. Given the
 * visible week's sessions and ~12 weeks of history, it answers two
 * questions an operator actually asks:
 *
 *   1. Which upcoming sessions are weak — and is each one structurally
 *      dead (the slot never fills → REMOVE) or just under-promoted (the
 *      slot historically fills → FILL it, don't kill it)?
 *   2. Which historically strong slots have nothing scheduled this week
 *      (→ CREATE suggestions, ranked by proven fill).
 *
 * Pure TypeScript over plain rows — no DB, no LLM — so it is unit-testable
 * and cheap to run per request. Execution is advisory only: clubs sync
 * read-only from CourtReserve, so the output is an action plan, never a
 * mutation (see the no-fake-writes rule, action-center cleanup 9af48540).
 */

import { isEquipmentBooking } from './programming-tier-classifier'

export type AdviceSessionRow = {
  id: string
  title: string | null
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  format: string
  skillLevel: string | null
  maxPlayers: number
  registeredCount: number
}

export type WeakSessionAdvice = {
  sessionId: string
  title: string
  date: string
  startTime: string
  format: string
  occupancy: number // 0-100
  peerAvgOccupancy: number | null
  peerSamples: number
  verdict: 'remove' | 'fill' | 'review'
  reason: string
}

export type CreateSlotAdvice = {
  date: string
  dayLabel: string // "Thu"
  startTime: string // "19:00"
  format: string
  skillLevel: string | null
  histOccupancy: number
  histSessions: number
  avgPlayers: number
  reason: string
}

export type ScheduleAdvice = {
  weekStart: string
  analyzedUpcoming: number
  weak: WeakSessionAdvice[]
  create: CreateSlotAdvice[]
}

// Thresholds — chosen to match the existing UI vocabulary:
// SessionDetailIQ classifies <35% as "weak"; insights call >=70% strong.
const WEAK_FILL_PCT = 35 // upcoming session below this → flagged
const STRONG_SLOT_PCT = 55 // historical peer above this → "fill", not "remove"
const DEAD_SLOT_PCT = 40 // historical peer below this → "remove"
const MIN_PEER_SAMPLES = 3
const CREATE_MIN_FILL_PCT = 70
const CREATE_MIN_SAMPLES = 4
const CREATE_LIMIT = 5
const EARLIEST_HOUR = 6
const LATEST_HOUR = 21

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fillPct = (s: AdviceSessionRow) =>
  s.maxPlayers > 0 ? Math.round((s.registeredCount / s.maxPlayers) * 100) : 0

const hourOf = (s: AdviceSessionRow) => parseInt(s.startTime.split(':')[0], 10)

// Sessions store date at a fixed time-of-day (CR sync: T12:00:00Z), so UTC
// day-of-week from the date string is stable.
const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

const FORMAT_LABELS: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}
const formatLabel = (f: string) => FORMAT_LABELS[f] ?? f

type SlotStat = { fillSum: number; playersSum: number; count: number; skills: Map<string, number> }

function addStat(map: Map<string, SlotStat>, key: string, s: AdviceSessionRow) {
  let st = map.get(key)
  if (!st) {
    st = { fillSum: 0, playersSum: 0, count: 0, skills: new Map() }
    map.set(key, st)
  }
  st.fillSum += fillPct(s)
  st.playersSum += s.registeredCount
  st.count += 1
  const skill = s.skillLevel ?? 'ALL_LEVELS'
  st.skills.set(skill, (st.skills.get(skill) ?? 0) + 1)
}

const avgFill = (st: SlotStat) => Math.round(st.fillSum / st.count)

function dominantSkill(st: SlotStat): string | null {
  let best: string | null = null
  let bestN = 0
  st.skills.forEach((n, skill) => {
    if (n > bestN) { best = skill; bestN = n }
  })
  return best
}

export function buildScheduleAdvice(input: {
  weekSessions: AdviceSessionRow[]
  historySessions: AdviceSessionRow[]
  weekStart: string // Monday, YYYY-MM-DD
  today: string // YYYY-MM-DD
}): ScheduleAdvice {
  const { weekStart, today } = input
  // Equipment bookings (ball machine, court/paddle rental) are not
  // programming — never advise removing them, never let them shape peer
  // stats or create suggestions. They still occupy court slots, so the
  // raw week list keeps them for slot-conflict context below.
  const isPlayable = (s: AdviceSessionRow) =>
    !isEquipmentBooking({ title: s.title ?? undefined, format: s.format })
  const weekSessions = input.weekSessions
  // Strictly-past history only: sessions dated today can appear in BOTH the
  // history fetch and the analyzed week, letting a currently-weak session
  // drag down its own peer average toward a false "remove" verdict.
  const historySessions = input.historySessions.filter((s) => s.date < today && isPlayable(s))

  // Historical stats: by (dow|hour|format) and a coarser (dow|hour) fallback.
  const byCombo = new Map<string, SlotStat>()
  const bySlot = new Map<string, SlotStat>()
  for (const s of historySessions) {
    if (s.maxPlayers <= 0) continue
    const dow = dowOf(s.date)
    const hour = hourOf(s)
    if (Number.isNaN(hour)) continue
    addStat(byCombo, `${dow}|${hour}|${s.format}`, s)
    addStat(bySlot, `${dow}|${hour}`, s)
  }

  // ── 1. Weak upcoming sessions: remove vs fill vs review ──
  const upcoming = weekSessions.filter((s) => s.date >= today && s.maxPlayers > 0 && isPlayable(s))
  const weak: WeakSessionAdvice[] = []
  for (const s of upcoming) {
    const pct = fillPct(s)
    if (pct >= WEAK_FILL_PCT) continue
    const dow = dowOf(s.date)
    const hour = hourOf(s)
    const slotName = `${DAY_LABELS[dow]} ${s.startTime}`
    const combo = byCombo.get(`${dow}|${hour}|${s.format}`)
    const slot = bySlot.get(`${dow}|${hour}`)
    const peer = combo && combo.count >= MIN_PEER_SAMPLES ? combo
      : slot && slot.count >= MIN_PEER_SAMPLES ? slot
      : null
    const base = {
      sessionId: s.id,
      title: (s.title || '').trim() || formatLabel(s.format),
      date: s.date,
      startTime: s.startTime,
      format: s.format,
      occupancy: pct,
      peerAvgOccupancy: peer ? avgFill(peer) : null,
      peerSamples: peer?.count ?? (combo?.count ?? 0),
    }
    if (!peer) {
      weak.push({
        ...base,
        verdict: 'review',
        reason: base.peerSamples === 0
          ? 'No comparable past sessions in this slot — not enough history to call it. Watch signups.'
          : `Only ${base.peerSamples} comparable past session${base.peerSamples === 1 ? '' : 's'} in this slot — not enough history to call it. Watch signups.`,
      })
    } else if (avgFill(peer) >= STRONG_SLOT_PCT) {
      weak.push({
        ...base,
        verdict: 'fill',
        reason: `${slotName} historically fills to ${avgFill(peer)}% (${peer.count} sessions) — demand exists. Promote it instead of cancelling.`,
      })
    } else if (avgFill(peer) < DEAD_SLOT_PCT) {
      weak.push({
        ...base,
        verdict: 'remove',
        reason: `${slotName} ${formatLabel(s.format)} averaged ${avgFill(peer)}% over ${peer.count} past sessions — structurally low demand. Consider removing it and reinvesting the court time.`,
      })
    } else {
      weak.push({
        ...base,
        verdict: 'review',
        reason: `${slotName} historically lands at ${avgFill(peer)}% (${peer.count} sessions) — borderline. Try one more promoted run before cutting it.`,
      })
    }
  }
  // Most actionable first: remove, then fill, then review; worst fill first.
  const verdictOrder = { remove: 0, fill: 1, review: 2 } as const
  weak.sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict] || a.occupancy - b.occupancy)

  // ── 2. Create suggestions: proven slots with nothing scheduled ──
  const weekHas = new Set(weekSessions.map((s) => `${dowOf(s.date)}|${hourOf(s)}|${s.format}`))
  const weekSlotBusy = new Set(weekSessions.map((s) => `${dowOf(s.date)}|${hourOf(s)}`))
  const weekStartDate = new Date(`${weekStart}T12:00:00Z`)
  const candidates: CreateSlotAdvice[] = []
  byCombo.forEach((st, key) => {
    const [dowStr, hourStr, format] = key.split('|')
    const dow = parseInt(dowStr, 10)
    const hour = parseInt(hourStr, 10)
    if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) return
    if (st.count < CREATE_MIN_SAMPLES || avgFill(st) < CREATE_MIN_FILL_PCT) return
    if (weekHas.has(key)) return // same idea already scheduled this week
    // Map dow → concrete date inside the visible week (weekStart = Monday).
    const offset = (dow + 6) % 7
    const d = new Date(weekStartDate)
    d.setUTCDate(d.getUTCDate() + offset)
    const date = d.toISOString().slice(0, 10)
    if (date < today) return // don't suggest creating in the past
    const slotBusy = weekSlotBusy.has(`${dow}|${hour}`)
    candidates.push({
      date,
      dayLabel: DAY_LABELS[dow],
      startTime: `${String(hour).padStart(2, '0')}:00`,
      format,
      skillLevel: dominantSkill(st),
      histOccupancy: avgFill(st),
      histSessions: st.count,
      avgPlayers: Math.round(st.playersSum / st.count),
      reason: `${DAY_LABELS[dow]} ${hour}:00 ${formatLabel(format)} averaged ${avgFill(st)}% fill (~${Math.round(st.playersSum / st.count)} players) over ${st.count} past sessions${slotBusy ? '; another format currently holds this slot' : ' and the slot is open this week'}.`,
    })
  })
  candidates.sort((a, b) => b.histOccupancy - a.histOccupancy || b.histSessions - a.histSessions)
  // One suggestion per (day, hour) — keep the strongest format.
  const seenSlot = new Set<string>()
  const create = candidates.filter((c) => {
    const k = `${c.date}|${c.startTime}`
    if (seenSlot.has(k)) return false
    seenSlot.add(k)
    return true
  }).slice(0, CREATE_LIMIT)

  return { weekStart, analyzedUpcoming: upcoming.length, weak, create }
}
