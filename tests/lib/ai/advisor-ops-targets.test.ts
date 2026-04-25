/**
 * parseTargetFromMessage + resolvePendingTarget pin the natural-language
 * matching we do when a user says "approve the reactivation one" in
 * Advisor chat. The resolver runs against a fresh pending-queue snapshot
 * from DB every call, so these tests just fix the pure logic.
 *
 * Cases we care about:
 *   • Bulk selectors: "all", "every"
 *   • Ordinal: "first" / "#1" / "2nd"
 *   • Type filter via synonyms: "reactivation" / "win-back" / "slot filler"
 *   • Channel filter: "sms" / "email"
 *   • Combined: "approve all SMS reactivation" (bulk + channel + type)
 *   • Ambiguous → caller should see hint + match list, not fire an action
 *   • No signal → null parse → caller should ask for clarification
 */

import { describe, it, expect } from 'vitest'
import {
  parseTargetFromMessage,
  resolvePendingTarget,
  type PendingTargetItem,
} from '@/lib/ai/advisor-ops-targets'

const items: PendingTargetItem[] = [
  { id: 'a', type: 'REACTIVATION', title: 'Reactivate 30+ day inactive', channel: 'email' },
  { id: 'b', type: 'REACTIVATION', title: 'Win-back SMS to lapsed', channel: 'sms' },
  { id: 'c', type: 'SLOT_FILLER', title: 'Fill Thursday Open Play', channel: 'email' },
  { id: 'd', type: 'CHECK_IN', title: 'Quiet check-in for Alex Thompson', channel: 'email' },
]

describe('parseTargetFromMessage', () => {
  it('returns null when no actionable signal is present', () => {
    expect(parseTargetFromMessage('approve something soon')).toBeNull()
  })

  it('picks up bulk "all"', () => {
    const t = parseTargetFromMessage('approve all')
    expect(t?.isBulk).toBe(true)
  })

  it('ordinal + type at the same time', () => {
    const t = parseTargetFromMessage('approve the 2nd reactivation')
    expect(t?.ordinal).toBe(2)
    expect(t?.typeMatch).toBe('reactivation')
  })

  it('recognizes word ordinals (first/second/last)', () => {
    expect(parseTargetFromMessage('approve first')?.ordinal).toBe(1)
    expect(parseTargetFromMessage('skip the last one')?.ordinal).toBe(-1)
  })

  it('recognizes "#N" / "item N" / "number N"', () => {
    expect(parseTargetFromMessage('approve #3')?.ordinal).toBe(3)
    expect(parseTargetFromMessage('skip item 1')?.ordinal).toBe(1)
    expect(parseTargetFromMessage('approve number 5')?.ordinal).toBe(5)
  })

  it('recognizes channel filters', () => {
    expect(parseTargetFromMessage('approve all sms')?.channelMatch).toBe('sms')
    expect(parseTargetFromMessage('skip all emails')?.channelMatch).toBe('email')
  })

  it('type synonyms map to canonical fragments', () => {
    expect(parseTargetFromMessage('approve the win-back one')?.typeMatch).toBe('reactivation')
    expect(parseTargetFromMessage('approve all slot filler')?.typeMatch).toBe('slot')
    expect(parseTargetFromMessage('skip the check-in')?.typeMatch).toBe('check_in')
  })

  it('"the reactivation one" → type match without bulk', () => {
    const t = parseTargetFromMessage('approve the reactivation one')
    expect(t?.isBulk).toBe(false)
    expect(t?.typeMatch).toBe('reactivation')
  })

  it('combined bulk + channel + type', () => {
    const t = parseTargetFromMessage('approve all SMS reactivation')
    expect(t?.isBulk).toBe(true)
    expect(t?.channelMatch).toBe('sms')
    expect(t?.typeMatch).toBe('reactivation')
  })

  it('captures Alex\'s one', () => {
    const t = parseTargetFromMessage("approve Alex's one")
    expect(t?.nameMatch).toBe('alex')
  })
})

describe('resolvePendingTarget', () => {
  it('empty queue → empty outcome (no action needed)', () => {
    const out = resolvePendingTarget([], { isBulk: true })
    expect(out.kind).toBe('empty')
  })

  it('bulk + no filter → all items', () => {
    const out = resolvePendingTarget(items, { isBulk: true })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.isBulk).toBe(true)
    expect(out.items).toHaveLength(items.length)
  })

  it('bulk + channel=sms → only the SMS item', () => {
    const out = resolvePendingTarget(items, { isBulk: true, channelMatch: 'sms' })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items.map((i) => i.id)).toEqual(['b'])
  })

  it('type=reactivation → 2 items → ambiguous when no ordinal', () => {
    const out = resolvePendingTarget(items, { isBulk: false, typeMatch: 'reactivation' })
    expect(out.kind).toBe('ambiguous')
    if (out.kind === 'ambiguous') {
      expect(out.matches.map((i) => i.id)).toEqual(['a', 'b'])
      expect(out.hint).toContain('matching')
    }
  })

  it('type=reactivation + ordinal=2 → picks the 2nd of the 2 matches', () => {
    const out = resolvePendingTarget(items, { isBulk: false, typeMatch: 'reactivation', ordinal: 2 })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items.map((i) => i.id)).toEqual(['b'])
  })

  it('type=slot → uniquely resolves without ordinal', () => {
    const out = resolvePendingTarget(items, { isBulk: false, typeMatch: 'slot' })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items).toHaveLength(1)
    expect(out.items[0].id).toBe('c')
  })

  it('ordinal=1 on full queue → first item', () => {
    const out = resolvePendingTarget(items, { isBulk: false, ordinal: 1 })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items[0].id).toBe('a')
  })

  it('ordinal=-1 (last) picks the last item in the pool', () => {
    const out = resolvePendingTarget(items, { isBulk: false, ordinal: -1 })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items[0].id).toBe('d')
  })

  it('ordinal out of range clamps to the last item (lenient)', () => {
    const out = resolvePendingTarget(items, { isBulk: false, ordinal: 99 })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items[0].id).toBe('d')
  })

  it('name match narrows pool ("alex" → CHECK_IN only)', () => {
    const out = resolvePendingTarget(items, { isBulk: false, nameMatch: 'alex' })
    if (out.kind !== 'resolved') throw new Error('expected resolved')
    expect(out.items.map((i) => i.id)).toEqual(['d'])
  })

  it('no-match filter → explicit "none_match" hint mentioning the unmet criteria', () => {
    const out = resolvePendingTarget(items, { isBulk: false, typeMatch: 'referral' })
    expect(out.kind).toBe('none_match')
    if (out.kind === 'none_match') {
      expect(out.hint.toLowerCase()).toContain('referral')
    }
  })
})
