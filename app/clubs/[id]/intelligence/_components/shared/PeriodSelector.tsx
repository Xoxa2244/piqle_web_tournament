'use client'

import { useState } from 'react'

/**
 * Shared reporting-period selector — the proven Programming Health pattern
 * (preset segmented control + inline custom date-range editor) extracted so
 * Membership Health (and future analytics pages) share one control.
 *
 * Two preset flavors:
 *  - day presets   → relative windows ending now ("7d", "30d")
 *  - range presets → computed absolute ranges ("Last month", "MTD", "YTD"),
 *    resolved to ISO dates at click time
 *
 * The emitted value is what the analytics procedures accept: either
 * { kind: 'days', days } → periodDays, or { kind: 'range', start, end } →
 * startDate/endDate (endDate inclusive, matching resolveTierWindow /
 * resolveProgrammingPeriod semantics).
 */
export type PeriodValue =
  | { kind: 'days'; days: number }
  | { kind: 'range'; start: string; end: string; presetKey?: string }

export type DayPreset = { days: number; label: string }
export type RangePreset = { key: string; label: string; compute: () => { start: string; end: string } }

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Last full calendar month / month-to-date / year-to-date, in UTC dates. */
export const STANDARD_RANGE_PRESETS: RangePreset[] = [
  {
    key: 'last_month',
    label: 'Last month',
    compute: () => {
      const now = new Date()
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
      return { start: iso(first), end: iso(last) }
    },
  },
  {
    key: 'mtd',
    label: 'MTD',
    compute: () => {
      const now = new Date()
      return { start: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), end: iso(now) }
    },
  },
  {
    key: 'ytd',
    label: 'YTD',
    compute: () => {
      const now = new Date()
      return { start: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), end: iso(now) }
    },
  },
]

export function periodLabel(value: PeriodValue, dayPresets: DayPreset[], rangePresets: RangePreset[]): string {
  if (value.kind === 'days') {
    return dayPresets.find((p) => p.days === value.days)?.label ?? `${value.days}d`
  }
  const preset = value.presetKey ? rangePresets.find((p) => p.key === value.presetKey) : undefined
  return preset ? preset.label : 'custom range'
}

export function PeriodSelector({
  value,
  onChange,
  dayPresets = [
    { days: 7, label: '7d' },
    { days: 30, label: '30d' },
  ],
  rangePresets = STANDARD_RANGE_PRESETS,
}: {
  value: PeriodValue
  onChange: (next: PeriodValue) => void
  dayPresets?: DayPreset[]
  rangePresets?: RangePreset[]
}) {
  const [showCustom, setShowCustom] = useState(false)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')

  const isCustom = value.kind === 'range' && !value.presetKey

  // Open the custom-range editor seeded with the current window.
  const openCustom = () => {
    const today = new Date()
    if (value.kind === 'range') {
      setDraftStart(value.start)
      setDraftEnd(value.end)
    } else {
      setDraftStart(iso(new Date(today.getTime() - value.days * 86_400_000)))
      setDraftEnd(iso(today))
    }
    setShowCustom((s) => !s)
  }
  const applyCustom = () => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return
    onChange({ kind: 'range', start: draftStart, end: draftEnd })
    setShowCustom(false)
  }

  return (
    <div className="flex items-start gap-2 flex-wrap justify-end">
      <div
        className="inline-flex rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--card-border)' }}
      >
        {dayPresets.map((p) => {
          const active = value.kind === 'days' && p.days === value.days
          return (
            <button
              key={p.days}
              onClick={() => {
                setShowCustom(false)
                onChange({ kind: 'days', days: p.days })
              }}
              className="px-3 py-1.5 text-sm font-semibold transition-colors"
              style={{
                background: active ? 'var(--accent, #A855F7)' : 'var(--subtle)',
                color: active ? '#fff' : 'var(--t2)',
              }}
            >
              {p.label}
            </button>
          )
        })}
        {rangePresets.map((p) => {
          const active = value.kind === 'range' && value.presetKey === p.key
          return (
            <button
              key={p.key}
              onClick={() => {
                setShowCustom(false)
                onChange({ kind: 'range', ...p.compute(), presetKey: p.key })
              }}
              className="px-3 py-1.5 text-sm font-semibold transition-colors"
              style={{
                background: active ? 'var(--accent, #A855F7)' : 'var(--subtle)',
                color: active ? '#fff' : 'var(--t2)',
              }}
            >
              {p.label}
            </button>
          )
        })}
        <button
          onClick={openCustom}
          className="px-3 py-1.5 text-sm font-semibold transition-colors"
          style={{
            background: isCustom ? 'var(--accent, #A855F7)' : 'var(--subtle)',
            color: isCustom ? '#fff' : 'var(--t2)',
          }}
          title="Custom date range"
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div
          className="flex items-center gap-1.5 rounded-lg p-1.5"
          style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}
        >
          <input
            type="date"
            value={draftStart}
            max={draftEnd || undefined}
            onChange={(e) => setDraftStart(e.target.value)}
            className="text-xs rounded px-2 py-1"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--t2)' }}
          />
          <span style={{ color: 'var(--t4)', fontSize: 12 }}>→</span>
          <input
            type="date"
            value={draftEnd}
            min={draftStart || undefined}
            onChange={(e) => setDraftEnd(e.target.value)}
            className="text-xs rounded px-2 py-1"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--t2)' }}
          />
          <button
            onClick={applyCustom}
            disabled={!draftStart || !draftEnd || draftStart > draftEnd}
            className="text-xs font-semibold rounded px-2.5 py-1 transition-opacity disabled:opacity-40"
            style={{ background: 'var(--accent, #A855F7)', color: '#fff' }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
