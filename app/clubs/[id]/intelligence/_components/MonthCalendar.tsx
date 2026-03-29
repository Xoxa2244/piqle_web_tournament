'use client'
/**
 * MonthCalendar — flight-booking style date range picker.
 * - Click month name → selects entire month instantly
 * - Click a day → starts selection; hover previews range; click again → completes
 * - Navigate months with ◀ ▶
 * - Future dates are disabled
 */
import { useState, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_HEADERS = ['M','T','W','T','F','S','S']

function isoDay(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function formatRange(from: string, to: string) {
  if (!from) return null
  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (!to || to === from) return fmtDate(from)
  return `${fmtDate(from)} – ${fmtDate(to)}`
}

interface Props {
  /** Label shown above calendar, e.g. "Period A" */
  label: string
  from: string
  to: string
  onChange: (from: string, to: string) => void
  isDark: boolean
  accentColor?: string
}

export function MonthCalendar({ label, from, to, onChange, isDark, accentColor = '#8B5CF6' }: Props) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Initial view: show the month of `from` if set, otherwise current month
  const initDate = () => {
    if (from) {
      const d = new Date(from + 'T12:00:00')
      return { y: d.getFullYear(), m: d.getMonth() }
    }
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  }
  const [view, setView] = useState<{ y: number; m: number }>(initDate)

  const [phase, setPhase] = useState<'idle' | 'selecting'>('idle')
  const [pendingFrom, setPendingFrom] = useState('')
  const [hovered, setHovered] = useState('')

  // Highlight range (live while hovering in selection phase)
  const effFrom = phase === 'selecting'
    ? (pendingFrom <= (hovered || pendingFrom) ? pendingFrom : (hovered || pendingFrom))
    : from
  const effTo = phase === 'selecting'
    ? (pendingFrom <= (hovered || pendingFrom) ? (hovered || pendingFrom) : pendingFrom)
    : to

  const handleDayClick = (iso: string) => {
    if (phase === 'idle') {
      setPendingFrom(iso)
      setPhase('selecting')
      onChange(iso, '')
    } else {
      const [f, t] = pendingFrom <= iso ? [pendingFrom, iso] : [iso, pendingFrom]
      onChange(f, t)
      setPhase('idle')
      setPendingFrom('')
      setHovered('')
    }
  }

  const handleMonthClick = () => {
    const first = isoDay(view.y, view.m, 1)
    const lastDay = new Date(view.y, view.m + 1, 0).getDate()
    const last = isoDay(view.y, view.m, lastDay)
    onChange(first, last)
    setPhase('idle')
    setPendingFrom('')
    setHovered('')
  }

  const prevMonth = () => setView(v => {
    if (v.m === 0) return { y: v.y - 1, m: 11 }
    return { y: v.y, m: v.m - 1 }
  })
  const nextMonth = () => setView(v => {
    if (v.m === 11) return { y: v.y + 1, m: 0 }
    return { y: v.y, m: v.m + 1 }
  })

  // Build day grid with leading empty cells (Monday-first)
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDay(view.y, view.m, d))

  const rangeLabel = formatRange(from, to)

  return (
    <div className="flex flex-col select-none" style={{ minWidth: 220 }}>
      {/* Label */}
      <div
        className="text-[10px] font-semibold uppercase tracking-wider text-center mb-2"
        style={{ color: 'var(--t4)' }}
      >
        {label}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: 'var(--t3)' }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>

        <button
          onClick={handleMonthClick}
          className="px-3 py-1 rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
          style={{
            color: 'var(--heading)',
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}30`,
          }}
          title="Click to select entire month"
        >
          {MONTH_NAMES[view.m]} {view.y}
        </button>

        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: 'var(--t3)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="flex items-center justify-center h-5 text-[9px]" style={{ color: 'var(--t4)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} className="h-7" />

          const isFuture = iso > todayIso
          const isStart = !!effFrom && iso === effFrom
          const isEnd = !!effTo && iso === effTo && effTo !== effFrom
          const inRange = !!effFrom && !!effTo && iso > effFrom && iso < effTo
          const isToday = iso === todayIso

          return (
            <div
              key={iso}
              className="flex items-center justify-center"
              style={{
                height: 28,
                background: inRange ? `${accentColor}18` : 'transparent',
                // Extend range bg to edges
                borderRadius: isStart ? '0 0 0 0' : isEnd ? '0 0 0 0' : '0',
              }}
            >
              <button
                disabled={isFuture}
                onClick={() => !isFuture && handleDayClick(iso)}
                onMouseEnter={() => phase === 'selecting' && !isFuture && setHovered(iso)}
                onMouseLeave={() => phase === 'selecting' && setHovered('')}
                className="w-7 h-7 flex items-center justify-center text-[11px] rounded-full transition-colors relative"
                style={{
                  background: isStart || isEnd ? accentColor : 'transparent',
                  color: isStart || isEnd ? '#fff' : isFuture ? 'var(--t4)' : 'var(--t2)',
                  fontWeight: isStart || isEnd || isToday ? 700 : 400,
                  cursor: isFuture ? 'default' : 'pointer',
                  opacity: isFuture ? 0.2 : 1,
                  boxShadow:
                    isToday && !isStart && !isEnd
                      ? `inset 0 0 0 1.5px ${accentColor}60`
                      : 'none',
                }}
              >
                {new Date(iso + 'T12:00:00').getDate()}
              </button>
            </div>
          )
        })}
      </div>

      {/* Range / status label */}
      <div className="mt-2 min-h-[18px] text-center">
        {phase === 'selecting' ? (
          <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
            Click end date — or click month to select all
          </span>
        ) : rangeLabel ? (
          <span className="text-[10px] font-medium" style={{ color: accentColor }}>
            {rangeLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
