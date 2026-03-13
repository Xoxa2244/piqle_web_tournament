import { describe, it, expect } from 'vitest'
import {
  getDayName,
  getTimeSlot,
  getTimeSlotLabel,
  getFormatLabel,
  inferSkillLevel,
  isAdjacentSkillLevel,
  getSkillLevelLabel,
  getOccupancyPercent,
  daysBetween,
  clamp,
} from '@/lib/ai/scoring'

// ── getDayName ──

describe('getDayName', () => {
  it('returns Monday for a known Monday', () => {
    expect(getDayName(new Date('2026-03-09T12:00:00'))).toBe('Monday')
  })

  it('returns Sunday for a known Sunday', () => {
    expect(getDayName(new Date('2026-03-08T12:00:00'))).toBe('Sunday')
  })

  it('returns Saturday for a known Saturday', () => {
    expect(getDayName(new Date('2026-03-07T12:00:00'))).toBe('Saturday')
  })

  it('returns Wednesday for a known Wednesday', () => {
    expect(getDayName(new Date('2026-03-11T12:00:00'))).toBe('Wednesday')
  })
})

// ── getTimeSlot ──

describe('getTimeSlot', () => {
  it('returns morning for 08:00', () => {
    expect(getTimeSlot('08:00')).toBe('morning')
  })

  it('returns morning for 11:59', () => {
    expect(getTimeSlot('11:59')).toBe('morning')
  })

  it('returns afternoon for 12:00', () => {
    expect(getTimeSlot('12:00')).toBe('afternoon')
  })

  it('returns afternoon for 16:59', () => {
    expect(getTimeSlot('16:59')).toBe('afternoon')
  })

  it('returns evening for 17:00', () => {
    expect(getTimeSlot('17:00')).toBe('evening')
  })

  it('returns evening for 23:00', () => {
    expect(getTimeSlot('23:00')).toBe('evening')
  })

  it('returns morning for 00:00 (midnight)', () => {
    expect(getTimeSlot('00:00')).toBe('morning')
  })
})

// ── getTimeSlotLabel ──

describe('getTimeSlotLabel', () => {
  it('returns Morning', () => {
    expect(getTimeSlotLabel('morning')).toBe('Morning')
  })

  it('returns Afternoon', () => {
    expect(getTimeSlotLabel('afternoon')).toBe('Afternoon')
  })

  it('returns Evening', () => {
    expect(getTimeSlotLabel('evening')).toBe('Evening')
  })
})

// ── getFormatLabel ──

describe('getFormatLabel', () => {
  it('returns Open Play for OPEN_PLAY', () => {
    expect(getFormatLabel('OPEN_PLAY')).toBe('Open Play')
  })

  it('returns Clinic for CLINIC', () => {
    expect(getFormatLabel('CLINIC')).toBe('Clinic')
  })

  it('returns Drill Session for DRILL', () => {
    expect(getFormatLabel('DRILL')).toBe('Drill Session')
  })

  it('returns League Play for LEAGUE_PLAY', () => {
    expect(getFormatLabel('LEAGUE_PLAY')).toBe('League Play')
  })

  it('returns Social Play for SOCIAL', () => {
    expect(getFormatLabel('SOCIAL')).toBe('Social Play')
  })

  it('returns raw value for unknown format', () => {
    expect(getFormatLabel('CUSTOM_FORMAT')).toBe('CUSTOM_FORMAT')
  })
})

// ── inferSkillLevel ──

describe('inferSkillLevel', () => {
  it('returns BEGINNER for DUPR < 3.0', () => {
    expect(inferSkillLevel(2.5)).toBe('BEGINNER')
    expect(inferSkillLevel(1.0)).toBe('BEGINNER')
    expect(inferSkillLevel(2.99)).toBe('BEGINNER')
  })

  it('returns INTERMEDIATE for DUPR 3.0-4.49', () => {
    expect(inferSkillLevel(3.0)).toBe('INTERMEDIATE')
    expect(inferSkillLevel(3.5)).toBe('INTERMEDIATE')
    expect(inferSkillLevel(4.49)).toBe('INTERMEDIATE')
  })

  it('returns ADVANCED for DUPR >= 4.5', () => {
    expect(inferSkillLevel(4.5)).toBe('ADVANCED')
    expect(inferSkillLevel(5.0)).toBe('ADVANCED')
    expect(inferSkillLevel(6.0)).toBe('ADVANCED')
  })

  it('returns INTERMEDIATE for null (no rating)', () => {
    expect(inferSkillLevel(null)).toBe('INTERMEDIATE')
  })

  it('returns INTERMEDIATE for 0 (falsy rating)', () => {
    expect(inferSkillLevel(0)).toBe('INTERMEDIATE')
  })
})

