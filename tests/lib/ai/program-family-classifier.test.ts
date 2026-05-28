import { describe, expect, it } from 'vitest'

import {
  classifyProgramFamily,
  getFamilyMeta,
  VISIBLE_FAMILIES,
  ALL_FAMILIES,
  PROGRAM_FAMILY_META,
} from '@/lib/ai/program-family-classifier'

/**
 * Anchored to real IPC East titles (30-day sample, 2026-05).
 * Verifies the 8-family grouping that replaces the 7-tier framework.
 */

describe('classifyProgramFamily — real IPC East titles', () => {
  describe('OPEN_PLAY', () => {
    it('Verified Open Play - Competitive', () => {
      expect(
        classifyProgramFamily({ title: 'Verified Open Play - Competitive (3.5 - 3.99)', format: 'OPEN_PLAY' }),
      ).toBe('OPEN_PLAY')
    })
    it('Verified Open Play - Casual', () => {
      expect(classifyProgramFamily({ title: 'Verified Open Play - Casual (2.5 - 2.99)' })).toBe('OPEN_PLAY')
    })
    it('Open Play - Beginner', () => {
      expect(classifyProgramFamily({ title: 'Open Play - Beginner (2.0 - 2.49)' })).toBe('OPEN_PLAY')
    })
    it('Verified Intermediate (verified, no "open play" word)', () => {
      expect(classifyProgramFamily({ title: 'Verified Intermediate (3.0 -3.49)' })).toBe('OPEN_PLAY')
    })
    it('Open Play - 4.5+', () => {
      expect(classifyProgramFamily({ title: 'Open Play - 4.5+' })).toBe('OPEN_PLAY')
    })
  })

  describe('COURT_BOOKING (self-serve pickup)', () => {
    it('generic Singles — Court', () => {
      expect(classifyProgramFamily({ title: 'Singles — Court #4 (IPC East)', format: 'OPEN_PLAY' })).toBe('COURT_BOOKING')
    })
    it('generic Doubles — Court', () => {
      expect(classifyProgramFamily({ title: 'Doubles — Court #6 (IPC East)', format: 'OPEN_PLAY' })).toBe('COURT_BOOKING')
    })
    it('Doubles — Emilia Quinn - Court (coach-named pickup)', () => {
      expect(classifyProgramFamily({ title: 'Doubles — Emilia Quinn - Court #1', format: 'OPEN_PLAY' })).toBe('COURT_BOOKING')
    })
  })

  describe('CLINIC', () => {
    it('Drills and Skills Class', () => {
      expect(classifyProgramFamily({ title: 'Drills and Skills Class (2.0-2.99 Beginner / Casual)' })).toBe('CLINIC')
    })
    it('Pickleball IQ & Strategy', () => {
      expect(classifyProgramFamily({ title: 'Pickleball IQ & Strategy (3.5+)' })).toBe('CLINIC')
    })
    it('VamosPickle Intensive Training', () => {
      expect(classifyProgramFamily({ title: 'VamosPickle Intensive Training (All Levels)' })).toBe('CLINIC')
    })
    it('Skills Assessment', () => {
      expect(classifyProgramFamily({ title: 'Skills Assessment for (Intermediate 3.0)' })).toBe('CLINIC')
    })
  })

  describe('PRIVATE_LESSON', () => {
    it('Private Lesson for 1', () => {
      expect(classifyProgramFamily({ title: 'Private Lesson for 1 — Court #9 (IPC East)' })).toBe('PRIVATE_LESSON')
    })
    it('Private Lesson Direct Pay', () => {
      expect(classifyProgramFamily({ title: 'Private Lesson Direct Pay — Court #6 (IPC East)' })).toBe('PRIVATE_LESSON')
    })
    it('Private Lesson for 3+', () => {
      expect(classifyProgramFamily({ title: 'Private Lesson for 3+ — Court #8 (IPC East)' })).toBe('PRIVATE_LESSON')
    })
  })

  describe('LEAGUE', () => {
    it('format=LEAGUE_PLAY → League regardless of title', () => {
      expect(classifyProgramFamily({ title: 'Intermediate/Competitive League (Session 3)', format: 'LEAGUE_PLAY' })).toBe('LEAGUE')
    })
    it('Senior League by title', () => {
      expect(classifyProgramFamily({ title: 'Senior League provided by Indiana Physical Therapy', format: 'LEAGUE_PLAY' })).toBe('LEAGUE')
    })
    it('IPL Team Practice → League', () => {
      expect(classifyProgramFamily({ title: 'IPL Team Practice', format: 'OPEN_PLAY' })).toBe('LEAGUE')
    })
  })

  describe('EVENTS (signature + social + tournament merged)', () => {
    it('Round Robin', () => {
      expect(classifyProgramFamily({ title: 'Round Robin Tuesday Night' })).toBe('EVENTS')
    })
    it('Moneyball', () => {
      expect(classifyProgramFamily({ title: 'Moneyball Friday' })).toBe('EVENTS')
    })
    it('Cosmic (social)', () => {
      expect(classifyProgramFamily({ title: 'Cosmic Pickleball Night' })).toBe('EVENTS')
    })
    it('Trivia (social)', () => {
      expect(classifyProgramFamily({ title: 'Pickleball Trivia Night' })).toBe('EVENTS')
    })
    it('Tournament', () => {
      expect(classifyProgramFamily({ title: 'Spring Tournament 2026' })).toBe('EVENTS')
    })
    it('DUPR night', () => {
      expect(classifyProgramFamily({ title: 'DUPR Night 3.5+' })).toBe('EVENTS')
    })
  })

  describe('YOUTH', () => {
    it('IPC Youth Summer Clinics', () => {
      expect(classifyProgramFamily({ title: 'IPC Youth Summer Clinics 2026 (Ages 8-12)' })).toBe('YOUTH')
    })
    it('Junior beats Tournament (youth pipeline priority)', () => {
      expect(classifyProgramFamily({ title: 'Junior Tournament Saturday' })).toBe('YOUTH')
    })
    it('Kids Academy', () => {
      expect(classifyProgramFamily({ title: 'Kids Academy Mondays' })).toBe('YOUTH')
    })
  })

  describe('EQUIPMENT (hidden facility)', () => {
    it('Ball Machine', () => {
      expect(classifyProgramFamily({ title: 'Single Person - Ball Machine — Court #9 (IPC East)' })).toBe('EQUIPMENT')
    })
    it('Volley Machine (ball-machine brand) → Equipment', () => {
      expect(classifyProgramFamily({ title: 'Volley Machine — Court' })).toBe('EQUIPMENT')
    })
    it('beats everything (checked first)', () => {
      // even a "ball machine clinic" would be equipment — facility takes
      // precedence so it never inflates programming metrics.
      expect(classifyProgramFamily({ title: 'Ball Machine Court #3' })).toBe('EQUIPMENT')
    })
  })

  describe('edge cases', () => {
    it('empty title → OPEN_PLAY (safe default)', () => {
      expect(classifyProgramFamily({ title: '' })).toBe('OPEN_PLAY')
    })
    it('null title → OPEN_PLAY', () => {
      expect(classifyProgramFamily({ title: null })).toBe('OPEN_PLAY')
    })
    it('unknown named program → OPEN_PLAY (not court booking)', () => {
      expect(classifyProgramFamily({ title: 'Mystery Pickleball Thing' })).toBe('OPEN_PLAY')
    })
  })
})

