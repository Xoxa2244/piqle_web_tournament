import { describe, it, expect } from 'vitest'
import { generateOutreachMessages, type OutreachMessageInput } from '@/lib/ai/outreach-messages'

// ── Helpers ──

function makeInput(overrides?: Partial<OutreachMessageInput>): OutreachMessageInput {
  return {
    memberName: 'John Doe',
    clubName: 'Ace Pickleball Club',
    healthScore: 55,
    riskLevel: 'watch',
    lowComponents: [
      { key: 'frequencyTrend', label: 'Frequency declining', score: 40 },
      { key: 'recency', label: 'Last played 10 days ago', score: 50 },
    ],
    daysSinceLastActivity: 10,
    preferredDays: ['Monday', 'Wednesday'],
    suggestedSessionTitle: 'Evening Open Play',
    suggestedSessionDate: 'Thursday, Mar 13',
    suggestedSessionTime: '6:00–8:00 PM',
    suggestedSessionFormat: 'Open Play',
    confirmedCount: 5,
    sameLevelCount: 3,
    spotsLeft: 3,
    totalBookings: 20,
    tone: 'friendly',
    ...overrides,
  }
}

// ── CHECK_IN Messages ──

describe('Шаблоны кампаний > CHECK_IN (напоминание)', () => {
  it('3 варианта при наличии любимых дней', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput())
    expect(variants).toHaveLength(3)
  })

  it('2 варианта без preferredDays (pattern убирается)', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ preferredDays: undefined }))
    expect(variants).toHaveLength(2)
  })

  it('ровно 1 вариант помечен как recommended', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput())
    const recommended = variants.filter(v => v.recommended)
    expect(recommended).toHaveLength(1)
  })

  it('все варианты содержат subject + body + sms', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput())
    for (const v of variants) {
      expect(v.emailSubject).toBeTruthy()
      expect(v.emailBody).toBeTruthy()
      expect(v.smsBody).toBeTruthy()
    }
  })

  it('уникальные ID у каждого варианта', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput())
    const ids = variants.map(v => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('персонализация по имени ("Maria" в subject и body)', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ memberName: 'Maria Santos' }))
    for (const v of variants) {
      expect(v.emailBody).toContain('Maria')
      expect(v.emailSubject).toContain('Maria')
    }
  })

  it('название клуба в теле письма', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput())
    for (const v of variants) {
      expect(v.emailBody).toContain('Ace Pickleball Club')
    }
  })

  it('social proof "at your level" при sameLevelCount > 0', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ sameLevelCount: 3 }))
    const hasProof = variants.some(v => v.emailBody.includes('at your level'))
    expect(hasProof).toBe(true)
  })

  it('пропустил привычное расписание → рекомендация pattern', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({
      lowComponents: [{ key: 'patternBreak', label: 'Missed sessions', score: 30 }],
    }))
    const recommended = variants.find(v => v.recommended)
    expect(recommended?.id).toBe('checkin_pattern')
  })

  it('давно не играл → рекомендация recency', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({
      lowComponents: [{ key: 'recency', label: 'Last played 12 days ago', score: 40 }],
    }))
    const recommended = variants.find(v => v.recommended)
    expect(recommended?.id).toBe('checkin_recency')
  })

  it('частота снизилась → рекомендация frequency', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({
      lowComponents: [{ key: 'frequencyTrend', label: 'Frequency down', score: 35 }],
    }))
    const recommended = variants.find(v => v.recommended)
    expect(recommended?.id).toBe('checkin_frequency')
  })
})

// ── RETENTION_BOOST Messages ──

describe('Шаблоны кампаний > RETENTION_BOOST (возвращение)', () => {
  const retentionInput = makeInput({ riskLevel: 'at_risk', healthScore: 35 })

  it('3 варианта при наличии preferredDays', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', retentionInput)
    expect(variants).toHaveLength(3)
  })

  it('3 варианта без preferredDays (community вместо pattern)', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', makeInput({ preferredDays: undefined }))
    expect(variants).toHaveLength(3)
  })

  it('ровно 1 вариант recommended', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', retentionInput)
    const recommended = variants.filter(v => v.recommended)
    expect(recommended).toHaveLength(1)
  })

  it('все варианты заполнены (subject + body + sms)', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', retentionInput)
    for (const v of variants) {
      expect(v.emailSubject).toBeTruthy()
      expect(v.emailBody).toBeTruthy()
      expect(v.smsBody).toBeTruthy()
    }
  })

  it('без preferredDays → community вариант вместо pattern', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', makeInput({ preferredDays: undefined }))
    const ids = variants.map(v => v.id)
    expect(ids).toContain('retention_community')
    expect(ids).not.toContain('retention_pattern')
  })

  it('с preferredDays → pattern вариант', () => {
    const variants = generateOutreachMessages('RETENTION_BOOST', retentionInput)
    const ids = variants.map(v => v.id)
    expect(ids).toContain('retention_pattern')
    expect(ids).not.toContain('retention_community')
  })
})

// ── Edge Cases ──

describe('Шаблоны кампаний > Граничные случаи', () => {
  it('пустые lowComponents → не ломается, есть recommended', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ lowComponents: [] }))
    expect(variants.length).toBeGreaterThan(0)
    expect(variants.some(v => v.recommended)).toBe(true)
  })

  it('null daysSinceLastActivity → подставляется 0', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ daysSinceLastActivity: null }))
    expect(variants.length).toBeGreaterThan(0)
    // Should use 0 as fallback
    const recency = variants.find(v => v.id === 'checkin_recency')
    expect(recency?.emailSubject).toContain('0 days')
  })

  it('нет suggestedSessionTitle → fallback "our next session"', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ suggestedSessionTitle: undefined }))
    for (const v of variants) {
      expect(v.emailBody).toContain('our next session')
    }
  })

  it('имя без пробела (Madonna) → корректная обработка', () => {
    const variants = generateOutreachMessages('CHECK_IN', makeInput({ memberName: 'Madonna' }))
    expect(variants[0].emailBody).toContain('Madonna')
  })
})
