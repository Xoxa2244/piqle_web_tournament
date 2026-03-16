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

describe('Утилиты скоринга > Определение дня недели', () => {
  it('2026-03-09 → Monday', () => {
    expect(getDayName(new Date('2026-03-09T12:00:00'))).toBe('Monday')
  })

  it('2026-03-08 → Sunday', () => {
    expect(getDayName(new Date('2026-03-08T12:00:00'))).toBe('Sunday')
  })

  it('2026-03-07 → Saturday', () => {
    expect(getDayName(new Date('2026-03-07T12:00:00'))).toBe('Saturday')
  })

  it('2026-03-11 → Wednesday', () => {
    expect(getDayName(new Date('2026-03-11T12:00:00'))).toBe('Wednesday')
  })
})

// ── getTimeSlot ──

describe('Утилиты скоринга > Временные слоты', () => {
  it('08:00 → morning', () => {
    expect(getTimeSlot('08:00')).toBe('morning')
  })

  it('11:59 → morning (граница)', () => {
    expect(getTimeSlot('11:59')).toBe('morning')
  })

  it('12:00 → afternoon', () => {
    expect(getTimeSlot('12:00')).toBe('afternoon')
  })

  it('16:59 → afternoon (граница)', () => {
    expect(getTimeSlot('16:59')).toBe('afternoon')
  })

  it('17:00 → evening', () => {
    expect(getTimeSlot('17:00')).toBe('evening')
  })

  it('23:00 → evening', () => {
    expect(getTimeSlot('23:00')).toBe('evening')
  })

  it('00:00 (полночь) → morning', () => {
    expect(getTimeSlot('00:00')).toBe('morning')
  })
})

// ── getTimeSlotLabel ──

describe('Утилиты скоринга > Метки временных слотов', () => {
  it('morning → "Morning"', () => {
    expect(getTimeSlotLabel('morning')).toBe('Morning')
  })

  it('afternoon → "Afternoon"', () => {
    expect(getTimeSlotLabel('afternoon')).toBe('Afternoon')
  })

  it('evening → "Evening"', () => {
    expect(getTimeSlotLabel('evening')).toBe('Evening')
  })
})

// ── getFormatLabel ──

describe('Утилиты скоринга > Форматы игры', () => {
  it('OPEN_PLAY → "Open Play"', () => {
    expect(getFormatLabel('OPEN_PLAY')).toBe('Open Play')
  })

  it('CLINIC → "Clinic"', () => {
    expect(getFormatLabel('CLINIC')).toBe('Clinic')
  })

  it('DRILL → "Drill Session"', () => {
    expect(getFormatLabel('DRILL')).toBe('Drill Session')
  })

  it('LEAGUE_PLAY → "League Play"', () => {
    expect(getFormatLabel('LEAGUE_PLAY')).toBe('League Play')
  })

  it('SOCIAL → "Social Play"', () => {
    expect(getFormatLabel('SOCIAL')).toBe('Social Play')
  })

  it('неизвестный формат → raw value (CUSTOM_FORMAT)', () => {
    expect(getFormatLabel('CUSTOM_FORMAT')).toBe('CUSTOM_FORMAT')
  })
})

// ── inferSkillLevel ──

describe('Утилиты скоринга > Уровень навыков по DUPR', () => {
  it('DUPR < 3.0 → BEGINNER', () => {
    expect(inferSkillLevel(2.5)).toBe('BEGINNER')
    expect(inferSkillLevel(1.0)).toBe('BEGINNER')
    expect(inferSkillLevel(2.99)).toBe('BEGINNER')
  })

  it('DUPR 3.0-4.49 → INTERMEDIATE', () => {
    expect(inferSkillLevel(3.0)).toBe('INTERMEDIATE')
    expect(inferSkillLevel(3.5)).toBe('INTERMEDIATE')
    expect(inferSkillLevel(4.49)).toBe('INTERMEDIATE')
  })

  it('DUPR ≥ 4.5 → ADVANCED', () => {
    expect(inferSkillLevel(4.5)).toBe('ADVANCED')
    expect(inferSkillLevel(5.0)).toBe('ADVANCED')
    expect(inferSkillLevel(6.0)).toBe('ADVANCED')
  })

  it('null (нет рейтинга) → INTERMEDIATE', () => {
    expect(inferSkillLevel(null)).toBe('INTERMEDIATE')
  })

  it('0 (falsy) → INTERMEDIATE', () => {
    expect(inferSkillLevel(0)).toBe('INTERMEDIATE')
  })
})