describe('family metadata + helpers', () => {
  it('getFamilyMeta returns label for classified family', () => {
    const meta = getFamilyMeta({ title: 'Private Lesson for 1' })
    expect(meta.key).toBe('PRIVATE_LESSON')
    expect(meta.label).toBe('Private Lessons')
  })

  it('VISIBLE_FAMILIES excludes Equipment (hidden)', () => {
    expect(VISIBLE_FAMILIES).not.toContain('EQUIPMENT')
    expect(VISIBLE_FAMILIES.length).toBe(7)
  })

  it('ALL_FAMILIES includes Equipment, 8 total', () => {
    expect(ALL_FAMILIES).toContain('EQUIPMENT')
    expect(ALL_FAMILIES.length).toBe(8)
  })

  it('families are ordered by .order', () => {
    const orders = ALL_FAMILIES.map((f) => PROGRAM_FAMILY_META[f].order)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
  })

  it('fillRateMeaningful: false for court bookings + private + equipment', () => {
    expect(PROGRAM_FAMILY_META.COURT_BOOKING.fillRateMeaningful).toBe(false)
    expect(PROGRAM_FAMILY_META.PRIVATE_LESSON.fillRateMeaningful).toBe(false)
    expect(PROGRAM_FAMILY_META.EQUIPMENT.fillRateMeaningful).toBe(false)
    expect(PROGRAM_FAMILY_META.OPEN_PLAY.fillRateMeaningful).toBe(true)
  })
})
