import { describe, it, expect } from 'vitest'
import { buildCohortWhereClause, type CohortFilter } from '@/server/routers/intelligence'

describe('Cohort Filters — buildCohortWhereClause', () => {
  describe('Empty filters', () => {
    it('returns TRUE for no filters', () => {
      expect(buildCohortWhereClause([])).toBe('TRUE')
    })
  })

  describe('Gender filter', () => {
    it('eq male', () => {
      const result = buildCohortWhereClause([{ field: 'gender', op: 'eq', value: 'M' }])
      expect(result).toContain("u.gender = 'M'")
    })

    it('eq female', () => {
      const result = buildCohortWhereClause([{ field: 'gender', op: 'eq', value: 'F' }])
      expect(result).toContain("u.gender = 'F'")
    })
  })

  describe('Age filter', () => {
    it('gte 55 → inverts to <= for date_of_birth', () => {
      const result = buildCohortWhereClause([{ field: 'age', op: 'gte', value: 55 }])
      expect(result).toContain("u.date_of_birth IS NOT NULL")
      expect(result).toContain("<= (CURRENT_DATE - INTERVAL '55 years')")
    })

    it('lte 30 → inverts to >=', () => {
      const result = buildCohortWhereClause([{ field: 'age', op: 'lte', value: 30 }])
      expect(result).toContain(">= (CURRENT_DATE - INTERVAL '30 years')")
    })
  })

  describe('Session Format filter (NEW)', () => {
    it('generates subquery for OPEN_PLAY', () => {
      const result = buildCohortWhereClause([{ field: 'sessionFormat', op: 'eq', value: 'OPEN_PLAY' }])
      expect(result).toContain('play_session_bookings')
      expect(result).toContain('play_sessions')
      expect(result).toContain("ps.format = 'OPEN_PLAY'")
      expect(result).toContain("psb.status = 'CONFIRMED'")
    })

    it('generates subquery for CLINIC', () => {
      const result = buildCohortWhereClause([{ field: 'sessionFormat', op: 'eq', value: 'CLINIC' }])
      expect(result).toContain("ps.format = 'CLINIC'")
    })

    it('includes clubId placeholder $1', () => {
      const result = buildCohortWhereClause([{ field: 'sessionFormat', op: 'eq', value: 'LEAGUE_PLAY' }])
      expect(result).toContain('ps."clubId" = $1')
    })
  })

  describe('Day of Week filter (NEW)', () => {
    it('Monday = DOW 1', () => {
      const result = buildCohortWhereClause([{ field: 'dayOfWeek', op: 'eq', value: 'Monday' }])
      expect(result).toContain('EXTRACT(DOW FROM ps.date) = 1')
    })

    it('Wednesday = DOW 3', () => {
      const result = buildCohortWhereClause([{ field: 'dayOfWeek', op: 'eq', value: 'Wednesday' }])
      expect(result).toContain('EXTRACT(DOW FROM ps.date) = 3')
    })

    it('Sunday = DOW 0', () => {
      const result = buildCohortWhereClause([{ field: 'dayOfWeek', op: 'eq', value: 'Sunday' }])
      expect(result).toContain('EXTRACT(DOW FROM ps.date) = 0')
    })

    it('Saturday = DOW 6', () => {
      const result = buildCohortWhereClause([{ field: 'dayOfWeek', op: 'eq', value: 'Saturday' }])
      expect(result).toContain('EXTRACT(DOW FROM ps.date) = 6')
    })

    it('includes confirmed status check', () => {
      const result = buildCohortWhereClause([{ field: 'dayOfWeek', op: 'eq', value: 'Friday' }])
      expect(result).toContain("psb.status = 'CONFIRMED'")
    })
  })

  describe('UserId filter (NEW — cohort from session)', () => {
    it('in operator with array of IDs', () => {
      const result = buildCohortWhereClause([{ field: 'userId', op: 'in', value: ['user-1', 'user-2', 'user-3'] }])
      expect(result).toContain("u.id IN ('user-1','user-2','user-3')")
    })

    it('escapes single quotes in user IDs', () => {
      const result = buildCohortWhereClause([{ field: 'userId', op: 'in', value: ["user-O'Brien"] }])
      expect(result).toContain("u.id IN ('user-O''Brien')")
    })

    it('non-in operator returns TRUE (safety)', () => {
      const result = buildCohortWhereClause([{ field: 'userId', op: 'eq', value: 'user-1' }])
      expect(result).toBe('TRUE')
    })
  })

  describe('Combined filters', () => {
    it('multiple filters joined with AND', () => {
      const result = buildCohortWhereClause([
        { field: 'gender', op: 'eq', value: 'F' },
        { field: 'sessionFormat', op: 'eq', value: 'OPEN_PLAY' },
        { field: 'dayOfWeek', op: 'eq', value: 'Wednesday' },
      ])
      expect(result).toContain("u.gender = 'F'")
      expect(result).toContain("ps.format = 'OPEN_PLAY'")
      expect(result).toContain('EXTRACT(DOW FROM ps.date) = 3')
      // All three filters present in output
      expect(result).toContain(' AND ')
    })
  })

  describe('Skill Level filter', () => {
    it('in operator with multiple ranges', () => {
      const result = buildCohortWhereClause([{ field: 'skillLevel', op: 'in', value: ['3.0-3.49', '3.5-3.99'] }])
      expect(result).toContain("u.skill_level ILIKE '%3.0-3.49%'")
      expect(result).toContain("u.skill_level ILIKE '%3.5-3.99%'")
      expect(result).toContain(' OR ')
    })

    it('contains operator', () => {
      const result = buildCohortWhereClause([{ field: 'skillLevel', op: 'contains', value: 'Intermediate' }])
      expect(result).toContain("u.skill_level ILIKE '%' || 'Intermediate' || '%'")
    })
  })

  describe('SQL injection prevention', () => {
    it('escapes single quotes in string values', () => {
      const result = buildCohortWhereClause([{ field: 'city', op: 'eq', value: "O'Fallon" }])
      expect(result).toContain("O''Fallon")
      expect(result).not.toContain("O'Fallon'")
    })

    // ── Regression: age case used to interpolate f.value directly into
    // INTERVAL '${f.value} years' with no Number() coercion. A malicious
    // string could break out of the interval literal. Now coerced and
    // range-checked; hostile strings collapse to TRUE.
    it('age case rejects non-numeric value (cannot escape INTERVAL literal)', () => {
      const result = buildCohortWhereClause([
        { field: 'age', op: 'gte', value: "1' OR '1'='1" as any },
      ])
      expect(result).toBe('TRUE')
      expect(result).not.toContain("OR '1'='1")
    })

    it('age case clamps out-of-range values to TRUE', () => {
      const negative = buildCohortWhereClause([{ field: 'age', op: 'gte', value: -5 }])
      const huge = buildCohortWhereClause([{ field: 'age', op: 'gte', value: 10000 }])
      expect(negative).toBe('TRUE')
      expect(huge).toBe('TRUE')
    })

    it('age case accepts a numeric string and coerces to number', () => {
      const result = buildCohortWhereClause([{ field: 'age', op: 'gte', value: '55' }])
      expect(result).toContain("INTERVAL '55 years'")
    })

    it('frequency rejects NaN / non-finite input', () => {
      const result = buildCohortWhereClause([
        { field: 'frequency', op: 'gte', value: 'abc' as any },
      ])
      expect(result).toBe('TRUE')
    })

    it('recency rejects NaN / non-finite input', () => {
      const result = buildCohortWhereClause([
        { field: 'recency', op: 'lte', value: "x'; DROP TABLE users; --" as any },
      ])
      expect(result).toBe('TRUE')
      expect(result).not.toContain('DROP TABLE')
    })

    it('duprRating rejects NaN / out-of-range input', () => {
      const result = buildCohortWhereClause([
        { field: 'duprRating', op: 'gte', value: "'; DELETE FROM users; --" as any },
      ])
      expect(result).toBe('TRUE')
      expect(result).not.toContain('DELETE FROM')
    })

    it('unknown ops are dropped by the allowlist (not interpolated)', () => {
      const result = buildCohortWhereClause([
        { field: 'age', op: 'DROP TABLE users' as any, value: 55 },
      ])
      // op fails COHORT_ALLOWED_OPS check → filter skipped → no filters → TRUE
      expect(result).toBe('TRUE')
    })
  })

  describe('Unknown field', () => {
    it('returns TRUE for unknown fields', () => {
      const result = buildCohortWhereClause([{ field: 'unknown_field' as any, op: 'eq', value: 'test' }])
      expect(result).toBe('TRUE')
    })
  })
})