// ── isAdjacentSkillLevel ──

describe('Утилиты скоринга > Смежность уровней', () => {
  it('BEGINNER ↔ INTERMEDIATE → смежные', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'INTERMEDIATE')).toBe(true)
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'BEGINNER')).toBe(true)
  })

  it('INTERMEDIATE ↔ ADVANCED → смежные', () => {
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'ADVANCED')).toBe(true)
    expect(isAdjacentSkillLevel('ADVANCED', 'INTERMEDIATE')).toBe(true)
  })

  it('BEGINNER ↔ ADVANCED → НЕ смежные', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'ADVANCED')).toBe(false)
    expect(isAdjacentSkillLevel('ADVANCED', 'BEGINNER')).toBe(false)
  })

  it('одинаковый уровень → НЕ смежный (distance = 0)', () => {
    expect(isAdjacentSkillLevel('BEGINNER', 'BEGINNER')).toBe(false)
    expect(isAdjacentSkillLevel('ADVANCED', 'ADVANCED')).toBe(false)
  })

  it('ALL_LEVELS → false (не в массиве уровней)', () => {
    expect(isAdjacentSkillLevel('ALL_LEVELS', 'BEGINNER')).toBe(false)
    expect(isAdjacentSkillLevel('INTERMEDIATE', 'ALL_LEVELS')).toBe(false)
  })
})

// ── getSkillLevelLabel ──

describe('Утилиты скоринга > Метки уровней', () => {
  it('все 4 метки: Beginner, Intermediate, Advanced, All Levels', () => {
    expect(getSkillLevelLabel('BEGINNER')).toBe('Beginner (2.5-3.0)')
    expect(getSkillLevelLabel('INTERMEDIATE')).toBe('Intermediate (3.5-4.5)')
    expect(getSkillLevelLabel('ADVANCED')).toBe('Advanced (5.0+)')
    expect(getSkillLevelLabel('ALL_LEVELS')).toBe('All Levels')
  })
})

// ── getOccupancyPercent ──

describe('Утилиты скоринга > Заполняемость сессии', () => {
  it('4/8 = 50%, 8/8 = 100%, 3/12 = 25%', () => {
    expect(getOccupancyPercent(4, 8)).toBe(50)
    expect(getOccupancyPercent(8, 8)).toBe(100)
    expect(getOccupancyPercent(3, 12)).toBe(25)
  })

  it('0/0 = 100% (деление на ноль)', () => {
    expect(getOccupancyPercent(0, 0)).toBe(100)
  })

  it('0/8 = 0% (никого нет)', () => {
    expect(getOccupancyPercent(0, 8)).toBe(0)
  })

  it('округление: 1/3 = 33%, 2/3 = 67%', () => {
    expect(getOccupancyPercent(1, 3)).toBe(33) // 33.33... → 33
    expect(getOccupancyPercent(2, 3)).toBe(67) // 66.66... → 67
  })
})

// ── daysBetween ──

describe('Утилиты скоринга > Дни между датами', () => {
  it('одна и та же дата → 0', () => {
    const d = new Date('2026-03-12')
    expect(daysBetween(d, d)).toBe(0)
  })

  it('соседние дни → 1', () => {
    expect(daysBetween(new Date('2026-03-12'), new Date('2026-03-13'))).toBe(1)
  })

  it('порядок не важен: daysBetween(a,b) = daysBetween(b,a)', () => {
    const a = new Date('2026-03-01')
    const b = new Date('2026-03-15')
    expect(daysBetween(a, b)).toBe(14)
    expect(daysBetween(b, a)).toBe(14)
  })

  it('переход через месяц: 28 фев → 1 мар = 1 день', () => {
    expect(daysBetween(new Date('2026-02-28'), new Date('2026-03-01'))).toBe(1)
  })
})

// ── clamp ──

describe('Утилиты скоринга > Clamp (ограничение диапазона)', () => {
  it('значение в диапазоне → без изменений (50 в [0,100])', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('ниже min → возвращает min (-10 → 0)', () => {
    expect(clamp(-10, 0, 100)).toBe(0)
  })

  it('выше max → возвращает max (150 → 100)', () => {
    expect(clamp(150, 0, 100)).toBe(100)
  })

  it('на границах (0 и 100) → без изменений', () => {
    expect(clamp(0, 0, 100)).toBe(0)
    expect(clamp(100, 0, 100)).toBe(100)
  })
})
