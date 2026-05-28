import { describe, expect, it } from 'vitest'

import {
  normalizeProgramTitle,
  programGroupKey,
} from '@/lib/ai/program-title-normalizer'

/**
 * Anchored to real IPC East titles (30-day sample, 2026-05).
 * The whole point: court-number / club-name / session noise collapses,
 * but skill ratings and program names survive.
 */

describe('normalizeProgramTitle', () => {
  describe('strips court assignment noise', () => {
    it('removes "— Court #N (IPC East)"', () => {
      expect(
        normalizeProgramTitle('Singles — Court #2 (IPC East)', 'IPC East'),
      ).toBe('Singles')
    })

    it('collapses court-number variants to the same title', () => {
      const a = normalizeProgramTitle('Singles — Court #2 (IPC East)', 'IPC East')
      const b = normalizeProgramTitle('Singles — Court #3 (IPC East)', 'IPC East')
      const c = normalizeProgramTitle('Singles — Court #9 (IPC East)', 'IPC East')
      expect(a).toBe('Singles')
      expect(b).toBe('Singles')
      expect(c).toBe('Singles')
    })

    it('removes court from Doubles', () => {
      expect(
        normalizeProgramTitle('Doubles — Court #6 (IPC East)', 'IPC East'),
      ).toBe('Doubles')
    })

    it('handles "Court 9" without # sign', () => {
      expect(normalizeProgramTitle('Singles - Court 4', 'IPC East')).toBe('Singles')
    })
  })

  describe('preserves semantics', () => {
    it('keeps skill rating on Open Play', () => {
      expect(
        normalizeProgramTitle('Verified Open Play - Competitive (3.5 - 3.99) ', 'IPC East'),
      ).toBe('Verified Open Play - Competitive (3.5 - 3.99)')
    })

    it('does NOT strip skill-rating parens', () => {
      const out = normalizeProgramTitle('Verified Open Play - Casual (2.5 - 2.99)', 'IPC East')
      expect(out).toContain('(2.5 - 2.99)')
    })

    it('keeps coach name, strips court', () => {
      expect(
        normalizeProgramTitle('Doubles — Emilia Quinn - Court #1', 'IPC East'),
      ).toBe('Doubles - Emilia Quinn')
    })

    it('keeps "Private Lesson for 1", strips court + club', () => {
      expect(
        normalizeProgramTitle('Private Lesson for 1 — Court #9 (IPC East)', 'IPC East'),
      ).toBe('Private Lesson for 1')
    })

    it('keeps Ball Machine name, strips court', () => {
      expect(
        normalizeProgramTitle('Single Person - Ball Machine — Court #9 (IPC East)', 'IPC East'),
      ).toBe('Single Person - Ball Machine')
    })
  })

  describe('strips league session counter', () => {
    it('removes "(Session 3)"', () => {
      expect(
        normalizeProgramTitle('Intermediate/Competitive League (Session 3)', 'IPC East'),
      ).toBe('Intermediate/Competitive League')
    })

    it('collapses different league sessions to the same program', () => {
      expect(programGroupKey('Casual League (Session 3)', 'IPC East')).toBe(
        programGroupKey('Casual League (Session 5)', 'IPC East'),
      )
    })
  })

  describe('whitespace + dashes', () => {
    it('trims trailing whitespace', () => {
      expect(normalizeProgramTitle('Open Play - 4.5+ ', 'IPC East')).toBe('Open Play - 4.5+')
    })

    it('collapses double spaces', () => {
      expect(
        normalizeProgramTitle('Verified  Open Play - Advanced  (4.0) ', 'IPC East'),
      ).toBe('Verified Open Play - Advanced (4.0)')
    })

    it('normalizes em-dash to hyphen', () => {
      expect(normalizeProgramTitle('Drills and Skills — Beginner', 'IPC East')).not.toContain('—')
    })

    it('trims dangling separators after stripping court', () => {
      // "VamosPickle Intensive Training (All Levels)" has no court — should
      // come through clean (no trailing dash).
      expect(
        normalizeProgramTitle('VamosPickle Intensive Training (All Levels)', 'IPC East'),
      ).toBe('VamosPickle Intensive Training (All Levels)')
    })
  })

  describe('edge cases', () => {
    it('empty in → empty out', () => {
      expect(normalizeProgramTitle('', 'IPC East')).toBe('')
    })

    it('null in → empty out', () => {
      expect(normalizeProgramTitle(null, 'IPC East')).toBe('')
    })

    it('works without clubName (keeps club suffix as-is)', () => {
      // No clubName passed — we don't blindly strip parens (would eat skill
      // ratings), so the club suffix stays. Court is still stripped, program
      // name preserved.
      expect(normalizeProgramTitle('Singles — Court #2 (IPC East)')).toBe('Singles (IPC East)')
    })

    it('title that is only noise collapses to empty', () => {
      expect(normalizeProgramTitle('Court #5', 'IPC East')).toBe('')
    })
  })
})

describe('programGroupKey', () => {
  it('is the lowercased normalized title', () => {
    expect(programGroupKey('Singles — Court #2 (IPC East)', 'IPC East')).toBe('singles')
  })

  it('groups case-insensitively', () => {
    expect(programGroupKey('VERIFIED Open Play', 'IPC East')).toBe(
      programGroupKey('verified open play', 'IPC East'),
    )
  })
})
