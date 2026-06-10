import { describe, expect, it } from 'vitest'
import { resolveTierWindow } from '@/lib/ai/membership-economics'

describe('resolveTierWindow', () => {
  it('defaults to the historical 30-day window ending now', () => {
    const before = Date.now()
    const win = resolveTierWindow()
    const after = Date.now()

    expect(win.periodDays).toBe(30)
    expect(win.windowText).toBe('in the last 30 days')
    expect(win.end.getTime()).toBeGreaterThanOrEqual(before)
    expect(win.end.getTime()).toBeLessThanOrEqual(after)
    expect(win.end.getTime() - win.start.getTime()).toBe(30 * 86_400_000)
  })

  it('honors a relative periodDays window', () => {
    const win = resolveTierWindow({ periodDays: 7 })
    expect(win.periodDays).toBe(7)
    expect(win.windowText).toBe('in the last 7 days')
    expect(win.end.getTime() - win.start.getTime()).toBe(7 * 86_400_000)
  })

  it('clamps periodDays to [1, 730]', () => {
    expect(resolveTierWindow({ periodDays: 0 }).periodDays).toBe(1)
    expect(resolveTierWindow({ periodDays: -5 }).periodDays).toBe(1)
    expect(resolveTierWindow({ periodDays: 5000 }).periodDays).toBe(730)
  })

  it('treats an absolute range as endDate-inclusive and derives periodDays', () => {
    const win = resolveTierWindow({ startDate: '2026-05-01', endDate: '2026-05-31' })
    // May 1 .. May 31 inclusive = 31 days; exclusive bound = June 1.
    expect(win.periodDays).toBe(31)
    expect(win.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(win.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(win.windowText).toBe('in the selected period')
  })

  it('treats a single-day range as one day', () => {
    const win = resolveTierWindow({ startDate: '2026-06-10', endDate: '2026-06-10' })
    expect(win.periodDays).toBe(1)
  })

  it('falls back to relative resolution when only one bound is provided', () => {
    // startDate without endDate is not a valid absolute range — same contract
    // as resolveProgrammingPeriod (both bounds or neither).
    const win = resolveTierWindow({ startDate: '2026-05-01', periodDays: 14 })
    expect(win.periodDays).toBe(14)
    expect(win.windowText).toBe('in the last 14 days')
  })
})