// ── isAdjacentSkillLevel ──

describe('isAdjacentSkillLevel', () => {
  it('BEGINNER and INTERMEDIATE are adjacent', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'INTERMEDIATE')).toBe(true)
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'BEGINNER')).toBe(true)
  })

  it('INTERMEDIATE and ADVANCED are adjacent', () => {
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'ADVANCED')).toBe(true)
    expect(isAdjacentSkillLevel('ADVANCED', 'INTERMEDIATE')).toBe(true)
  })

  it('BEGINNER and ADVANCED are NOT adjacent', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'ADVANCED')).toBe(false)
    expect(isAdjacentSkillLevel('ADVANCED', 'BEGINNER')).toBe(false)
  })

  it('same level is NOT adjacent (distance = 0)', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'BEGINNER')).toBe(false)
    expect(isAdjacentSkillLevel('ADVANCED', 'ADVANCED')).toBe(false)
  })

  it('ALL_LEVELS returns false (not in levels array)', () => {
    expect(isAdjacentSkillLevel('ALL_LEVELS', 'BEGINNER')).toBe(false)
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'ALL_LEVELS')).toBe(false)
  })
})

// ── getSkillLevelLabel ──

describe('getSkillLevelLabel', () => {
  it('returns correct labels for all levels', () => {
    expect(getSkillLevelLabel('BEGINNER')).toBe('Beginner (2.5-3.0)')
    expect(getSkillLevelLabel('INTERMEDIATE')).toBe('Intermediate (3.5-4.5)')
    expect(getSkillLevelLabel('ADVANCED')).toBe('Advanced (5.0+)')
    expect(getSkillLevelLabel('ALL_LEVELS')).toBe('All Levels')
  })
})

// ── getOccupancyPercent ──

describe('getOccupancyPercent', () => {
  it('calculates correct percentage', () => {
    expect(getOccupancyPercent(4, 8)).toBe(50)
    expect(getOccupancyPercent(8, 8)).toBe(100)
    expect(getOccupancyPercent(3, 12)).toBe(25)
  })

  it('returns 100 when maxPlayers is 0', () => {
    expect(getOccupancyPercent(0, 0)).toBe(100)
  })

  it('returns 0 when no confirmed players', () => {
    expect(getOccupancyPercent(0, 8)).toBe(0)
  })

  it('rounds to nearest integer', () => {
    expect(getOccupancyPercent(1, 3)).toBe(33) // 33.33... → 33
    expect(getOccupancyPercent(2, 3)).toBe(67) // 66.66... → 67
  })
})

// ── daysBetween ──

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    const d = new Date('2026-03-12')
    expect(daysBetween(d, d)).toBe(0)
  })

  it('returns 1 for consecutive days', () => {
    expect(daysBetween(new Date('2026-03-12'), new Date('2026-03-13'))).toBe(1)
  })

  it('returns positive regardless of order', () => {
    const a = new Date('2026-03-01')
    const b = new Date('2026-03-15')
    expect(daysBetween(a, b)).toBe(14)
    expect(daysBetween(b, a)).toBe(14)
  })

  it('handles month boundaries', () => {
    expect(daysBetween(new Date('2026-02-28'), new Date('2026-03-01'))).toBe(1)
  })
})

// ── clamp ──

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('returns min when value is below', () => {
    expect(clamp(-10, 0, 100)).toBe(0)
  })

  it('returns max when value is above', () => {
    expect(clamp(150, 0, 100)).toBe(100)
  })

  it('handles edge cases at boundaries', () => {
    expect(clamp(0, 0, 100)).toBe(0)
    expect(clamp(100, 0, 100)).toBe(100)
  })
})
